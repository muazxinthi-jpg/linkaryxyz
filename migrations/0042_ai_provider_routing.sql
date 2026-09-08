-- LinkaryAI Provider Routing V1.1
-- Technical Paper 60.8: Workers AI primary, OpenRouter secondary/optional fallback.
-- OpenRouter is seeded OFF and paid model routing is OFF by default.

CREATE TABLE IF NOT EXISTS ai_provider_policies (
  id TEXT PRIMARY KEY,
  task_key TEXT NOT NULL DEFAULT '*',
  provider TEXT NOT NULL CHECK (provider IN ('workers_ai', 'openrouter')),
  route_role TEXT NOT NULL CHECK (route_role IN ('primary', 'fallback')),
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0 AND priority <= 1000),
  is_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)),
  model TEXT NOT NULL,
  paid_models_enabled INTEGER NOT NULL DEFAULT 0 CHECK (paid_models_enabled IN (0, 1)),
  max_calls_per_hour INTEGER NOT NULL DEFAULT 100 CHECK (max_calls_per_hour >= 1 AND max_calls_per_hour <= 100000),
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (task_key, provider)
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_policies_route
  ON ai_provider_policies(task_key, is_enabled, route_role, priority);

CREATE TABLE IF NOT EXISTS ai_provider_attempts (
  id TEXT PRIMARY KEY,
  usage_event_id TEXT NOT NULL,
  task_key TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('workers_ai', 'openrouter')),
  model TEXT NOT NULL,
  attempt_order INTEGER NOT NULL CHECK (attempt_order >= 1 AND attempt_order <= 10),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'success', 'failed', 'blocked')),
  error_code TEXT,
  latency_ms INTEGER,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (usage_event_id) REFERENCES ai_usage_events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_attempts_provider_time
  ON ai_provider_attempts(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_provider_attempts_usage
  ON ai_provider_attempts(usage_event_id, attempt_order);

INSERT OR IGNORE INTO ai_provider_policies
  (id, task_key, provider, route_role, priority, is_enabled, model, paid_models_enabled,
   max_calls_per_hour, created_by_user_id, updated_by_user_id, created_at, updated_at)
VALUES
  ('aip_workers_global', '*', 'workers_ai', 'primary', 10, 1,
   '@cf/google/gemma-4-26b-a4b-it', 0, 250, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aip_openrouter_global', '*', 'openrouter', 'fallback', 20, 0,
   'openrouter/free', 0, 25, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
