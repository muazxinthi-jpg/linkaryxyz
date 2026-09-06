import worker from './worker';
import type { Env } from './env';
import type { ExecutionContextLike } from './platform';
import { errorResponse, methodNotAllowed } from './http';
import { requirePersonalNftEntitlement } from './nftProfileEntitlement';
import { createAdminCoupon, listAdminCoupons, updateAdminCouponStatus } from './routes/adminCoupons';
import { redeemFreeCoupon } from './routes/freeCouponRedemption';
import { redirectTrackedLink } from './routes/tracking';

function configuredHost(value: string | undefined, fallback: string): string {
  try { return new URL(value || fallback).hostname.toLowerCase(); }
  catch { return new URL(fallback).hostname.toLowerCase(); }
}

function noIndex(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);
    const superadminHost = configuredHost(env.SUPERADMIN_BASE_URL, 'https://sadmin.linkary.xyz');
    const isSuperadminHost = url.hostname.toLowerCase() === superadminHost;
    const trackedRedirect = url.pathname.match(/^\/r\/([^/]+)$/);

    if (isSuperadminHost && url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n', {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=3600',
          'x-robots-tag': 'noindex, nofollow, noarchive',
        },
      });
    }

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

    if (url.pathname === '/api/billing/coupon/redeem-free') {
      try {
        if (request.method === 'POST') return await redeemFreeCoupon(request, env);
        return methodNotAllowed(['POST']);
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

    // sadmin.linkary.xyz deliberately gets its own host-scoped __Host cookies.
    // For non-API navigation we internally reuse the authenticated app shell by
    // presenting the request to the Worker as app.linkary.xyz. The browser stays
    // on the Superadmin hostname, so its session never becomes a cross-subdomain
    // cookie and the existing security boundary remains intact.
    if (isSuperadminHost && !url.pathname.startsWith('/api/')) {
      const appBase = new URL(env.APP_BASE_URL || 'https://app.linkary.xyz');
      const shellUrl = new URL(request.url);
      shellUrl.protocol = appBase.protocol;
      shellUrl.host = appBase.host;
      const shellRequest = new Request(shellUrl.toString(), request);
      return noIndex(await worker.fetch(shellRequest, env, ctx));
    }

    return worker.fetch(request, env, ctx);
  },
};
