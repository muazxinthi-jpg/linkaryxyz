import baseWorker from './index';
import type { Env } from './env';
import type { ExecutionContextLike } from './platform';
import { currentPersonalTelegramIdentity, refreshCurrentCdpLink } from './auth/cdpCurrentLink';
import { errorResponse } from './http';
import { renderPublicProfileWithIdentity } from './routes/publicProfileIdentity';
import { getLinkaryUrls } from './urls';

function host(value: string): string | null {
  try { return new URL(value).hostname.toLowerCase(); }
  catch { return null; }
}

function profileCandidate(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length !== 1) return null;
  const segment = decodeURIComponent(parts[0]);
  if (!segment || segment.includes('.')) return null;
  return segment.toLowerCase();
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/auth/cdp/current-link') {
      try { return await refreshCurrentCdpLink(request, env); }
      catch (error) { return errorResponse(error); }
    }
    if (url.pathname === '/api/auth/telegram-identity') {
      try { return await currentPersonalTelegramIdentity(request, env); }
      catch (error) { return errorResponse(error); }
    }

    if (request.method === 'GET' && env.DB) {
      const appHost = host(getLinkaryUrls(request, env).app);
      const username = profileCandidate(url.pathname);
      if (username && (!appHost || url.hostname.toLowerCase() !== appHost)) {
        try {
          return await renderPublicProfileWithIdentity(request, env, username);
        } catch (error) {
          if (!(error instanceof Error && 'status' in error && (error as { status?: number }).status === 404)) return errorResponse(error);
        }
      }
    }
    return baseWorker.fetch(request, env, ctx);
  },
};