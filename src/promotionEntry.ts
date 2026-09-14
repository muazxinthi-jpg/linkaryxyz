import baseWorker from './trackingEntry';
import type { Env } from './env';
import type { ExecutionContextLike } from './platform';
import { errorResponse, methodNotAllowed } from './http';
import {
  configurePromotionSlot,
  createPromotionAuction,
  finalizePromotionAuction,
  getLiveProfilePromotion,
  getPromotionAuction,
  placePromotionBid,
  submitPromotionCreative,
} from './routes/profilePromotions';
import { getMyPromotionPayment, reviewPromotionCreative, verifyPromotionPayment } from './routes/profilePromotionPayments';
import { listPromotionCreativeQueue } from './routes/adminProfilePromotions';
import { getFeaturedHeader, upsertFeaturedHeader } from './routes/profileFeaturedHeaders';
import {
  enhancePublicProfileWithPromotion,
  recordFeaturedHeaderImpression,
  recordPromotionImpression,
  redirectFeaturedHeaderClick,
  redirectPromotionClick,
} from './routes/profilePromotionDelivery';
import { refinePublicProfilePromotionLayout } from './routes/profilePromotionLayout';

function publicProfileUsername(request: Request, env: Env): string | null {
  const url = new URL(request.url);
  let publicHost = 'linkary.xyz';
  try { publicHost = new URL(env.PUBLIC_SITE_URL || 'https://linkary.xyz').hostname.toLowerCase(); } catch { /* keep fallback */ }
  if (url.hostname.toLowerCase() !== publicHost) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 1) return null;
  const candidate = decodeURIComponent(parts[0]).trim().toLowerCase();
  const reserved = new Set(['api','app','admin','pricing','about','blog','privacy','terms','support','help','status','security','login','signup','dashboard','campaigns','creators','communities','tracking','profile','invites','settings','wallets','partners','opportunities','robots.txt','sitemap.xml']);
  if (!candidate || candidate.includes('.') || reserved.has(candidate)) return null;
  return candidate;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      const featuredHeader = path.match(/^\/api\/profiles\/([^/]+)\/featured-header$/);
      if (featuredHeader) {
        const profileId = decodeURIComponent(featuredHeader[1]);
        if (request.method === 'GET') return await getFeaturedHeader(request, env, profileId);
        if (request.method === 'PUT') return await upsertFeaturedHeader(request, env, profileId);
        return methodNotAllowed(['GET', 'PUT']);
      }
      const slot = path.match(/^\/api\/profiles\/([^/]+)\/promotion-slot$/);
      if (slot) {
        if (request.method !== 'PUT') return methodNotAllowed(['PUT']);
        return await configurePromotionSlot(request, env, decodeURIComponent(slot[1]));
      }
      const createAuction = path.match(/^\/api\/profiles\/([^/]+)\/promotion-auctions$/);
      if (createAuction) {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await createPromotionAuction(request, env, decodeURIComponent(createAuction[1]));
      }
      const auction = path.match(/^\/api\/promotion-auctions\/([^/]+)$/);
      if (auction) {
        if (request.method !== 'GET') return methodNotAllowed(['GET']);
        return await getPromotionAuction(request, env, decodeURIComponent(auction[1]));
      }
      const bid = path.match(/^\/api\/promotion-auctions\/([^/]+)\/bids$/);
      if (bid) {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await placePromotionBid(request, env, decodeURIComponent(bid[1]));
      }
      const finalize = path.match(/^\/api\/promotion-auctions\/([^/]+)\/finalize$/);
      if (finalize) {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await finalizePromotionAuction(request, env, decodeURIComponent(finalize[1]));
      }
      const paymentStatus = path.match(/^\/api\/promotion-auctions\/([^/]+)\/payment$/);
      if (paymentStatus) {
        if (request.method !== 'GET') return methodNotAllowed(['GET']);
        return await getMyPromotionPayment(request, env, decodeURIComponent(paymentStatus[1]));
      }
      const payment = path.match(/^\/api\/promotion-auctions\/([^/]+)\/payment\/verify$/);
      if (payment) {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await verifyPromotionPayment(request, env, decodeURIComponent(payment[1]));
      }
      const creative = path.match(/^\/api\/promotion-auctions\/([^/]+)\/creative$/);
      if (creative) {
        if (request.method !== 'PUT') return methodNotAllowed(['PUT']);
        return await submitPromotionCreative(request, env, decodeURIComponent(creative[1]));
      }
      if (path === '/api/admin/promotion-creatives') {
        if (request.method !== 'GET') return methodNotAllowed(['GET']);
        return await listPromotionCreativeQueue(request, env);
      }
      const creativeReview = path.match(/^\/api\/admin\/promotion-creatives\/([^/]+)\/review$/);
      if (creativeReview) {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await reviewPromotionCreative(request, env, decodeURIComponent(creativeReview[1]));
      }
      const live = path.match(/^\/api\/public\/profiles\/([^/]+)\/promotion$/);
      if (live) {
        if (request.method !== 'GET') return methodNotAllowed(['GET']);
        return await getLiveProfilePromotion(request, env, decodeURIComponent(live[1]));
      }
      const featuredImpression = path.match(/^\/api\/public\/featured-header-impressions\/([^/]+)$/);
      if (featuredImpression) {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await recordFeaturedHeaderImpression(request, env, decodeURIComponent(featuredImpression[1]));
      }
      const impression = path.match(/^\/api\/public\/promotion-impressions\/([^/]+)$/);
      if (impression) {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await recordPromotionImpression(request, env, decodeURIComponent(impression[1]));
      }
      const featuredClick = path.match(/^\/f\/([^/]+)$/);
      if (featuredClick) {
        if (request.method !== 'GET') return methodNotAllowed(['GET']);
        return await redirectFeaturedHeaderClick(request, env, decodeURIComponent(featuredClick[1]));
      }
      const click = path.match(/^\/p\/([^/]+)$/);
      if (click) {
        if (request.method !== 'GET') return methodNotAllowed(['GET']);
        return await redirectPromotionClick(request, env, decodeURIComponent(click[1]));
      }
      const username = request.method === 'GET' ? publicProfileUsername(request, env) : null;
      const response = await baseWorker.fetch(request, env, ctx);
      if (!username) return response;
      const enhanced = await enhancePublicProfileWithPromotion(response, request, env, username);
      return await refinePublicProfilePromotionLayout(enhanced);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
