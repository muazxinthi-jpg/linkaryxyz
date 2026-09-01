PRAGMA foreign_keys = ON;

-- CDP is Linkary's primary authentication and embedded-wallet provider.
-- Keep CDP end-user identity separate from mutable X / Telegram handles.
-- Authentication-method identities continue to live in auth_identities.

CREATE TABLE IF NOT EXISTS user_wallet_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL DEFAULT 'coinbase_cdp',
  chain TEXT NOT NULL CHECK (chain IN ('evm', 'solana')),
  account_type TEXT NOT NULL CHECK (account_type IN ('eoa', 'smart')),
  address TEXT NOT NULL,
  provider_created_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(provider, chain, address)
);

CREATE INDEX IF NOT EXISTS idx_user_wallet_accounts_user
  ON user_wallet_accounts(user_id, chain, account_type);

CREATE INDEX IF NOT EXISTS idx_user_wallet_accounts_address
  ON user_wallet_accounts(chain, address);
