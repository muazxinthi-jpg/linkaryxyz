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

export interface PlatformIdentityInput {
  platform: 'x' | 'telegram';
  providerUserId: string;
  username?: string | null;
  displayName?: string | null;
  providerObjectType?: 'person' | 'chat' | 'channel';
  raw: Record<string, unknown>;
  source: string;
}

export async function upsertPlatformIdentityForUser(db: Db, userId: string, input: PlatformIdentityInput): Promise<PlatformIdentityRow> {
  const timestamp = now();
  const username = input.username?.trim().replace(/^@/, '').toLowerCase() || null;
  const displayName = input.displayName?.trim() || username;
  let platformIdentity = await db.first<PlatformIdentityRow>(
    `SELECT * FROM platform_identities WHERE platform = ? AND provider_uid = ?`,
    [input.platform, input.providerUserId],
  );

  if (!platformIdentity) {
    const platformIdentityId = id('pid');
    await db.run(
      `INSERT INTO platform_identities (id, platform, provider_uid, provider_object_type, current_handle, current_display_name, status, ownership_verified_at, first_seen_at, last_seen_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      [
        platformIdentityId,
        input.platform,
        input.providerUserId,
        input.providerObjectType || 'person',
        username,
        displayName,
        timestamp,
        timestamp,
        timestamp,
        JSON.stringify(input.raw),
      ],
    );
    if (username) {
      await db.run(
        `INSERT INTO platform_handle_history (id, platform_identity_id, handle, display_name, first_seen_at, last_seen_at, source, verification_state)
         VALUES (?, ?, ?, ?, ?, NULL, ?, 'verified')`,
        [id('phh'), platformIdentityId, username, displayName, timestamp, input.source],
      );
    }
    platformIdentity = await db.first<PlatformIdentityRow>(`SELECT * FROM platform_identities WHERE id = ?`, [platformIdentityId]);
  } else {
    const activeOwner = await db.first<{ user_id: string | null }>(
      `SELECT user_id FROM platform_identity_links WHERE platform_identity_id = ? AND link_type = 'owns' AND ended_at IS NULL ORDER BY verified_at DESC LIMIT 1`,
      [platformIdentity.id],
    );
    if (activeOwner?.user_id && activeOwner.user_id !== userId) {
      throw new Error(`Stable ${input.platform} identity is already linked to another Linkary user`);
    }

    if (username && platformIdentity.current_handle && platformIdentity.current_handle !== username) {
      await db.run(
        `UPDATE platform_handle_history SET last_seen_at = ? WHERE platform_identity_id = ? AND handle = ? AND last_seen_at IS NULL`,
        [timestamp, platformIdentity.id, platformIdentity.current_handle],
      );
      await db.run(
        `INSERT INTO platform_handle_history (id, platform_identity_id, handle, display_name, first_seen_at, last_seen_at, source, verification_state)
         VALUES (?, ?, ?, ?, ?, NULL, ?, 'verified')`,
        [id('phh'), platformIdentity.id, username, displayName, timestamp, input.source],
      );
    } else if (username && !platformIdentity.current_handle) {
      await db.run(
        `INSERT INTO platform_handle_history (id, platform_identity_id, handle, display_name, first_seen_at, last_seen_at, source, verification_state)
         VALUES (?, ?, ?, ?, ?, NULL, ?, 'verified')`,
        [id('phh'), platformIdentity.id, username, displayName, timestamp, input.source],
      );
    }

    await db.run(
      `UPDATE platform_identities SET current_handle = COALESCE(?, current_handle), current_display_name = COALESCE(?, current_display_name), ownership_verified_at = ?, last_seen_at = ?, metadata_json = ? WHERE id = ?`,
      [username, displayName, timestamp, timestamp, JSON.stringify(input.raw), platformIdentity.id],
    );
    platformIdentity = await db.first<PlatformIdentityRow>(`SELECT * FROM platform_identities WHERE id = ?`, [platformIdentity.id]);
  }

  if (!platformIdentity) throw new Error('Unable to create or load platform identity');
  const existingLink = await db.first<{ id: string }>(
    `SELECT id FROM platform_identity_links WHERE platform_identity_id = ? AND user_id = ? AND link_type = 'owns' AND ended_at IS NULL`,
    [platformIdentity.id, userId],
  );
  if (!existingLink) {
    await db.run(
      `INSERT INTO platform_identity_links (id, platform_identity_id, user_id, organization_id, profile_id, link_type, verified_at, ended_at)
       VALUES (?, ?, ?, NULL, NULL, 'owns', ?, NULL)`,
      [id('pil'), platformIdentity.id, userId, timestamp],
    );
  }
  return platformIdentity;
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

  const platformIdentity = await upsertPlatformIdentityForUser(db, user.id, {
    platform: 'x',
    providerUserId: input.providerUserId,
    username: input.username,
    displayName: input.displayName,
    raw: input.raw,
    source: 'x_oauth',
  });
  return { user, platformIdentity };
}
