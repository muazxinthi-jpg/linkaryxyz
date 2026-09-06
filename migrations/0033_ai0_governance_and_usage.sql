CREATE TABLE IF NOT EXISTS ai_prompt_versions (
  id TEXT PRIMARY KEY NOT NULL,
  prompt_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  purpose TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  user_template TEXT NOT NULL,
  output_contract_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'retired')),
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (prompt_key, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_prompt_versions_one_active
  ON ai_prompt_versions(prompt_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_history
  ON ai_prompt_versions(prompt_key, version DESC);

CREATE TABLE IF NOT EXISTS ai_budget_policies (
  id TEXT PRIMARY KEY NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'plan', 'user', 'organization')),
  scope_id TEXT NOT NULL DEFAULT '*',
  task_key TEXT NOT NULL DEFAULT '*',
  period_seconds INTEGER NOT NULL CHECK (period_seconds >= 60),
  max_calls INTEGER NOT NULL CHECK (max_calls >= 1),
  max_usage_credits INTEGER NOT NULL CHECK (max_usage_credits >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (scope_type, scope_id, task_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_budget_policies_lookup
  ON ai_budget_policies(scope_type, scope_id, task_key, is_active);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'organization')),
  owner_id TEXT NOT NULL,
  profile_id TEXT REFERENCES profiles(id),
  organization_id TEXT REFERENCES organizations(id),
  task_key TEXT NOT NULL,
  prompt_key TEXT NOT NULL,
  prompt_version INTEGER NOT NULL CHECK (prompt_version >= 1),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'success', 'failed')),
  usage_credits INTEGER NOT NULL DEFAULT 0 CHECK (usage_credits >= 0),
  input_units INTEGER CHECK (input_units IS NULL OR input_units >= 0),
  output_units INTEGER CHECK (output_units IS NULL OR output_units >= 0),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  error_code TEXT,
  evidence_refs_json TEXT NOT NULL DEFAULT '[]',
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_owner
  ON ai_usage_events(owner_type, owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_task
  ON ai_usage_events(task_key, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_provider
  ON ai_usage_events(provider, created_at DESC);

-- Usage-credit consumption must fail closed even if two provider calls finish at nearly the same time.
CREATE TRIGGER IF NOT EXISTS trg_usage_credit_no_negative_ai_usage_before_insert
BEFORE INSERT ON usage_credit_ledger
WHEN NEW.transaction_type = 'usage'
 AND NEW.amount < 0
 AND (SELECT COALESCE(SUM(amount), 0)
        FROM usage_credit_ledger
       WHERE owner_type = NEW.owner_type
         AND owner_id = NEW.owner_id) + NEW.amount < 0
BEGIN
  SELECT RAISE(ABORT, 'usage_credit_balance_insufficient');
END;

-- AI-0 prompt versions are immutable. Changes are introduced as a new version.
INSERT OR IGNORE INTO ai_prompt_versions
  (id, prompt_key, version, purpose, system_prompt, user_template, output_contract_json, status, created_by_user_id, created_at)
VALUES
  (
    'aip_profile_improve_v1',
    'profile_improve',
    1,
    'Improve a Linkary Personal Profile or Project Profile using only supplied profile evidence.',
    'You are LinkaryAI. Improve clarity and presentation using only the supplied Linkary evidence. Never invent metrics, relationships, verification, customers, campaigns, credentials or outcomes. Preserve the evidence confidence level exactly. Manual, Tracked, Correlated and Verified are distinct states and you must never upgrade one into another. If evidence is missing, say that it is unavailable instead of guessing.',
    '{{input}}',
    '{"type":"text","evidence_required":true}',
    'active',
    NULL,
    '2026-09-06T00:00:00.000Z'
  ),
  (
    'aip_campaign_brief_v1',
    'campaign_brief_assist',
    1,
    'Help a Project structure a campaign brief without manufacturing performance claims.',
    'You are LinkaryAI. Help structure the supplied campaign brief. Use only the supplied Project, campaign and partner context. Do not invent budget, deliverables, creator commitments, audience size, performance, verification or outcomes. Clearly distinguish requested work from completed work and evidence from recommendations.',
    '{{input}}',
    '{"type":"text","evidence_required":true}',
    'active',
    NULL,
    '2026-09-06T00:00:00.000Z'
  ),
  (
    'aip_match_explanation_v1',
    'match_explanation',
    1,
    'Explain why an existing Linkary partner may fit a Project using evidence-backed relationship context.',
    'You are LinkaryAI. Explain matches only from supplied Linkary evidence and relationship history. Never create a reputation score or imply performance that is not supported. Distinguish verified or tracked evidence from manual or incomplete evidence and state when the available evidence is insufficient.',
    '{{input}}',
    '{"type":"text","evidence_required":true}',
    'active',
    NULL,
    '2026-09-06T00:00:00.000Z'
  ),
  (
    'aip_growth_summary_v1',
    'growth_summary',
    1,
    'Summarize Project growth evidence without changing attribution confidence.',
    'You are LinkaryAI. Summarize the supplied Linkary growth evidence. Never infer conversions, ROI, partner performance or causality that is not present in the evidence. Keep Manual, Tracked, Correlated and Verified evidence separate. Missing denominators or attribution must remain unavailable, not estimated unless the source explicitly labels an estimate.',
    '{{input}}',
    '{"type":"text","evidence_required":true}',
    'active',
    NULL,
    '2026-09-06T00:00:00.000Z'
  );

-- Controlled Beta platform-wide circuit breaker. Usage Credits remain the per-owner allowance.
INSERT OR IGNORE INTO ai_budget_policies
  (id, scope_type, scope_id, task_key, period_seconds, max_calls, max_usage_credits, is_active, created_by_user_id, created_at, updated_at)
VALUES
  ('aib_beta_global', 'global', '*', '*', 3600, 250, 2500, 1, NULL, '2026-09-06T00:00:00.000Z', '2026-09-06T00:00:00.000Z');