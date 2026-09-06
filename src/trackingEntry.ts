import worker from './worker';
import type { Env } from './env';
import type { ExecutionContextLike } from './platform';
import { errorResponse, methodNotAllowed } from './http';
import { redirectTrackedLink } from './routes/tracking';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);
    const trackedRedirect = url.pathname.match(/^\/r\/([^/]+)$/);

    if (trackedRedirect) {
      if (request.method !== 'GET') return methodNotAllowed(['GET']);
      try {
        return await redirectTrackedLink(request, env, decodeURIComponent(trackedRedirect[1]), ctx);
      } catch (error) {
        return errorResponse(error);
      }
    }

    return worker.fetch(request, env, ctx);
  },
};
