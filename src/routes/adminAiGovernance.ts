import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { requireSuperadmin, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';
import { aiProviderConfiguration, loadAiRuntimeGovernance, type AiProviderConfiguration } from '../ai/governance';
import { probeAiProvider, type AiProvider } from '../ai/LinkaryAI';

const PROVIDERS = new Set<AiProvider>(['workers_ai', 'gemini', 'groq', 'openrouter']);
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

type PolicyRow = {
  id: string;
  provider: AiProvider;
  model: string;
  is_active: number;
  priority: number;
  updated_at: string;
};

type SettingsRow = {
  ai_enabled: number;
  updated_at: string;
};

type PolicyInput = {
  provider?: unknown;
  model?: unknown;
  isActive?: unknown;
  priority?: unknown;
};

type GovernanceInput = {
  aiEnabled?: unknown;
  policies?: unknown;
};

function noStore() {
  return { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow, noarchive' };
}

function cleanProvider(value: unknown): AiProvider {
  if (typeof value !== 'string' || !PROVIDERS.has(value as AiProvider)) {
    throw new HttpError(400, 'AI provider is invalid', 'ai_governance_provider_invalid');
  }
  return value as AiProvider;
}

function cleanModel(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'AI model is required', 'ai_governance_model_required');
  const model = value.trim();
  if (!model || model.length > 200 || /\s/.test(model)) {
    throw new HttpError(400, 'AI model must be a model ID of 1 to 200 characters without whitespace', 'ai_governance_model_invalid');
  }
  return model;
}

function cleanPriority(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 9999) {
    throw new HttpError(400, 'AI model priority must be an integer between 1 and 9999', 'ai_governance_priority_invalid');
  }
  return value;
}

function cleanActive(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new HttpError(400, 'AI model active state must be true or false', 'ai_governance_active_invalid');
  return value;
}

async function governanceState(db: Db, env: Env) {
  const settings = await db.first<SettingsRow>(
    `SELECT ai_enabled, updated_at FROM ai_runtime_settings WHERE id = 'global' LIMIT 1`,
  );
  const policies = await db.all<PolicyRow>(
    `SELECT id, provider, model, is_active, priority, updated_at
       FROM ai_provider_model_policies
      ORDER BY priority ASC, provider ASC, model ASC`,
  );
  const providerConfiguration: AiProviderConfiguration[] = aiProviderConfiguration(env);
  return {
    aiEnabled: settings ? settings.ai_enabled === 1 : true,
    updatedAt: settings?.updated_at || null,
    explicitModelPolicy: policies.length > 0,
    providers: providerConfiguration,
    policies: policies.map((row) => ({
      id: row.id,
      provider: row.provider,
      model: row.model,
      isActive: row.is_active === 1,
      priority: row.priority,
      configured: providerConfiguration.find((item) => item.provider === row.provider)?.configured || false,
      updatedAt: row.updated_at,
    })),
  };
}

export async function adminAiGovernance(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  const db = new Db(requireDb(env));

  if (request.method === 'GET') {
    return json(await governanceState(db, env), { headers: noStore() });
  }

  if (request.method === 'POST') {
    await verifyCsrf(request, env, auth);
    const runtime = await loadAiRuntimeGovernance(db, env);
    const probes = [];
    for (const provider of runtime.providers) probes.push(await probeAiProvider(env, provider));
    return json({
      ok: true,
      explicitModelPolicy: runtime.explicitModelPolicy,
      probes,
    }, { headers: noStore() });
  }

  if (request.method !== 'PATCH') throw new HttpError(405, 'Method not allowed', 'method_not_allowed');
  await verifyCsrf(request, env, auth);
  const input = await readJson<GovernanceInput>(request);
  const hasMasterChange = input.aiEnabled !== undefined;
  const hasPolicies = input.policies !== undefined;
  if (!hasMasterChange && !hasPolicies) {
    throw new HttpError(400, 'No AI governance changes were supplied', 'ai_governance_change_required');
  }
  if (hasMasterChange && typeof input.aiEnabled !== 'boolean') {
    throw new HttpError(400, 'AI master switch must be true or false', 'ai_governance_master_invalid');
  }
  if (hasPolicies && !Array.isArray(input.policies)) {
    throw new HttpError(400, 'AI model policies must be an array', 'ai_governance_policies_invalid');
  }

  const policies = (Array.isArray(input.policies) ? input.policies : []).map((item) => {
    if (!item || typeof item !== 'object') throw new HttpError(400, 'AI model policy is invalid', 'ai_governance_policy_invalid');
    const row = item as PolicyInput;
    return {
      provider: cleanProvider(row.provider),
      model: cleanModel(row.model),
      isActive: cleanActive(row.isActive),
      priority: cleanPriority(row.priority),
    };
  });
  const seen = new Set<string>();
  for (const row of policies) {
    const key = `${row.provider}:${row.model}`;
    if (seen.has(key)) throw new HttpError(400, 'Duplicate provider/model policy supplied', 'ai_governance_policy_duplicate');
    seen.add(key);
  }

  const now = new Date().toISOString();
  const statements = [];
  if (hasMasterChange) {
    statements.push(db.statement(
      `INSERT INTO ai_runtime_settings (id, ai_enabled, updated_by_user_id, created_at, updated_at)
       VALUES ('global', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET ai_enabled = excluded.ai_enabled,
         updated_by_user_id = excluded.updated_by_user_id, updated_at = excluded.updated_at`,
      [input.aiEnabled ? 1 : 0, auth.user.id, now, now],
    ));
  }
  for (const row of policies) {
    statements.push(db.statement(
      `INSERT INTO ai_provider_model_policies
        (id, provider, model, is_active, priority, created_by_user_id, updated_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, model) DO UPDATE SET
         is_active = excluded.is_active, priority = excluded.priority,
         updated_by_user_id = excluded.updated_by_user_id, updated_at = excluded.updated_at`,
      [newId('aip'), row.provider, row.model, row.isActive ? 1 : 0, row.priority, auth.user.id, auth.user.id, now, now],
    ));
  }
  statements.push(db.statement(
    `INSERT INTO audit_logs
      (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
     VALUES (?, ?, 'superadmin', 'ai.governance.updated', 'ai_runtime_governance', 'global', NULL, ?, ?)`,
    [
      newId('aud'), auth.user.id,
      JSON.stringify({
        ...(hasMasterChange ? { aiEnabled: input.aiEnabled } : {}),
        policies: policies.map((row) => ({ provider: row.provider, model: row.model, isActive: row.isActive, priority: row.priority })),
      }),
      now,
    ],
  ));
  await db.batch(statements);

  return json({ ok: true, ...(await governanceState(db, env)) }, { headers: noStore() });
}
