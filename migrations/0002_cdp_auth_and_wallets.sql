PRAGMA foreign_keys = ON;

-- Coinbase CDP is Linkary's primary authentication and embedded-wallet provider.
-- Linkary product identity remains in D1. External platform identities such as X
-- and Telegram remain separate and continue to anchor reputation/history to
-- stable provider UIDs rather than mutable usernames.

CREATE TABLE IF NOT EXISTS cdp_user_links (
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
);

CREATE INDEX IF NOT EXISTS idx_cdp_user_links_user
  ON cdp_user_links(user_id);

CREATE INDEX IF NOT EXISTS idx_cdp_user_links_cdp_user
  ON cdp_user_links(cdp_project_id, cdp_user_id);

CREATE TABLE IF NOT EXISTS wallet_accounts (
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
);

CREATE INDEX IF NOT EXISTS idx_wallet_accounts_user
  ON wallet_accounts(user_id, status);

CREATE INDEX IF NOT EXISTS idx_wallet_accounts_cdp_link
  ON wallet_accounts(cdp_user_link_id, status);
