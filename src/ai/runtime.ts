import type { Env } from '../env';
import { requireDb, ServiceConfigurationError } from '../env';
import { Db } from '../db/client';
import { HttpError } from '../http';
import { LinkaryAI, LinkaryAiProviderError } from './LinkaryAI';
import { AI_TASKS, type AiTaskKey } from './tasks';

type OwnerType = 'user' | 'organization';

type PromptRow = {
  prompt_key: string;
  version: number;
  system_prompt: string;
  user_template: string;
};

type BudgetRow = {
  id: string;
  scope_type: 'global' | 'user' | 'organization';
  scope_id: string;
  task_key: string;
  period_seconds: number;
  max_calls: number;
  max_usage_credits: number;
};

type UsageRow = { id: string; status: 'reserved' | 'success' | 'failed' };

type ExecuteAiInput = {
  actorUserId: string;
  ownerType: OwnerType;
  ownerId: string;
  profileId?: string | null;
  organizationId?: string | null;
  taskKey: AiTaskKey;
  input: string;
  evidenceRefs?: string[];
  idempotencyKey: string;
};

export type ExecuteAiResult = {
  eventId: string;
  taskKey: AiTaskKey;
  promptKey: string;
  promptVersion: number;
  provider: string;
  model: string;
  text: string;
  usageCredits: number;
  inputUnits: number | null;
  outputUnits: number | null;
  latencyMs: number;
};

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const RESERVATION_TTL_MS = 15 * 60 * 1000;

function safeEvidenceRefs(values: string[] | undefined): string[] {
  if (!values) return [];
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .filter((value) => value.length <= 200)
    .slice(0, 50);
}

function requireExecutionInput(input: ExecuteAiInput): { text: string; evidenceRefs: string[]; idempotencyKey: string } {
  const task = AI_TASKS[input.taskKey];
  const text = input.input.trim();
  if (!text) throw new HttpError(400, 'AI input is required', 'ai_input_required');
  if (text.length > task.maxInputChars) throw new HttpError(413, 'AI input exceeds the task limit', 'ai_input_too_large');
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) throw new HttpError(400, 'AI idempotency key is required', 'ai_idempotency_required');
  return { text, evidenceRefs: safeEvidenceRefs(input.evidenceRefs), idempotencyKey };
}

async function activePrompt(db: Db, promptKey: string): Promise<PromptRow> {
  const prompt = await db.first<PromptRow>(
    `SELECT prompt_key, version, system_prompt, user_template
       FROM ai_prompt_versions
      WHERE prompt_key = ? AND status = 'active'
      ORDER BY version DESC
      LIMIT 1`,
    [promptKey],
  );
  if (!prompt) throw new ServiceConfigurationError('Linkary AI prompt registry is not configured');
  return prompt;
}

async function activeBudget(db: Db, ownerType: OwnerType, ownerId: string, taskKey: string): Promise<BudgetRow> {
  const budget = await db.first<BudgetRow>(
    `SELECT id, scope_type, scope_id, task_key, period_seconds, max_calls, max_usage_credits
       FROM ai_budget_policies
      WHERE is_active = 1
        AND task_key IN (?, '*')
        AND ((scope_type = ? AND scope_id = ?) OR (scope_type = 'global' AND scope_id = '*'))
      ORDER BY
        CASE WHEN scope_type = ? AND scope_id = ? THEN 0 ELSE 1 END,
        CASE WHEN task_key = ? THEN 0 ELSE 1 END
      LIMIT 1`,
    [taskKey, ownerType, ownerId, ownerType, ownerId, taskKey],
  );
  if (!budget) throw new ServiceConfigurationError('Linkary AI budget policy is not configured');
  return budget;
}

async function reserveUsage(
  db: Db,
  input: ExecuteAiInput,
  prompt: PromptRow,
  budget: BudgetRow,
  provider: string,
  model: string,
  credits: number,
  evidenceRefs: string[],
  idempotencyKey: string,
): Promise<string> {
  const eventId = id('aiu');
  const nowMs = Date.now();
  const createdAt = new Date(nowMs).toISOString();
  const periodStart = new Date(nowMs - budget.period_seconds * 1000).toISOString();
  const reservationFreshAfter = new Date(nowMs - RESERVATION_TTL_MS).toISOString();
  const scopeType = budget.scope_type;
  const scopeOwnerType = input.ownerType;
  const scopeOwnerId = input.ownerId;
  const budgetTask = budget.task_key;

  await db.run(
    `INSERT INTO ai_usage_events
      (id, actor_user_id, owner_type, owner_id, profile_id, organization_id, task_key,
       prompt_key, prompt_version, provider, model, status, usage_credits, input_units,
       output_units, latency_ms, error_code, evidence_refs_json, idempotency_key, created_at, completed_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, NULL, NULL, NULL, NULL, ?, ?, ?, NULL
      WHERE
        (SELECT COUNT(*)
           FROM ai_usage_events
          WHERE created_at >= ?
            AND (? = '*' OR task_key = ?)
            AND (? = 'global' OR (owner_type = ? AND owner_id = ?))
            AND (status = 'success' OR (status = 'reserved' AND created_at >= ?))) < ?
        AND
        (SELECT COALESCE(SUM(usage_credits), 0)
           FROM ai_usage_events
          WHERE created_at >= ?
            AND (? = '*' OR task_key = ?)
            AND (? = 'global' OR (owner_type = ? AND owner_id = ?))
            AND (status = 'success' OR (status = 'reserved' AND created_at >= ?))) + ? <= ?
        AND
        (SELECT COALESCE(SUM(amount), 0)
           FROM usage_credit_ledger
          WHERE owner_type = ? AND owner_id = ?)
        -
        (SELECT COALESCE(SUM(usage_credits), 0)
           FROM ai_usage_events
          WHERE owner_type = ? AND owner_id = ?
            AND status = 'reserved' AND created_at >= ?) >= ?`,
    [
      eventId, input.actorUserId, input.ownerType, input.ownerId, input.profileId || null,
      input.organizationId || (input.ownerType === 'organization' ? input.ownerId : null),
      input.taskKey, prompt.prompt_key, prompt.version, provider, model, credits,
      JSON.stringify(evidenceRefs), idempotencyKey, createdAt,
      periodStart, budgetTask, input.taskKey, scopeType, scopeOwnerType, scopeOwnerId, reservationFreshAfter, budget.max_calls,
      periodStart, budgetTask, input.taskKey, scopeType, scopeOwnerType, scopeOwnerId, reservationFreshAfter, credits, budget.max_usage_credits,
      input.ownerType, input.ownerId,
      input.ownerType, input.ownerId, reservationFreshAfter, credits,
    ],
  );

  const reserved = await db.first<UsageRow>(`SELECT id, status FROM ai_usage_events WHERE id = ?`, [eventId]);
  if (reserved) return eventId;

  const duplicate = await db.first<UsageRow>(`SELECT id, status FROM ai_usage_events WHERE idempotency_key = ?`, [idempotencyKey]);
  if (duplicate) throw new HttpError(409, 'This AI request has already been submitted', 'ai_duplicate_request');

  const balance = await db.first<{ balance: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS balance FROM usage_credit_ledger WHERE owner_type = ? AND owner_id = ?`,
    [input.ownerType, input.ownerId],
  );
  if (Number(balance?.balance || 0) < credits) throw new HttpError(409, 'Not enough Usage Credits for this AI action', 'usage_credits_insufficient');
  throw new HttpError(429, 'Linkary AI usage budget has been reached. Try again later.', 'ai_budget_exhausted');
}

async function markFailure(db: Db, eventId: string, actorUserId: string, organizationId: string | null, errorCode: string): Promise<void> {
  const completedAt = new Date().toISOString();
  await db.batch([
    db.statement(
      `UPDATE ai_usage_events
          SET status = 'failed', error_code = ?, completed_at = ?
        WHERE id = ? AND status = 'reserved'`,
      [errorCode.slice(0, 80), completedAt, eventId],
    ),
    db.statement(
      `INSERT INTO audit_logs
        (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'user', 'ai.invocation_failed', 'ai_usage_event', ?, ?, ?, ?)`,
      [id('aud'), actorUserId, eventId, organizationId, JSON.stringify({ errorCode: errorCode.slice(0, 80) }), completedAt],
    ),
  ]);
}

async function markSuccess(
  db: Db,
  input: ExecuteAiInput,
  eventId: string,
  provider: string,
  model: string,
  prompt: PromptRow,
  credits: number,
  evidenceRefCount: number,
  result: { inputUnits: number | null; outputUnits: number | null; latencyMs: number },
): Promise<void> {
  const completedAt = new Date().toISOString();
  const organizationId = input.organizationId || (input.ownerType === 'organization' ? input.ownerId : null);
  await db.batch([
    db.statement(
      `UPDATE ai_usage_events
          SET status = 'success', input_units = ?, output_units = ?, latency_ms = ?, completed_at = ?
        WHERE id = ? AND status = 'reserved'`,
      [result.inputUnits, result.outputUnits, result.latencyMs, completedAt, eventId],
    ),
    db.statement(
      `INSERT INTO usage_credit_ledger
        (id, owner_type, owner_id, transaction_type, amount, reason, feature_key, provider,
         related_id, idempotency_key, created_by_user_id, created_at)
       VALUES (?, ?, ?, 'usage', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id('ucl'), input.ownerType, input.ownerId, -credits, `Linkary AI: ${input.taskKey}`,
        input.taskKey, provider, eventId, `ai-usage:${eventId}`, input.actorUserId, completedAt,
      ],
    ),
    db.statement(
      `INSERT INTO audit_logs
        (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at)
       VALUES (?, ?, 'user', 'ai.invoked', 'ai_usage_event', ?, ?, ?, ?)`,
      [
        id('aud'), input.actorUserId, eventId, organizationId,
        JSON.stringify({
          taskKey: input.taskKey,
          promptKey: prompt.prompt_key,
          promptVersion: prompt.version,
          provider,
          model,
          usageCredits: credits,
          evidenceRefCount,
          inputUnits: result.inputUnits,
          outputUnits: result.outputUnits,
          latencyMs: result.latencyMs,
        }),
        completedAt,
      ],
    ),
  ]);
}

export async function executeLinkaryAI(env: Env, input: ExecuteAiInput): Promise<ExecuteAiResult> {
  const normalized = requireExecutionInput(input);
  const db = new Db(requireDb(env));
  const task = AI_TASKS[input.taskKey];
  const prompt = await activePrompt(db, task.promptKey);
  const budget = await activeBudget(db, input.ownerType, input.ownerId, input.taskKey);
  const ai = new LinkaryAI(env);
  const provider = ai.provider();
  const eventId = await reserveUsage(
    db, input, prompt, budget, provider.provider, provider.model,
    task.usageCredits, normalized.evidenceRefs, normalized.idempotencyKey,
  );

  const evidenceSuffix = normalized.evidenceRefs.length
    ? `\n\nLinkary evidence references: ${normalized.evidenceRefs.join(', ')}`
    : '\n\nLinkary evidence references: none supplied';
  const userPrompt = `${prompt.user_template.replace('{{input}}', normalized.text)}${evidenceSuffix}`;

  try {
    const result = await ai.generate({ system: prompt.system_prompt, user: userPrompt, maxOutputTokens: task.maxOutputTokens });
    await markSuccess(db, input, eventId, result.provider, result.model, prompt, task.usageCredits, normalized.evidenceRefs.length, result);
    return {
      eventId,
      taskKey: input.taskKey,
      promptKey: prompt.prompt_key,
      promptVersion: prompt.version,
      provider: result.provider,
      model: result.model,
      text: result.text,
      usageCredits: task.usageCredits,
      inputUnits: result.inputUnits,
      outputUnits: result.outputUnits,
      latencyMs: result.latencyMs,
    };
  } catch (error) {
    const errorCode = error instanceof LinkaryAiProviderError ? error.code : 'ai_execution_failed';
    try {
      await markFailure(db, eventId, input.actorUserId, input.organizationId || (input.ownerType === 'organization' ? input.ownerId : null), errorCode);
    } catch {
      // Preserve the original provider/runtime failure. AI failure auditing must never expose request content or secrets.
    }
    throw error;
  }
}
