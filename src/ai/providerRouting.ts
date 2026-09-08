import type { Env } from '../env';
import type { Db } from '../db/client';

export type RoutedAiProvider = 'workers_ai' | 'openrouter';
export type AiProviderRouteRole = 'primary' | 'fallback';

export type AiProviderChoice = {
  policyId: string;
  taskKey: string;
  provider: RoutedAiProvider;
  routeRole: AiProviderRouteRole;
  priority: number;
  model: string;
  paidModelsEnabled: boolean;
  maxCallsPerHour: number;
};

type PolicyRow = {
  id: string;
  task_key: string;
  provider: RoutedAiProvider;
  route_role: AiProviderRouteRole;
  priority: number;
  is_enabled: number;
  model: string;
  paid_models_enabled: number;
  max_calls_per_hour: number;
};

const WORKERS_DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';

function cleanModel(value: string | undefined | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 200) : null;
}

export function isZeroCostOpenRouterModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized === 'openrouter/free' || /:free$/.test(normalized);
}

export function providerRuntimeConfigured(env: Env, provider: RoutedAiProvider): boolean {
  if (provider === 'workers_ai') return Boolean(env.AI);
  return Boolean(env.OPENROUTER_API_KEY?.trim());
}

function rowToChoice(row: PolicyRow): AiProviderChoice {
  return {
    policyId: row.id,
    taskKey: row.task_key,
    provider: row.provider,
    routeRole: row.route_role,
    priority: Number(row.priority || 0),
    model: cleanModel(row.model) || (row.provider === 'workers_ai' ? WORKERS_DEFAULT_MODEL : 'openrouter/free'),
    paidModelsEnabled: row.paid_models_enabled === 1,
    maxCallsPerHour: Math.max(1, Number(row.max_calls_per_hour || 1)),
  };
}

function legacyWorkersRoute(env: Env): AiProviderChoice[] {
  if (!env.AI) return [];
  return [{
    policyId: 'legacy-workers-ai',
    taskKey: '*',
    provider: 'workers_ai',
    routeRole: 'primary',
    priority: 10,
    model: cleanModel(env.AI_WORKERS_MODEL) || WORKERS_DEFAULT_MODEL,
    paidModelsEnabled: false,
    maxCallsPerHour: 250,
  }];
}

export async function resolveAiProviderRoute(db: Db, env: Env, taskKey: string): Promise<AiProviderChoice[]> {
  let rows: PolicyRow[];
  try {
    rows = await db.all<PolicyRow>(
      `SELECT id, task_key, provider, route_role, priority, is_enabled, model,
              paid_models_enabled, max_calls_per_hour
         FROM ai_provider_policies
        WHERE task_key IN (?, '*')
          AND is_enabled = 1
        ORDER BY
          CASE WHEN task_key = ? THEN 0 ELSE 1 END,
          CASE WHEN route_role = 'primary' THEN 0 ELSE 1 END,
          priority ASC`,
      [taskKey, taskKey],
    );
  } catch {
    // Migration-safe deployment: before 0042 is applied, keep the existing
    // Workers AI path alive. OpenRouter never becomes active implicitly.
    return legacyWorkersRoute(env);
  }

  const seen = new Set<RoutedAiProvider>();
  const route: AiProviderChoice[] = [];
  for (const row of rows) {
    if (seen.has(row.provider)) continue;
    seen.add(row.provider);
    const choice = rowToChoice(row);
    if (!providerRuntimeConfigured(env, choice.provider)) continue;
    if (choice.provider === 'openrouter' && !choice.paidModelsEnabled && !isZeroCostOpenRouterModel(choice.model)) continue;
    route.push(choice);
  }

  return route.sort((a, b) => {
    if (a.routeRole !== b.routeRole) return a.routeRole === 'primary' ? -1 : 1;
    return a.priority - b.priority;
  });
}

const attemptId = () => `aipa_${crypto.randomUUID().replace(/-/g, '')}`;

export async function reserveProviderAttempt(
  db: Db,
  usageEventId: string,
  taskKey: string,
  choice: AiProviderChoice,
  attemptOrder: number,
): Promise<string | null> {
  const id = attemptId();
  const now = new Date();
  const createdAt = now.toISOString();
  const hourStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  try {
    await db.run(
      `INSERT INTO ai_provider_attempts
        (id, usage_event_id, task_key, provider, model, attempt_order, status,
         error_code, latency_ms, created_at, completed_at)
       SELECT ?, ?, ?, ?, ?, ?, 'reserved', NULL, NULL, ?, NULL
        WHERE (
          SELECT COUNT(*) FROM ai_provider_attempts
           WHERE provider = ?
             AND created_at >= ?
             AND status IN ('reserved', 'success', 'failed')
        ) < ?`,
      [
        id, usageEventId, taskKey, choice.provider, choice.model, attemptOrder,
        createdAt, choice.provider, hourStart, choice.maxCallsPerHour,
      ],
    );
    const row = await db.first<{ id: string }>('SELECT id FROM ai_provider_attempts WHERE id = ?', [id]);
    return row?.id || null;
  } catch {
    // Before migration 0042 exists there is no provider-attempt ledger. The
    // route itself is already migration-safe, so do not break the legacy path.
    if (choice.policyId === 'legacy-workers-ai') return `legacy:${id}`;
    throw new Error('ai_provider_attempt_ledger_unavailable');
  }
}

export async function completeProviderAttempt(
  db: Db,
  attemptIdValue: string,
  status: 'success' | 'failed',
  latencyMs: number,
  errorCode?: string | null,
): Promise<void> {
  if (attemptIdValue.startsWith('legacy:')) return;
  const completedAt = new Date().toISOString();
  await db.run(
    `UPDATE ai_provider_attempts
        SET status = ?, error_code = ?, latency_ms = ?, completed_at = ?
      WHERE id = ? AND status = 'reserved'`,
    [status, errorCode?.slice(0, 80) || null, Math.max(0, Math.floor(latencyMs)), completedAt, attemptIdValue],
  );
}
