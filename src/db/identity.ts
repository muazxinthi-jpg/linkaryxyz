import { Db } from './client';
import type { PlatformIdentityRow, UserRow } from './models';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

export interface XIdentityInput {
  providerUserId: string;
  username: string;
  displayName: string;
  raw: Record<string, unknown>;
}

export async function upsertXUser(db: Db, input: XIdentityInput): Promise<{ user: UserRow; platformIdentity: PlatformIdentityRow }> {
  const timestamp = now();
  let auth = await db.first<{ user_id: string }>(`SELECT user_id FROM auth_identities WHERE provider = 'x' AND provider_user_id = ?`, [input.providerUserId]);
  let user: UserRow | null = auth ? await db.first<UserRow>(`SELECT * FROM users WHERE id = ?`, [auth.user_id]) : null;

  if (!user) {
    const userId = id('usr');
    await db.run(`INSERT INTO users (id, email, display_name, status, created_at, updated_at) VALUES (?, NULL, ?, 'active', ?, ?)`, [userId, input.displayName, timestamp, timestamp]);
    await db.run(`INSERT INTO auth_identities (id, user_id, provider, provider_user_id, provider_username, verified_at, metadata_json, created_at, updated_at) VALUES (?, ?, 'x', ?, ?, ?, ?, ?, ?)`, [id('auth'), userId, input.providerUserId, input.username, timestamp, JSON.stringify(input.raw), timestamp, timestamp]);
    user = await db.first<UserRow>(`SELECT * FROM users WHERE id = ?`, [userId]);
  } else {
    await db.run(`UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`, [input.displayName, timestamp, user.id]);
    await db.run(`UPDATE auth_identities SET provider_username = ?, metadata_json = ?, verified_at = ?, updated_at = ? WHERE provider = 'x' AND provider_user_id = ?`, [input.username, JSON.stringify(input.raw), timestamp, timestamp, input.providerUserId]);
  }
  if (!user) throw new Error('Unable to create or load user');

  let platformIdentity = await db.first<PlatformIdentityRow>(`SELECT * FROM platform_identities WHERE platform = 'x' AND provider_uid = ?`, [input.providerUserId]);
  if (!platformIdentity) {
    const platformIdentityId = id('pid');
    await db.run(`INSERT INTO platform_identities (id, platform, provider_uid, provider_object_type, current_handle, current_display_name, status, ownership_verified_at, first_seen_at, last_seen_at, metadata_json) VALUES (?, 'x', ?, 'person', ?, ?, 'active', ?, ?, ?, ?)`, [platformIdentityId, input.providerUserId, input.username, input.displayName, timestamp, timestamp, timestamp, JSON.stringify(input.raw)]);
    await db.run(`INSERT INTO platform_handle_history (id, platform_identity_id, handle, display_name, first_seen_at, last_seen_at, source, verification_state) VALUES (?, ?, ?, ?, ?, NULL, 'x_oauth', 'verified')`, [id('phh'), platformIdentityId, input.username, input.displayName, timestamp]);
    platformIdentity = await db.first<PlatformIdentityRow>(`SELECT * FROM platform_identities WHERE id = ?`, [platformIdentityId]);
  } else {
    if (platformIdentity.current_handle && platformIdentity.current_handle !== input.username) {
      await db.run(`UPDATE platform_handle_history SET last_seen_at = ? WHERE platform_identity_id = ? AND handle = ? AND last_seen_at IS NULL`, [timestamp, platformIdentity.id, platformIdentity.current_handle]);
      await db.run(`INSERT INTO platform_handle_history (id, platform_identity_id, handle, display_name, first_seen_at, last_seen_at, source, verification_state) VALUES (?, ?, ?, ?, ?, NULL, 'x_oauth', 'verified')`, [id('phh'), platformIdentity.id, input.username, input.displayName, timestamp]);
    }
    await db.run(`UPDATE platform_identities SET current_handle = ?, current_display_name = ?, ownership_verified_at = ?, last_seen_at = ?, metadata_json = ? WHERE id = ?`, [input.username, input.displayName, timestamp, timestamp, JSON.stringify(input.raw), platformIdentity.id]);
    platformIdentity = await db.first<PlatformIdentityRow>(`SELECT * FROM platform_identities WHERE id = ?`, [platformIdentity.id]);
  }
  if (!platformIdentity) throw new Error('Unable to create or load platform identity');

  const existingLink = await db.first<{ id: string }>(`SELECT id FROM platform_identity_links WHERE platform_identity_id = ? AND user_id = ? AND link_type = 'owns' AND ended_at IS NULL`, [platformIdentity.id, user.id]);
  if (!existingLink) {
    await db.run(`INSERT INTO platform_identity_links (id, platform_identity_id, user_id, organization_id, profile_id, link_type, verified_at, ended_at) VALUES (?, ?, ?, NULL, NULL, 'owns', ?, NULL)`, [id('pil'), platformIdentity.id, user.id, timestamp]);
  }
  return { user, platformIdentity };
}

export type CdpAuthenticationMethod =
  | { type: 'email'; email: string }
  | { type: 'sms'; phoneNumber: string }
  | { type: 'google' | 'apple'; sub: string; email?: string }
  | { type: 'x'; sub: string; username?: string; email?: string }
  | { type: 'telegram'; id: string | number; firstName?: string; lastName?: string; username?: string; photoUrl?: string; authDate?: number }
  | { type: string; [key: string]: unknown };

export interface CdpWalletAccountObject {
  address: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface CdpEndUserInput {
  userId: string;
  authenticationMethods: CdpAuthenticationMethod[];
  evmAccountObjects?: CdpWalletAccountObject[];
  evmSmartAccountObjects?: CdpWalletAccountObject[];
  solanaAccountObjects?: CdpWalletAccountObject[];
  [key: string]: unknown;
}

function methodEmail(method: CdpAuthenticationMethod): string | null {
  if (method.type === 'email' && typeof method.email === 'string') return method.email.trim().toLowerCase();
  if ((method.type === 'google' || method.type === 'apple' || method.type === 'x') && typeof method.email === 'string') return method.email.trim().toLowerCase();
  return null;
}

function providerUid(method: CdpAuthenticationMethod): string | null {
  if (method.type === 'email') return methodEmail(method);
  if (method.type === 'google' || method.type === 'apple' || method.type === 'x') return typeof method.sub === 'string' ? method.sub : null;
  if (method.type === 'telegram') return method.id === undefined || method.id === null ? null : String(method.id);
  if (method.type === 'sms') return typeof method.phoneNumber === 'string' ? method.phoneNumber : null;
  return null;
}

function preferredDisplayName(methods: CdpAuthenticationMethod[], email: string | null): string {
  const telegram = methods.find((method) => method.type === 'telegram') as Extract<CdpAuthenticationMethod, { type: 'telegram' }> | undefined;
  if (telegram) {
    const fullName = [telegram.firstName, telegram.lastName].filter(Boolean).join(' ').trim();
    if (fullName) return fullName;
    if (telegram.username) return telegram.username;
  }
  const x = methods.find((method) => method.type === 'x') as Extract<CdpAuthenticationMethod, { type: 'x' }> | undefined;
  if (x?.username) return x.username;
  if (email) return email.split('@')[0] || 'Linkary user';
  return 'Linkary user';
}

async function syncAuthIdentity(db: Db, userId: string, provider: string, uid: string, username: string | null, raw: unknown, timestamp: string): Promise<void> {
  const existing = await db.first<{ id: string; user_id: string }>(`SELECT id, user_id FROM auth_identities WHERE provider = ? AND provider_user_id = ?`, [provider, uid]);
  if (existing && existing.user_id !== userId) throw new Error(`Authentication identity conflict for ${provider}`);
  if (existing) {
    await db.run(`UPDATE auth_identities SET provider_username = ?, verified_at = ?, metadata_json = ?, updated_at = ? WHERE id = ?`, [username, timestamp, JSON.stringify(raw), timestamp, existing.id]);
    return;
  }
  await db.run(`INSERT INTO auth_identities (id, user_id, provider, provider_user_id, provider_username, verified_at, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id('auth'), userId, provider, uid, username, timestamp, JSON.stringify(raw), timestamp, timestamp]);
}

async function syncOwnedPlatformIdentity(db: Db, userId: string, platform: 'x' | 'telegram', providerUidValue: string, handle: string | null, displayName: string | null, raw: unknown, source: string, timestamp: string): Promise<PlatformIdentityRow> {
  let identity = await db.first<PlatformIdentityRow>(`SELECT * FROM platform_identities WHERE platform = ? AND provider_uid = ?`, [platform, providerUidValue]);
  if (!identity) {
    const platformIdentityId = id('pid');
    await db.run(`INSERT INTO platform_identities (id, platform, provider_uid, provider_object_type, current_handle, current_display_name, status, ownership_verified_at, first_seen_at, last_seen_at, metadata_json) VALUES (?, ?, ?, 'person', ?, ?, 'active', ?, ?, ?, ?)`, [platformIdentityId, platform, providerUidValue, handle, displayName, timestamp, timestamp, timestamp, JSON.stringify(raw)]);
    if (handle) await db.run(`INSERT INTO platform_handle_history (id, platform_identity_id, handle, display_name, first_seen_at, last_seen_at, source, verification_state) VALUES (?, ?, ?, ?, ?, NULL, ?, 'verified')`, [id('phh'), platformIdentityId, handle, displayName, timestamp, source]);
    identity = await db.first<PlatformIdentityRow>(`SELECT * FROM platform_identities WHERE id = ?`, [platformIdentityId]);
  } else {
    const owner = await db.first<{ user_id: string | null }>(`SELECT user_id FROM platform_identity_links WHERE platform_identity_id = ? AND link_type = 'owns' AND ended_at IS NULL LIMIT 1`, [identity.id]);
    if (owner?.user_id && owner.user_id !== userId) throw new Error(`Platform identity conflict for ${platform}`);
    if (handle && handle !== identity.current_handle) {
      if (identity.current_handle) await db.run(`UPDATE platform_handle_history SET last_seen_at = ? WHERE platform_identity_id = ? AND handle = ? AND last_seen_at IS NULL`, [timestamp, identity.id, identity.current_handle]);
      await db.run(`INSERT INTO platform_handle_history (id, platform_identity_id, handle, display_name, first_seen_at, last_seen_at, source, verification_state) VALUES (?, ?, ?, ?, ?, NULL, ?, 'verified')`, [id('phh'), identity.id, handle, displayName, timestamp, source]);
    }
    await db.run(`UPDATE platform_identities SET current_handle = COALESCE(?, current_handle), current_display_name = COALESCE(?, current_display_name), ownership_verified_at = ?, last_seen_at = ?, metadata_json = ? WHERE id = ?`, [handle, displayName, timestamp, timestamp, JSON.stringify(raw), identity.id]);
    identity = await db.first<PlatformIdentityRow>(`SELECT * FROM platform_identities WHERE id = ?`, [identity.id]);
  }
  if (!identity) throw new Error(`Unable to create or load ${platform} identity`);

  const existingLink = await db.first<{ id: string }>(`SELECT id FROM platform_identity_links WHERE platform_identity_id = ? AND user_id = ? AND link_type = 'owns' AND ended_at IS NULL`, [identity.id, userId]);
  if (!existingLink) await db.run(`INSERT INTO platform_identity_links (id, platform_identity_id, user_id, organization_id, profile_id, link_type, verified_at, ended_at) VALUES (?, ?, ?, NULL, NULL, 'owns', ?, NULL)`, [id('pil'), identity.id, userId, timestamp]);
  return identity;
}

async function syncWalletAccount(db: Db, userId: string, chain: 'evm' | 'solana', accountType: 'eoa' | 'smart', account: CdpWalletAccountObject, timestamp: string): Promise<void> {
  if (!account.address) return;
  const existing = await db.first<{ id: string; user_id: string }>(`SELECT id, user_id FROM user_wallet_accounts WHERE provider = 'coinbase_cdp' AND chain = ? AND address = ?`, [chain, account.address]);
  if (existing && existing.user_id !== userId) throw new Error('Wallet account is already linked to another Linkary user');
  if (existing) {
    await db.run(`UPDATE user_wallet_accounts SET account_type = ?, provider_created_at = COALESCE(provider_created_at, ?), last_seen_at = ?, metadata_json = ? WHERE id = ?`, [accountType, account.createdAt || null, timestamp, JSON.stringify(account), existing.id]);
    return;
  }
  await db.run(`INSERT INTO user_wallet_accounts (id, user_id, provider, chain, account_type, address, provider_created_at, first_seen_at, last_seen_at, metadata_json) VALUES (?, ?, 'coinbase_cdp', ?, ?, ?, ?, ?, ?, ?)`, [id('wal'), userId, chain, accountType, account.address, account.createdAt || null, timestamp, timestamp, JSON.stringify(account)]);
}

export async function upsertCdpUser(db: Db, input: CdpEndUserInput): Promise<{ user: UserRow; platformIdentities: PlatformIdentityRow[] }> {
  if (!input.userId) throw new Error('CDP user ID is required');
  const timestamp = now();
  const methods = Array.isArray(input.authenticationMethods) ? input.authenticationMethods : [];
  const email = methods.map(methodEmail).find(Boolean) || null;
  const displayName = preferredDisplayName(methods, email);

  const cdpAuth = await db.first<{ user_id: string }>(`SELECT user_id FROM auth_identities WHERE provider = 'coinbase_cdp' AND provider_user_id = ?`, [input.userId]);
  let user: UserRow | null = cdpAuth ? await db.first<UserRow>(`SELECT * FROM users WHERE id = ?`, [cdpAuth.user_id]) : null;

  if (!user) {
    for (const method of methods) {
      const uid = providerUid(method);
      if (!uid || !['x', 'telegram', 'google', 'apple', 'email', 'sms'].includes(method.type)) continue;
      const existing = await db.first<{ user_id: string }>(`SELECT user_id FROM auth_identities WHERE provider = ? AND provider_user_id = ?`, [method.type, uid]);
      if (existing) {
        user = await db.first<UserRow>(`SELECT * FROM users WHERE id = ?`, [existing.user_id]);
        if (user) break;
      }
    }
  }
  if (!user && email) user = await db.first<UserRow>(`SELECT * FROM users WHERE lower(email) = ?`, [email]);

  if (!user) {
    const userId = id('usr');
    await db.run(`INSERT INTO users (id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`, [userId, email, displayName, timestamp, timestamp]);
    user = await db.first<UserRow>(`SELECT * FROM users WHERE id = ?`, [userId]);
  } else {
    await db.run(`UPDATE users SET email = COALESCE(email, ?), display_name = CASE WHEN display_name = '' THEN ? ELSE display_name END, updated_at = ? WHERE id = ?`, [email, displayName, timestamp, user.id]);
    user = await db.first<UserRow>(`SELECT * FROM users WHERE id = ?`, [user.id]);
  }
  if (!user) throw new Error('Unable to create or load CDP user');

  await syncAuthIdentity(db, user.id, 'coinbase_cdp', input.userId, null, input, timestamp);
  const platformIdentities: PlatformIdentityRow[] = [];

  for (const method of methods) {
    const uid = providerUid(method);
    if (!uid || !['x', 'telegram', 'google', 'apple', 'email', 'sms'].includes(method.type)) continue;
    const username = method.type === 'x' || method.type === 'telegram' ? (typeof method.username === 'string' ? method.username.toLowerCase() : null) : null;
    await syncAuthIdentity(db, user.id, method.type, uid, username, method, timestamp);

    if (method.type === 'x') {
      platformIdentities.push(await syncOwnedPlatformIdentity(db, user.id, 'x', uid, username, username, method, 'cdp_x_oauth', timestamp));
    }
    if (method.type === 'telegram') {
      const telegram = method as Extract<CdpAuthenticationMethod, { type: 'telegram' }>;
      const telegramName = [telegram.firstName, telegram.lastName].filter(Boolean).join(' ').trim() || username;
      platformIdentities.push(await syncOwnedPlatformIdentity(db, user.id, 'telegram', uid, username, telegramName, method, 'cdp_telegram_oauth', timestamp));
    }
  }

  for (const account of input.evmAccountObjects || []) await syncWalletAccount(db, user.id, 'evm', 'eoa', account, timestamp);
  for (const account of input.evmSmartAccountObjects || []) await syncWalletAccount(db, user.id, 'evm', 'smart', account, timestamp);
  for (const account of input.solanaAccountObjects || []) await syncWalletAccount(db, user.id, 'solana', 'eoa', account, timestamp);

  return { user, platformIdentities };
}
