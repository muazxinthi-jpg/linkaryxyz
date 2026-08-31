import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import type { SessionRow, UserRow } from '../db/models';
import { HttpError } from '../http';
import { parseCookies, serializeCookie } from '../security/cookies';
import { randomToken, sha256 } from '../security/crypto';

export const SESSION_COOKIE = '__Host-linkary_session';
export const CSRF_COOKIE = '__Host-linkary_csrf';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface AuthContext { user: UserRow; session: SessionRow; isSuperadmin: boolean; }

export async function createSession(env: Env, userId: string): Promise<{ cookieHeaders: string[]; csrfToken: string }> {
  const db = new Db(requireDb(env));
  const rawToken = randomToken(32);
  const csrfToken = randomToken(24);
  const tokenHash = await sha256(rawToken);
  const csrfHash = await sha256(csrfToken);
  const sessionId = `ses_${crypto.randomUUID().replace(/-/g, '')}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_SECONDS * 1000);
  await db.run(`INSERT INTO sessions (id, user_id, token_hash, csrf_token_hash, expires_at, last_seen_at, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`, [sessionId, userId, tokenHash, csrfHash, expiresAt.toISOString(), createdAt.toISOString(), createdAt.toISOString()]);
  return { csrfToken, cookieHeaders: [serializeCookie(SESSION_COOKIE, rawToken, { maxAge: SESSION_TTL_SECONDS, httpOnly: true, secure: true, sameSite: 'Lax' }), serializeCookie(CSRF_COOKIE, csrfToken, { maxAge: SESSION_TTL_SECONDS, httpOnly: false, secure: true, sameSite: 'Lax' })] };
}

export async function getAuthContext(request: Request, env: Env): Promise<AuthContext | null> {
  if (!env.DB) return null;
  const rawToken = parseCookies(request)[SESSION_COOKIE];
  if (!rawToken) return null;
  const db = new Db(env.DB);
  const session = await db.first<SessionRow>(`SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`, [await sha256(rawToken), new Date().toISOString()]);
  if (!session) return null;
  const user = await db.first<UserRow>(`SELECT * FROM users WHERE id = ? AND status = 'active'`, [session.user_id]);
  if (!user) return null;
  const grant = await db.first<{ id: string }>(`SELECT id FROM admin_grants WHERE user_id = ? AND role = 'superadmin' AND status = 'active'`, [user.id]);
  return { user, session, isSuperadmin: Boolean(grant) };
}

export async function requireAuth(request: Request, env: Env): Promise<AuthContext> {
  const auth = await getAuthContext(request, env);
  if (!auth) throw new HttpError(401, 'Authentication required', 'unauthorized');
  return auth;
}

export async function requireSuperadmin(request: Request, env: Env): Promise<AuthContext> {
  const auth = await requireAuth(request, env);
  if (!auth.isSuperadmin) throw new HttpError(403, 'Superadmin access required', 'forbidden');
  return auth;
}

export async function verifyCsrf(request: Request, _env: Env, auth: AuthContext): Promise<void> {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return;
  const cookies = parseCookies(request);
  const cookieToken = cookies[CSRF_COOKIE];
  const headerToken = request.headers.get('x-csrf-token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) throw new HttpError(403, 'CSRF validation failed', 'csrf_failed');
  if (await sha256(cookieToken) !== auth.session.csrf_token_hash) throw new HttpError(403, 'CSRF validation failed', 'csrf_failed');
}

export async function revokeCurrentSession(request: Request, env: Env): Promise<string[]> {
  if (!env.DB) return [];
  const rawToken = parseCookies(request)[SESSION_COOKIE];
  if (rawToken) await new Db(env.DB).run(`UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`, [new Date().toISOString(), await sha256(rawToken)]);
  return [serializeCookie(SESSION_COOKIE, '', { maxAge: 0, httpOnly: true, secure: true, sameSite: 'Lax' }), serializeCookie(CSRF_COOKIE, '', { maxAge: 0, httpOnly: false, secure: true, sameSite: 'Lax' })];
}
