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
