import type { D1Database } from '../platform';

let authSchemaReady: Promise<void> | null = null;

async function run(database: D1Database, sql: string, values: unknown[] = []): Promise<void> {
  const result = await database.prepare(sql).bind(...values).run();
  if (!result.success) throw new Error('D1 runtime schema statement failed');
}

async function applyAuthRuntimeSchema(database: D1Database): Promise<void> {
  await run(database, `CREATE TABLE IF NOT EXISTS cdp_user_links (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    cdp_project_id TEXT NOT NULL,
    cdp_user_id TEXT NOT NULL,
    last_auth_method TEXT,
    last_authenticated_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(cdp_project_id, cdp_user_id),
    UNIQUE(user_id, cdp_project_id)
  )`);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_cdp_user_links_user ON cdp_user_links(user_id)`);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_cdp_user_links_cdp_user ON cdp_user_links(cdp_project_id, cdp_user_id)`);

  await run(database, `CREATE TABLE IF NOT EXISTS wallet_accounts (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id),
    cdp_user_link_id TEXT REFERENCES cdp_user_links(id),
    provider TEXT NOT NULL DEFAULT 'coinbase_cdp',
    chain_family TEXT NOT NULL CHECK (chain_family IN ('evm', 'solana')),
    address TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('eoa', 'smart', 'solana')),
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(provider, chain_family, address)
  )`);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_wallet_accounts_user ON wallet_accounts(user_id, status)`);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_wallet_accounts_cdp_link ON wallet_accounts(cdp_user_link_id, status)`);

  await run(database, `CREATE TABLE IF NOT EXISTS creator_access_claims (
    id TEXT PRIMARY KEY NOT NULL,
    cdp_project_id TEXT NOT NULL,
    cdp_user_id TEXT NOT NULL,
    user_id TEXT REFERENCES users(id),
    claim_code TEXT NOT NULL UNIQUE,
    claim_token_hash TEXT NOT NULL UNIQUE,
    submitted_x_url TEXT UNIQUE,
    approved_invite_id TEXT REFERENCES invites(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'consumed', 'revoked', 'expired')),
    review_mode TEXT NOT NULL DEFAULT 'manual' CHECK (review_mode IN ('manual', 'twitterapi_io')),
    rejection_reason TEXT,
    reviewed_by_user_id TEXT REFERENCES users(id),
    reviewed_at TEXT,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_creator_access_claims_cdp_user ON creator_access_claims(cdp_project_id, cdp_user_id, status, created_at)`);
  await run(database, `CREATE INDEX IF NOT EXISTS idx_creator_access_claims_review ON creator_access_claims(status, created_at)`);

  await run(database, `CREATE TABLE IF NOT EXISTS admin_settings (
    setting_key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL,
    updated_by_user_id TEXT REFERENCES users(id),
    updated_at TEXT NOT NULL
  )`);
  await run(
    database,
    `INSERT OR IGNORE INTO admin_settings (setting_key, value_json, updated_by_user_id, updated_at) VALUES (?, ?, NULL, ?)`,
    ['creator_access_verification', '{"mode":"manual","providerConfigured":false}', new Date().toISOString()],
  );
}

export async function ensureAuthRuntimeSchema(database: D1Database): Promise<void> {
  if (!authSchemaReady) {
    authSchemaReady = applyAuthRuntimeSchema(database).catch((error) => {
      authSchemaReady = null;
      throw error;
    });
  }
  await authSchemaReady;
}
