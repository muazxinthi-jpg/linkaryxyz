import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json } from '../http';
import { sha256 } from '../security/crypto';

export function isValidXPostUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['x.com', 'twitter.com'].includes(host)) return false;
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.length >= 3 && parts[1] === 'status' && /^\d+$/.test(parts[2]);
  } catch { return false; }
}

export async function createEarnedAccess(_request: Request, _env: Env): Promise<Response> {
  throw new HttpError(
    410,
    'Creator Earn Access now starts after sign-in and uses a reviewed Linkary claim.',
    'creator_access_flow_updated',
  );
}

export async function previewInvite(code: string, env: Env): Promise<Response> {
  const db = new Db(requireDb(env));
  const invite = await db.first<{ invite_type: string; allowed_account_types_json: string; expires_at: string | null; max_uses: number; uses: number }>(`SELECT invite_type, allowed_account_types_json, expires_at, max_uses, uses FROM invites WHERE code_hash = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?) AND uses < max_uses`, [await sha256(code), new Date().toISOString()]);
  if (!invite) throw new HttpError(404, 'Invite not found or no longer active', 'invite_not_found');
  return json({ inviteType: invite.invite_type, allowedAccountTypes: JSON.parse(invite.allowed_account_types_json), expiresAt: invite.expires_at, remainingUses: invite.max_uses - invite.uses });
}
