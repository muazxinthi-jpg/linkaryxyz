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
import { reviewPromotionCreative, verifyPromotionPayment } from './routes/profilePromotionPayments';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
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

      return await baseWorker.fetch(request, env, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
