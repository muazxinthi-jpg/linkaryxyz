import baseWorker from './index';
import type { Env } from './env';
import type { ExecutionContextLike } from './platform';
import { renderPublicProfileEnhanced } from './routes/publicProfileEnhancer';
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
    if (request.method === 'GET' && env.DB) {
      const url = new URL(request.url);
      const appHost = host(getLinkaryUrls(request, env).app);
      const username = profileCandidate(url.pathname);
      if (username && (!appHost || url.hostname.toLowerCase() !== appHost)) {
        try {
          return await renderPublicProfileEnhanced(request, env, username);
        } catch (error) {
          if (!(error instanceof Error && 'status' in error && (error as { status?: number }).status === 404)) throw error;
        }
      }
    }
    return baseWorker.fetch(request, env, ctx);
  },
};
