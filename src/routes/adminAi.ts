import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { json } from '../http';
import { requireSuperadmin, verifyCsrf } from '../auth/session';
import { isZeroCostOpenRouterModel, type RoutedAiProvider } from '../ai/providerRouting';

type ProviderPolicyRow = {
  id: string;
  task_key: string;
  provider: RoutedAiProvider;
  route_role: 'primary' | 'fallback';
  priority: number;
  is_enabled: number;
  model: string;
  paid_models_enabled: number;
  max_calls_per_hour: number;
  updated_at: string;
};

type AttemptCountRow = { provider: RoutedAiProvider; count: number };

const providerLabel = (provider: RoutedAiProvider) => provider === 'workers_ai' ? 'Cloudflare Workers AI' : 'OpenRouter';

function runtimeConfigured(env: Env, provider: RoutedAiProvider): boolean {
  return provider === 'workers_ai' ? Boolean(env.AI) : Boolean(env.OPENROUTER_API_KEY?.trim());
}

async function readPolicies(db: Db): Promise<ProviderPolicyRow[]> {
  return db.all<ProviderPolicyRow>(
    `SELECT id, task_key, provider, route_role, priority, is_enabled, model,
            paid_models_enabled, max_calls_per_hour, updated_at
       FROM ai_provider_policies
      WHERE task_key = '*'
      ORDER BY CASE WHEN route_role = 'primary' THEN 0 ELSE 1 END, priority ASC`,
  );
}

export async function adminAiProviderPolicies(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  const db = new Db(requireDb(env));
  const hourStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let policies: ProviderPolicyRow[];
  let counts: AttemptCountRow[];
  try {
    [policies, counts] = await Promise.all([
      readPolicies(db),
      db.all<AttemptCountRow>(
        `SELECT provider, COUNT(*) AS count
           FROM ai_provider_attempts
          WHERE created_at >= ? AND status IN ('reserved', 'success', 'failed')
          GROUP BY provider`,
        [hourStart],
      ),
    ]);
  } catch {
    return json({
      actorUserId: auth.user.id,
      migrationRequired: true,
      migration: '0042_ai_provider_routing.sql',
      providers: [
        {
          provider: 'workers_ai', label: 'Cloudflare Workers AI', routeRole: 'primary',
          enabled: Boolean(env.AI), model: env.AI_WORKERS_MODEL || '@cf/google/gemma-4-26b-a4b-it',
          paidModelsEnabled: false, maxCallsPerHour: 250, callsLastHour: null,
          runtimeConfigured: Boolean(env.AI),
        },
        {
          provider: 'openrouter', label: 'OpenRouter', routeRole: 'fallback',
          enabled: false, model: 'openrouter/free', paidModelsEnabled: false,
          maxCallsPerHour: 25, callsLastHour: null,
          runtimeConfigured: Boolean(env.OPENROUTER_API_KEY?.trim()),
        },
      ],
    }, { headers: { 'x-robots-tag': 'noindex, nofollow' } });
  }

  const attempts = new Map(counts.map((row) => [row.provider, Number(row.count || 0)]));
  return json({
    actorUserId: auth.user.id,
    migrationRequired: false,
    migration: null,
    providers: policies.map((policy) => ({
      id: policy.id,
      provider: policy.provider,
      label: providerLabel(policy.provider),
      taskKey: policy.task_key,
      routeRole: policy.route_role,
      priority: policy.priority,
      enabled: policy.is_enabled === 1,
      model: policy.model,
      paidModelsEnabled: policy.paid_models_enabled === 1,
      maxCallsPerHour: policy.max_calls_per_hour,
      callsLastHour: attempts.get(policy.provider) || 0,
      runtimeConfigured: runtimeConfigured(env, policy.provider),
      updatedAt: policy.updated_at,
    })),
  }, { headers: { 'x-robots-tag': 'noindex, nofollow' } });
}

export async function updateAdminAiProviderPolicy(
  request: Request,
  env: Env,
  provider: string,
): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  await verifyCsrf(request, env, auth);
  if (provider !== 'workers_ai' && provider !== 'openrouter') {
    return json({ error: 'invalid_ai_provider', message: 'Provider must be workers_ai or openrouter' }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    enabled?: boolean;
    model?: string;
    paidModelsEnabled?: boolean;
    maxCallsPerHour?: number;
  };
  if (typeof body.enabled !== 'boolean') {
    return json({ error: 'invalid_ai_policy', message: 'Enabled state is required' }, { status: 400 });
  }
  const model = body.model?.trim().slice(0, 200) || '';
  if (!model) return json({ error: 'invalid_ai_model', message: 'A provider model is required' }, { status: 400 });
  const maxCalls = Number(body.maxCallsPerHour);
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 100000) {
    return json({ error: 'invalid_ai_provider_limit', message: 'Hourly provider limit must be between 1 and 100000' }, { status: 400 });
  }
  const paidModelsEnabled = provider === 'openrouter' && body.paidModelsEnabled === true;
  if (provider === 'openrouter' && !paidModelsEnabled && !isZeroCostOpenRouterModel(model)) {
    return json({
      error: 'paid_openrouter_model_disabled',
      message: 'Paid OpenRouter models are OFF. Use openrouter/free or a model ending in :free, or explicitly enable paid models.',
    }, { status: 409 });
  }

  const db = new Db(requireDb(env));
  try { await readPolicies(db); }
  catch {
    return json({
      error: 'ai_provider_migration_required',
      message: 'Apply production migration 0042 before changing AI provider routing.',
    }, { status: 409 });
  }

  const routeRole = provider === 'workers_ai' ? 'primary' : 'fallback';
  const priority = provider === 'workers_ai' ? 10 : 20;
  const policyId = provider === 'workers_ai' ? 'aip_workers_global' : 'aip_openrouter_global';
  const now = new Date().toISOString();
  await db.batch([
    db.statement(
      `INSERT INTO ai_provider_policies
        (id, task_key, provider, route_role, priority, is_enabled, model, paid_models_enabled,
         max_calls_per_hour, created_by_user_id, updated_by_user_id, created_at, updated_at)
       VALUES (?, '*', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(task_key, provider) DO UPDATE SET
         route_role = excluded.route_role,
         priority = excluded.priority,
         is_enabled = excluded.is_enabled,
         model = excluded.model,
         paid_models_enabled = excluded.paid_models_enabled,
         max_calls_per_hour = excluded.max_calls_per_hour,
         updated_by_user_id = excluded.updated_by_user_id,
         updated_at = excluded.updated_at`,
      [
        policyId, provider, routeRole, priority, body.enabled ? 1 : 0, model,
        paidModelsEnabled ? 1 : 0, maxCalls, auth.user.id, auth.user.id, now, now,
      ],
    ),
    db.statement(
      `INSERT INTO audit_logs
        (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'superadmin', 'ai.provider_policy.updated', 'ai_provider_policy', ?, NULL, ?, ?)`,
      [
        `aud_${crypto.randomUUID().replace(/-/g, '')}`,
        auth.user.id,
        policyId,
        JSON.stringify({
          provider,
          routeRole,
          enabled: body.enabled,
          model,
          paidModelsEnabled,
          maxCallsPerHour: maxCalls,
          runtimeConfigured: runtimeConfigured(env, provider),
        }),
        now,
      ],
    ),
  ]);
  return json({
    ok: true,
    provider,
    routeRole,
    enabled: body.enabled,
    model,
    paidModelsEnabled,
    maxCallsPerHour: maxCalls,
    runtimeConfigured: runtimeConfigured(env, provider),
  });
}
