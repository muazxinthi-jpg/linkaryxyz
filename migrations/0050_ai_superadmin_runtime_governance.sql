-- LinkaryAI runtime governance controlled by Superadmin.
-- Secrets remain runtime bindings. This schema stores only operational policy.

CREATE TABLE IF NOT EXISTS ai_runtime_settings (
  id TEXT PRIMARY KEY CHECK (id = 'global'),
  ai_enabled INTEGER NOT NULL DEFAULT 1 CHECK (ai_enabled IN (0, 1)),
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO ai_runtime_settings
  (id, ai_enabled, updated_by_user_id, created_at, updated_at)
VALUES
  ('global', 1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE IF NOT EXISTS ai_provider_model_policies (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('workers_ai', 'gemini', 'groq', 'openrouter')),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 200),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 9999),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (provider, model)
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_model_policies_runtime
  ON ai_provider_model_policies (is_active, priority, provider, model);

-- No model rows are seeded intentionally. Until Superadmin saves an explicit
-- model policy, runtime preserves the existing environment-configured provider
-- chain. Once any policy row exists, the table becomes the allowlist authority.
