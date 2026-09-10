import worker from './worker';
import type { Env } from './env';
import type { ExecutionContextLike } from './platform';
import { errorResponse, methodNotAllowed } from './http';
import { requirePersonalNftEntitlement } from './nftProfileEntitlement';
import { listAdminCoupons, updateAdminCouponStatus } from './routes/adminCoupons';
import { createAdminCoupon100 } from './routes/adminCouponCreate100';
import { updateAdminCouponAccessUntil } from './routes/adminCouponAccessUntil';
import { updateAdminCouponAccessDuration } from './routes/adminCouponAccessDuration';
import { redeemFreeCoupon } from './routes/freeCouponRedemption';
import {
  adminPlatformIntelligence,
  createInternalReferralReward,
  updateInternalReferralRewardStatus,
  upsertPlatformGrowthTarget,
} from './routes/adminPlatformIntelligence';
import {
  adminReferralRewardIntelligence,
  updateReferralRewardDecision,
  updateReferralRewardRule,
} from './routes/adminReferralRewardIntelligence';
import { redirectTrackedLink } from './routes/tracking';

const APP_SHELL_RELEASE = '2026-09-09-private-network-v5';
const APP_SHELL_RECOVERY_COOKIE = '__Host-linkary_shell_v5';

function configuredHost(value: string | undefined, fallback: string): string {
  try { return new URL(value || fallback).hostname.toLowerCase(); }
  catch { return new URL(fallback).hostname.toLowerCase(); }
}

function hasCookie(request: Request, name: string): boolean {
  const source = request.headers.get('cookie') || '';
  return source.split(';').some((part) => part.trim().startsWith(`${name}=`));
}

function applyAppCacheRecovery(request: Request, headers: Headers) {
  if (hasCookie(request, APP_SHELL_RECOVERY_COOKIE)) return;
  headers.set('clear-site-data', '"cache"');
  headers.append('set-cookie', `${APP_SHELL_RECOVERY_COOKIE}=1; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000`);
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
  headers.set('x-linkary-shell-release', APP_SHELL_RELEASE);

  // Rotate the recovery cookie for this release so browsers that were already
  // running a pre-Private-Network app can discard their old HTTP cache once.
  // Sessions, local storage and wallet state are deliberately untouched.
  applyAppCacheRecovery(request, headers);

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function appApiCacheRecoveryResponse(request: Request, response: Response): Response {
  if (hasCookie(request, APP_SHELL_RECOVERY_COOKIE)) return response;
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
  headers.set('x-linkary-shell-release', APP_SHELL_RELEASE);
  applyAppCacheRecovery(request, headers);
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

    if (url.pathname === '/api/admin/platform-intelligence') {
      try {
        if (request.method === 'GET') return await adminPlatformIntelligence(request, env);
        return methodNotAllowed(['GET']);
      } catch (error) {
        return errorResponse(error);
      }
    }

    if (url.pathname === '/api/admin/platform-intelligence/referral-reward-intelligence') {
      try {
        if (request.method === 'GET') return await adminReferralRewardIntelligence(request, env);
        return methodNotAllowed(['GET']);
      } catch (error) {
        return errorResponse(error);
      }
    }

    if (url.pathname === '/api/admin/platform-intelligence/referral-reward-rule') {
      try {
        if (request.method === 'POST') return await updateReferralRewardRule(request, env);
        return methodNotAllowed(['POST']);
      } catch (error) {
        return errorResponse(error);
      }
    }

    const referralRewardPaymentStatus = url.pathname.match(/^\/api\/admin\/platform-intelligence\/referral-reward-payments\/([^/]+)\/status$/);
    if (referralRewardPaymentStatus) {
      try {
        if (request.method === 'POST') return await updateReferralRewardDecision(request, env, decodeURIComponent(referralRewardPaymentStatus[1]));
        return methodNotAllowed(['POST']);
      } catch (error) {
        return errorResponse(error);
      }
    }

    if (url.pathname === '/api/admin/platform-intelligence/referral-rewards') {
      try {
        if (request.method === 'POST') return await createInternalReferralReward(request, env);
        return methodNotAllowed(['POST']);
      } catch (error) {
        return errorResponse(error);
      }
    }

    const internalRewardStatus = url.pathname.match(/^\/api\/admin\/platform-intelligence\/referral-rewards\/([^/]+)\/status$/);
    if (internalRewardStatus) {
      try {
        if (request.method === 'POST') return await updateInternalReferralRewardStatus(request, env, decodeURIComponent(internalRewardStatus[1]));
        return methodNotAllowed(['POST']);
      } catch (error) {
        return errorResponse(error);
      }
    }

    if (url.pathname === '/api/admin/platform-intelligence/growth-targets') {
      try {
        if (request.method === 'POST') return await upsertPlatformGrowthTarget(request, env);
        return methodNotAllowed(['POST']);
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

    const adminCouponAccessUntil = url.pathname.match(/^\/api\/admin\/commercial\/coupons\/([^/]+)\/access-until$/);
    if (adminCouponAccessUntil) {
      try {
        if (request.method === 'PATCH') return await updateAdminCouponAccessUntil(request, env, decodeURIComponent(adminCouponAccessUntil[1]));
        return methodNotAllowed(['PATCH']);
      } catch (error) {
        return errorResponse(error);
      }
    }

    const adminCouponAccessDuration = url.pathname.match(/^\/api\/admin\/commercial\/coupons\/([^/]+)\/access-duration$/);
    if (adminCouponAccessDuration) {
      try {
        if (request.method === 'PATCH') return await updateAdminCouponAccessDuration(request, env, decodeURIComponent(adminCouponAccessDuration[1]));
        return methodNotAllowed(['PATCH']);
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

    // An already-running pre-v5 app still calls /api/auth/me whenever a Product
    // workspace opens. Use that guaranteed request to clear only the HTTP cache
    // once, so one ordinary reload can recover even when no new HTML navigation
    // occurred before the stale bundle rendered.
    if (isAppHost && url.pathname === '/api/auth/me') {
      return appApiCacheRecoveryResponse(request, await worker.fetch(request, env, ctx));
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

    // Only HTML navigation on the authenticated app host gets recovery headers.
    // API routes and all non-app hosts preserve the direct Worker fallback used
    // by tracking, NFT entitlement, and public-profile integrity contracts.
    if (isAppHost && !url.pathname.startsWith('/api/')) {
      return appShellResponse(request, await worker.fetch(request, env, ctx));
    }
    return worker.fetch(request, env, ctx);
  },
};