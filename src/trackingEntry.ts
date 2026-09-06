import worker from './worker';
import type { Env } from './env';
import type { ExecutionContextLike } from './platform';
import { errorResponse, methodNotAllowed } from './http';
import { requirePersonalNftEntitlement } from './nftProfileEntitlement';
import { createAdminCoupon, listAdminCoupons, updateAdminCouponStatus } from './routes/adminCoupons';
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

    if (url.pathname === '/api/admin/commercial/coupons') {
      try {
        if (request.method === 'GET') return await listAdminCoupons(request, env);
        if (request.method === 'POST') return await createAdminCoupon(request, env);
        return methodNotAllowed(['GET', 'POST']);
      } catch (error) {
        return errorResponse(error);
      }
    }

    const adminCoupon = url.pathname.match(/^\/api\/admin\/commercial\/coupons\/([^/]+)$/);
    if (adminCoupon) {
      try {
        if (request.method === 'PATCH') return await updateAdminCouponStatus(request, env, decodeURIComponent(adminCoupon[1]));
        return methodNotAllowed(['PATCH']);
      } catch (error) {
        return errorResponse(error);
      }
    }

    // Keep Free Personal accounts from consuming NFT provider capacity. Project
    // behavior is deliberately unchanged by this focused Controlled Beta fix.
    if (url.pathname === '/api/profile-wallets' && request.method === 'GET' && url.searchParams.get('includeNfts') === '1') {
      const profileId = url.searchParams.get('profileId');
      if (profileId) {
        try {
          await requirePersonalNftEntitlement(request, env, profileId);
        } catch (error) {
          return errorResponse(error);
        }
      }
    }

    return worker.fetch(request, env, ctx);
  },
};
