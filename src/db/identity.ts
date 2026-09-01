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
  const auth = await db.first<{ user_id: string }>(`SELECT user_id FROM auth_identities WHERE provider = 'x' AND provider_user_id = ?`, [input.providerUserId]);
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

  const platformIdentity = await syncOwnedPlatformIdentity(db, user.id, 'x', input.providerUserId, input.username, input.displayName, input.raw, 'x_oauth', timestamp);
  return { user, platformIdentity };
}

export interface NormalizedCdpAuthMethod {
  type: string;
  uid: string | null;
  username: string | null;
  email: string | null;
  displayName: string | null;
  raw: Record<string, unknown>;
}

export interface CdpWalletInput {
  chainFamily: 'evm' | 'solana';
  accountType: 'eoa' | 'smart' | 'solana';
  address: string;
}

export interface NormalizedCdpEndUser {
  userId: string;
  methods: NormalizedCdpAuthMethod[];
  wallets: CdpWalletInput[];
  raw: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function stringValue(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }

function normalizeMethod(typeHint: string | null, rawValue: unknown): NormalizedCdpAuthMethod | null {
  const raw = asRecord(rawValue);
  if (!raw) return null;
  const type = (stringValue(raw.type) || typeHint || '').toLowerCase();
  if (!type) return null;

  const username = stringValue(raw.username)?.replace(/^@/, '').toLowerCase() || null;
  const email = stringValue(raw.email)?.toLowerCase() || null;
  const uidCandidate = raw.sub ?? raw.id ?? raw.userId ?? raw.user_id ?? (type === 'email' ? email : null) ?? (type === 'sms' ? raw.phoneNumber ?? raw.phone_number : null);
  const uid = uidCandidate === undefined || uidCandidate === null ? null : String(uidCandidate);
  const firstName = stringValue(raw.firstName ?? raw.first_name);
  const lastName = stringValue(raw.lastName ?? raw.last_name);
  const displayName = stringValue(raw.name) || [firstName, lastName].filter(Boolean).join(' ').trim() || username;
  return { type, uid, username, email, displayName: displayName || null, raw };
}

export function normalizeCdpEndUser(value: unknown): NormalizedCdpEndUser {
  const raw = asRecord(value);
  if (!raw) throw new Error('CDP end-user payload is invalid');
  const userId = stringValue(raw.userId ?? raw.user_id);
  if (!userId) throw new Error('CDP user ID is missing');

  const methods: NormalizedCdpAuthMethod[] = [];
  const auth = raw.authenticationMethods ?? raw.authentication_methods;
  if (Array.isArray(auth)) {
    for (const method of auth) {
      const normalized = normalizeMethod(null, method);
      if (normalized) methods.push(normalized);
    }
  } else {
    const authRecord = asRecord(auth);
    if (authRecord) {
      for (const [type, method] of Object.entries(authRecord)) {
        if (Array.isArray(method)) {
          for (const item of method) { const normalized = normalizeMethod(type, item); if (normalized) methods.push(normalized); }
        } else {
          const normalized = normalizeMethod(type, method);
          if (normalized) methods.push(normalized);
        }
      }
    }
  }

  const wallets: CdpWalletInput[] = [];
  const addWallet = (chainFamily: 'evm' | 'solana', accountType: 'eoa' | 'smart' | 'solana', item: unknown) => {
    if (typeof item === 'string' && item.trim()) { wallets.push({ chainFamily, accountType, address: item.trim() }); return; }
    const record = asRecord(item); const address = record ? stringValue(record.address) : null;
    if (address) wallets.push({ chainFamily, accountType, address });
  };
  const addCollection = (key: string, chainFamily: 'evm' | 'solana', accountType: 'eoa' | 'smart' | 'solana') => {
    const collection = raw[key]; if (Array.isArray(collection)) for (const item of collection) addWallet(chainFamily, accountType, item);
  };
  addCollection('evmAccounts', 'evm', 'eoa');
  addCollection('evmAccountObjects', 'evm', 'eoa');
  addCollection('evmSmartAccounts', 'evm', 'smart');
  addCollection('evmSmartAccountObjects', 'evm', 'smart');
  addCollection('solanaAccounts', 'solana', 'solana');
  addCollection('solanaAccountObjects', 'solana', 'solana');

  const dedupedWallets = Array.from(new Map(wallets.map((wallet) => [`${wallet.chainFamily}:${wallet.address.toLowerCase()}`, wallet])).values());
  return { userId, methods, wallets: dedupedWallets, raw };
}

function preferredDisplayName(methods: NormalizedCdpAuthMethod[], email: string | null): string {
  const telegram = methods.find((method) => method.type === 'telegram');
  if (telegram?.displayName) return telegram.displayName;
  const x = methods.find((method) => method.type === 'x');
  if (x?.displayName) return x.displayName;
  if (x?.username) return x.username;
  if (email) return email.split('@')[0] || 'Linkary user';
  return 'Linkary user';
}

async function syncAuthIdentity(db: Db, userId: string, method: NormalizedCdpAuthMethod, timestamp: string): Promise<void> {
  if (!method.uid || !['email', 'sms', 'google', 'apple', 'x', 'telegram'].includes(method.type)) return;
  const existing = await db.first<{ id: string; user_id: string }>(`SELECT id, user_id FROM auth_identities WHERE provider = ? AND provider_user_id = ?`, [method.type, method.uid]);
  if (existing && existing.user_id !== userId) throw new Error(`Authentication identity conflict for ${method.type}`);
  if (existing) {
    await db.run(`UPDATE auth_identities SET provider_username = ?, verified_at = ?, metadata_json = ?, updated_at = ? WHERE id = ?`, [method.username, timestamp, JSON.stringify(method.raw), timestamp, existing.id]);
    return;
  }
  await db.run(`INSERT INTO auth_identities (id, user_id, provider, provider_user_id, provider_username, verified_at, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id('auth'), userId, method.type, method.uid, method.username, timestamp, JSON.stringify(method.raw), timestamp, timestamp]);
}

async function syncOwnedPlatformIdentity(db: Db, userId: string, platform: 'x' | 'telegram', providerUid: string, handle: string | null, displayName: string | null, raw: unknown, source: string, timestamp: string): Promise<PlatformIdentityRow> {
  let identity = await db.first<PlatformIdentityRow>(`SELECT * FROM platform_identities WHERE platform = ? AND provider_uid = ?`, [platform, providerUid]);
  if (!identity) {
    const platformIdentityId = id('pid');
    await db.run(`INSERT INTO platform_identities (id, platform, provider_uid, provider_object_type, current_handle, current_display_name, status, ownership_verified_at, first_seen_at, last_seen_at, metadata_json) VALUES (?, ?, ?, 'person', ?, ?, 'active', ?, ?, ?, ?)`, [platformIdentityId, platform, providerUid, handle, displayName, timestamp, timestamp, timestamp, JSON.stringify(raw)]);
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

async function syncWalletAccount(db: Db, userId: string, cdpUserLinkId: string, wallet: CdpWalletInput, timestamp: string, isPrimary: boolean): Promise<void> {
  const existing = await db.first<{ id: string; user_id: string }>(`SELECT id, user_id FROM wallet_accounts WHERE provider = 'coinbase_cdp' AND chain_family = ? AND address = ?`, [wallet.chainFamily, wallet.address]);
  if (existing && existing.user_id !== userId) throw new Error('Wallet account is already linked to another Linkary user');
  if (existing) {
    await db.run(`UPDATE wallet_accounts SET cdp_user_link_id = ?, account_type = ?, is_primary = CASE WHEN ? = 1 THEN 1 ELSE is_primary END, status = 'active', updated_at = ? WHERE id = ?`, [cdpUserLinkId, wallet.accountType, isPrimary ? 1 : 0, timestamp, existing.id]);
    return;
  }
  await db.run(`INSERT INTO wallet_accounts (id, user_id, cdp_user_link_id, provider, chain_family, address, account_type, is_primary, status, created_at, updated_at) VALUES (?, ?, ?, 'coinbase_cdp', ?, ?, ?, ?, 'active', ?, ?)`, [id('wal'), userId, cdpUserLinkId, wallet.chainFamily, wallet.address, wallet.accountType, isPrimary ? 1 : 0, timestamp, timestamp]);
}

export async function upsertCdpUser(db: Db, cdpProjectId: string, rawEndUser: unknown): Promise<{ user: UserRow; cdpUserLinkId: string; platformIdentities: PlatformIdentityRow[]; endUser: NormalizedCdpEndUser }> {
  const input = normalizeCdpEndUser(rawEndUser);
  const timestamp = now();
  const email = input.methods.map((method) => method.email).find((value): value is string => Boolean(value)) || null;
  const displayName = preferredDisplayName(input.methods, email);

  const cdpLink = await db.first<{ id: string; user_id: string }>(`SELECT id, user_id FROM cdp_user_links WHERE cdp_project_id = ? AND cdp_user_id = ?`, [cdpProjectId, input.userId]);
  let user: UserRow | null = cdpLink ? await db.first<UserRow>(`SELECT * FROM users WHERE id = ?`, [cdpLink.user_id]) : null;

  if (!user) {
    for (const method of input.methods) {
      if (!method.uid || !['email', 'sms', 'google', 'apple', 'x', 'telegram'].includes(method.type)) continue;
      const existing = await db.first<{ user_id: string }>(`SELECT user_id FROM auth_identities WHERE provider = ? AND provider_user_id = ?`, [method.type, method.uid]);
      if (existing) { user = await db.first<UserRow>(`SELECT * FROM users WHERE id = ?`, [existing.user_id]); if (user) break; }
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

  const lastAuthMethod = input.methods[0]?.type || null;
  let cdpUserLinkId = cdpLink?.id || null;
  if (cdpUserLinkId) {
    await db.run(`UPDATE cdp_user_links SET last_auth_method = ?, last_authenticated_at = ?, updated_at = ? WHERE id = ?`, [lastAuthMethod, timestamp, timestamp, cdpUserLinkId]);
  } else {
    const existingForUser = await db.first<{ id: string; cdp_user_id: string }>(`SELECT id, cdp_user_id FROM cdp_user_links WHERE user_id = ? AND cdp_project_id = ?`, [user.id, cdpProjectId]);
    if (existingForUser && existingForUser.cdp_user_id !== input.userId) throw new Error('Linkary user is already linked to a different CDP user in this project');
    cdpUserLinkId = existingForUser?.id || id('cdp');
    if (existingForUser) await db.run(`UPDATE cdp_user_links SET last_auth_method = ?, last_authenticated_at = ?, updated_at = ? WHERE id = ?`, [lastAuthMethod, timestamp, timestamp, cdpUserLinkId]);
    else await db.run(`INSERT INTO cdp_user_links (id, user_id, cdp_project_id, cdp_user_id, last_auth_method, last_authenticated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [cdpUserLinkId, user.id, cdpProjectId, input.userId, lastAuthMethod, timestamp, timestamp, timestamp]);
  }

  const platformIdentities: PlatformIdentityRow[] = [];
  for (const method of input.methods) {
    await syncAuthIdentity(db, user.id, method, timestamp);
    if (!method.uid) continue;
    if (method.type === 'x') platformIdentities.push(await syncOwnedPlatformIdentity(db, user.id, 'x', method.uid, method.username, method.displayName || method.username, method.raw, 'cdp_x_oauth', timestamp));
    if (method.type === 'telegram') platformIdentities.push(await syncOwnedPlatformIdentity(db, user.id, 'telegram', method.uid, method.username, method.displayName || method.username, method.raw, 'cdp_telegram_oauth', timestamp));
  }

  const primarySeen = new Set<string>();
  for (const wallet of input.wallets) {
    const primaryKey = wallet.chainFamily;
    const isPrimary = !primarySeen.has(primaryKey);
    primarySeen.add(primaryKey);
    await syncWalletAccount(db, user.id, cdpUserLinkId, wallet, timestamp, isPrimary);
  }

  return { user, cdpUserLinkId, platformIdentities, endUser: input };
}
