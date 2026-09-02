import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { json } from '../http';
import { requireSuperadmin } from '../auth/session';

export async function adminHealth(request: Request, env: Env): Promise<Response> {
  const auth = await requireSuperadmin(request, env);
  const db = new Db(requireDb(env));
  const [users, profiles, organizations] = await Promise.all([db.first<{ count: number }>(`SELECT COUNT(*) AS count FROM users`), db.first<{ count: number }>(`SELECT COUNT(*) AS count FROM profiles`), db.first<{ count: number }>(`SELECT COUNT(*) AS count FROM organizations`)]);
  return json({ ok: true, scope: 'superadmin', actorUserId: auth.user.id, counts: { users: users?.count || 0, profiles: profiles?.count || 0, organizations: organizations?.count || 0 } }, { headers: { 'x-robots-tag': 'noindex, nofollow' } });
}

export async function listAdminUsers(request: Request, env: Env): Promise<Response> { const auth = await requireSuperadmin(request, env); const db = new Db(requireDb(env)); const users = await db.all<{ id: string; email: string | null; display_name: string; status: string; created_at: string }>('SELECT id, email, display_name, status, created_at FROM users ORDER BY created_at DESC LIMIT 100'); return json({ users, actorUserId: auth.user.id }, { headers: { 'x-robots-tag': 'noindex, nofollow' } }); }
export async function setAdminUserStatus(request: Request, env: Env, userId: string): Promise<Response> { const auth = await requireSuperadmin(request, env); await (await import('../auth/session')).verifyCsrf(request, env, auth); const body = await request.json().catch(() => ({})) as { status?: string; reason?: string }; if (!['active', 'suspended'].includes(body.status || '')) return json({ error: 'invalid_status', message: 'Status must be active or suspended' }, { status: 400 }); if (userId === auth.user.id) return json({ error: 'self_moderation_denied', message: 'You cannot change your own status' }, { status: 409 }); const db = new Db(requireDb(env)); const timestamp = new Date().toISOString(); await db.batch([db.statement('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [body.status, timestamp, userId]), db.statement(`INSERT INTO audit_logs (id, actor_user_id, actor_kind, action, resource_type, resource_id, organization_id, metadata_json, created_at) VALUES (?, ?, 'superadmin', ?, 'user', ?, NULL, ?, ?)`, [`aud_${crypto.randomUUID().replace(/-/g, '')}`, auth.user.id, body.status === 'suspended' ? 'user.suspended' : 'user.restored', userId, JSON.stringify({ reason: body.reason || null }), timestamp])]); return json({ ok: true, userId, status: body.status }); }
