import worker from './worker';
import type { Env } from './env';
import type { ExecutionContextLike } from './platform';
import { errorResponse, methodNotAllowed } from './http';
import { requirePersonalNftEntitlement } from './nftProfileEntitlement';
import { listAdminCoupons, updateAdminCouponStatus } from './routes/adminCoupons';
import { createAdminCoupon100 } from './routes/adminCouponCreate100';
import { redeemFreeCoupon } from './routes/freeCouponRedemption';
import { redirectTrackedLink } from './routes/tracking';

const APP_SHELL_RECOVERY_COOKIE = '__Host-linkary_shell_v4';

function configuredHost(value: string | undefined, fallback: string): string {
  try { return new URL(value || fallback).hostname.toLowerCase(); }
  catch { return new URL(fallback).hostname.toLowerCase(); }
}

function hasCookie(request: Request, name: string): boolean {
  const source = request.headers.get('cookie') || '';
  return source.split(';').some((part) => part.trim().startsWith(`${name}=`));
}

function appShellResponse(request: Request, response: Response): Response {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const headers = new Headers(response.headers);
  headers.set('x-robots-tag', 'noindex, nofollow');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  headers.set('vary', 'Cookie');
  headers.set('x-linkary-shell-release', '2026-09-08-private-network-v4');

  // Some Controlled Beta browsers still hold an older authenticated app shell
  // that points at a previous hashed frontend bundle. Clear HTTP cache once per
  // browser for this recovery release, without touching sessions or local data.
  if (!hasCookie(request, APP_SHELL_RECOVERY_COOKIE)) {
    headers.set('clear-site-data', '"cache"');
    headers.append('set-cookie', `${APP_SHELL_RECOVERY_COOKIE}=1; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function superadminShellResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('pragma', 'no-cache');
  headers.set('expires', '0');
  headers.set('vary', 'Cookie');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function superadminCacheRecoveryResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  // Older Superadmin HTML was cached before the shell became no-store. The old
  // React bundle still calls this endpoint, so this response gives Chrome a
  // same-origin signal to discard that stale HTTP cache without touching the
  // Superadmin session cookie or local storage.
  headers.set('clear-site-data', '"cache"');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);
    const appHost = configuredHost(env.APP_BASE_URL, 'https://app.linkary.xyz');
    const superadminHost = configuredHost(env.SUPERADMIN_BASE_URL, 'https://sadmin.linkary.xyz');
    const requestHost = url.hostname.toLowerCase();
    const isAppHost = requestHost === appHost;
    const isSuperadminHost = requestHost === superadminHost;
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
        if (request.method === 'GET') {
          const response = await listAdminCoupons(request, env);
          return isSuperadminHost ? superadminCacheRecoveryResponse(response) : response;
        }
        if (request.method === 'POST') return await createAdminCoupon100(request, env);
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
    //
    // Administrative HTML is intentionally non-cacheable. This prevents an older
    // hashed frontend bundle from remaining pinned in a Superadmin browser after
    // a production deploy while still allowing hashed JS/CSS assets themselves to
    // use their normal immutable caching behavior.
    if (isSuperadminHost && !url.pathname.startsWith('/api/')) {
      const appBase = new URL(env.APP_BASE_URL || 'https://app.linkary.xyz');
      const shellUrl = new URL(request.url);
      shellUrl.protocol = appBase.protocol;
      shellUrl.host = appBase.host;
      const shellRequest = new Request(shellUrl.toString(), request);
      return superadminShellResponse(await worker.fetch(shellRequest, env, ctx));
    }

    const response = await worker.fetch(request, env, ctx);
    if (isAppHost && !url.pathname.startsWith('/api/')) return appShellResponse(request, response);
    return response;
  },
};
