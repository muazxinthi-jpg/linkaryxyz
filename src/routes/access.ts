import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { randomToken, sha256 } from '../security/crypto';
import { getLinkaryUrls } from '../urls';

interface EarnedAccessBody { postUrl?: string }

export function isValidXPostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['x.com', 'twitter.com'].includes(host)) return false;
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.length >= 3 && parts[1] === 'status' && /^\d+$/.test(parts[2]);
  } catch { return false; }
}

export async function createEarnedAccess(request: Request, env: Env): Promise<Response> {
  const db = new Db(requireDb(env));
  const body = await readJson<EarnedAccessBody>(request);
  const postUrl = body.postUrl?.trim();
  if (!postUrl || !isValidXPostUrl(postUrl)) throw new HttpError(400, 'Provide a valid X post URL', 'invalid_x_post_url');
  const rawGrant = randomToken(24);
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 60 * 1000);
  await db.run(`INSERT INTO access_post_submissions (id, user_id, submitted_x_url, grant_token_hash, status, expires_at, submitted_at, auth_verified_at, consumed_at) VALUES (?, NULL, ?, ?, 'pending', ?, ?, NULL, NULL)`, [`aps_${crypto.randomUUID().replace(/-/g, '')}`, postUrl, await sha256(rawGrant), expires.toISOString(), now.toISOString()]);
  const apiBase = getLinkaryUrls(request, env).api;
  return json({ access: 'earned_creator', expiresAt: expires.toISOString(), continueUrl: `${apiBase}/api/auth/x/start?grant=${encodeURIComponent(rawGrant)}&return_to=%2Fonboarding`, verification: 'manual_url_evidence_only', twitterApiIoUsed: false }, { status: 201 });
}

export async function previewInvite(code: string, env: Env): Promise<Response> {
  const db = new Db(requireDb(env));
  const invite = await db.first<{ invite_type: string; allowed_account_types_json: string; expires_at: string | null; max_uses: number; uses: number }>(`SELECT invite_type, allowed_account_types_json, expires_at, max_uses, uses FROM invites WHERE code_hash = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?) AND uses < max_uses`, [await sha256(code), new Date().toISOString()]);
  if (!invite) throw new HttpError(404, 'Invite not found or no longer active', 'invite_not_found');
  return json({ inviteType: invite.invite_type, allowedAccountTypes: JSON.parse(invite.allowed_account_types_json), expiresAt: invite.expires_at, remainingUses: invite.max_uses - invite.uses });
}
