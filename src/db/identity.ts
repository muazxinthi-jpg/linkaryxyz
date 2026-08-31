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
