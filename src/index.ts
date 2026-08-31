import type { Env } from './env';
import type { ExecutionContextLike } from './platform';
import { errorResponse, json, methodNotAllowed } from './http';
import { finishXOAuth, startXOAuth } from './auth/x';
import { getAuthContext, requireAuth, revokeCurrentSession, verifyCsrf } from './auth/session';
import { createEarnedAccess, previewInvite } from './routes/access';
import { completeOnboarding, onboardingStatus } from './routes/onboarding';
import { publicProfileJson, renderPublicProfile, renderSitemap } from './routes/profiles';
import { adminHealth } from './routes/admin';
import { getLinkaryUrls } from './urls';

const STATIC_OR_SYSTEM = new Set(['', 'index.html', 'styles.css', 'script.js', 'uilib.md', 'favicon.ico', 'assets', 'api', 'onboarding', 'admin', 'app', 'robots.txt', 'sitemap.xml', 'pricing', 'about', 'blog', 'privacy', 'terms', 'support', 'help', 'status', 'security']);
function singleSegmentProfilePath(pathname: string): string | null { const parts = pathname.split('/').filter(Boolean); if (parts.length !== 1) return null; const segment = decodeURIComponent(parts[0]).toLowerCase(); if (STATIC_OR_SYSTEM.has(segment) || segment.includes('.')) return null; return segment; }

async function handleApi(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/api/health') return json({ ok: true, service: 'linkary', version: 'phase-a-b-foundation', database: env.DB ? 'bound' : 'not-bound', urls: getLinkaryUrls(request, env) });
  if (path === '/api/auth/me') { if (request.method !== 'GET') return methodNotAllowed(['GET']); const auth = await getAuthContext(request, env); return json({ authenticated: Boolean(auth), user: auth ? { id: auth.user.id, displayName: auth.user.display_name, superadmin: auth.isSuperadmin } : null }); }
  if (path === '/api/auth/x/start') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return startXOAuth(request, env); }
  if (path === '/api/auth/x/callback') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return finishXOAuth(request, env); }
  if (path === '/api/auth/logout') { if (request.method !== 'POST') return methodNotAllowed(['POST']); const auth = await requireAuth(request, env); await verifyCsrf(request, env, auth); const cookies = await revokeCurrentSession(request, env); const headers = new Headers(); for (const cookie of cookies) headers.append('set-cookie', cookie); return json({ ok: true }, { headers }); }
  if (path === '/api/access/earned') { if (request.method !== 'POST') return methodNotAllowed(['POST']); return createEarnedAccess(request, env); }
  const invitePreviewMatch = path.match(/^\/api\/invites\/([^/]+)\/preview$/); if (invitePreviewMatch) { if (request.method !== 'GET') return methodNotAllowed(['GET']); return previewInvite(decodeURIComponent(invitePreviewMatch[1]), env); }
  if (path === '/api/onboarding/status') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return onboardingStatus(request, env); }
  if (path === '/api/onboarding/complete') { if (request.method !== 'POST') return methodNotAllowed(['POST']); return completeOnboarding(request, env); }
  const publicProfileMatch = path.match(/^\/api\/public\/profiles\/([^/]+)$/); if (publicProfileMatch) { if (request.method !== 'GET') return methodNotAllowed(['GET']); return publicProfileJson(decodeURIComponent(publicProfileMatch[1]), env); }
  if (path === '/api/admin/health') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return adminHealth(request, env); }
  return json({ error: 'not_found', message: 'API route not found' }, { status: 404 });
}

async function handle(request: Request, env: Env, _ctx: ExecutionContextLike): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return handleApi(request, env);
  if (url.pathname === '/robots.txt') { const base = getLinkaryUrls(request, env).publicSite; return new Response(`User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } }); }
  if (url.pathname === '/sitemap.xml') return renderSitemap(request, env);
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/app')) { const response = await env.ASSETS.fetch(request); const headers = new Headers(response.headers); headers.set('x-robots-tag', 'noindex, nofollow'); return new Response(response.body, { status: response.status, statusText: response.statusText, headers }); }
  const username = singleSegmentProfilePath(url.pathname);
  if (username && env.DB) { try { return await renderPublicProfile(request, env, username); } catch (error) { if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 404) return env.ASSETS.fetch(request); throw error; } }
  return env.ASSETS.fetch(request);
}

export default { async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> { try { return await handle(request, env, ctx); } catch (error) { return errorResponse(error); } } };
