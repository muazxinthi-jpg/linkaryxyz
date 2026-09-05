import baseWorker from './index';
import type { Env } from './env';
import type { ExecutionContextLike } from './platform';
import { currentPersonalTelegramIdentity, refreshCurrentCdpLink } from './auth/cdpCurrentLink';
import { errorResponse, methodNotAllowed } from './http';
import { renderPublicProfileWithIdentity } from './routes/publicProfileIdentity';
import { getLinkaryUrls } from './urls';
import { startTelegramConnection, finishTelegramConnection } from './auth/telegram';
import { listCampaignCosts, recordCampaignCost, voidCampaignCost } from './routes/campaignCosts';
import { founderGrowthIntelligence } from './routes/growthIntelligence';
import { createNetworkInviteIntegrity } from './routes/inviteIntegrity';
import { renderInviteLanding } from './routes/invites';
import { redirectTrackedLink } from './routes/tracking';
import {
  applyToCampaignOpportunityIntegrity,
  listCampaignOpportunitiesIntegrity,
  reviewCampaignOpportunityApplicationIntegrity,
} from './routes/opportunityIntegrity';
import {
  reviewCommunityVerificationIntegrity,
  savePartnerManagerAssetIntegrity,
} from './routes/communityVerificationIntegrity';

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

    const inviteLanding = url.pathname.match(/^\/i\/([^/]+)$/);
    if (inviteLanding && request.method === 'GET') {
      try { return await renderInviteLanding(request, env, decodeURIComponent(inviteLanding[1])); }
      catch (error) { return errorResponse(error); }
    }
    const trackedRedirect = url.pathname.match(/^\/r\/([^/]+)$/);
    if (trackedRedirect && request.method === 'GET') {
      try { return await redirectTrackedLink(request, env, decodeURIComponent(trackedRedirect[1])); }
      catch (error) { return errorResponse(error); }
    }

    if (url.pathname === '/api/auth/telegram/start' || url.pathname === '/api/auth/telegram/callback') {
      try { return await (url.pathname.endsWith('/start') ? startTelegramConnection(request, env) : finishTelegramConnection(request, env)); }
      catch (error) { return errorResponse(error); }
    }
    if (url.pathname === '/api/auth/cdp/current-link') {
      try { return await refreshCurrentCdpLink(request, env); }
      catch (error) { return errorResponse(error); }
    }
    if (url.pathname === '/api/auth/telegram-identity') {
      try { return await currentPersonalTelegramIdentity(request, env); }
      catch (error) { return errorResponse(error); }
    }
    if (url.pathname === '/api/invites') {
      try {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await createNetworkInviteIntegrity(request, env);
      } catch (error) { return errorResponse(error); }
    }
    if (url.pathname === '/api/partner-manager-assets' && request.method === 'POST') {
      try { return await savePartnerManagerAssetIntegrity(request, env); }
      catch (error) { return errorResponse(error); }
    }
    const communityVerificationReview = url.pathname.match(/^\/api\/admin\/community-verifications\/([^/]+)\/(approve|reject)$/);
    if (communityVerificationReview && request.method === 'POST') {
      try {
        return await reviewCommunityVerificationIntegrity(
          request,
          env,
          decodeURIComponent(communityVerificationReview[1]),
          communityVerificationReview[2] as 'approve' | 'reject',
        );
      } catch (error) { return errorResponse(error); }
    }
    if (url.pathname === '/api/campaign-opportunities' && request.method === 'GET') {
      try { return await listCampaignOpportunitiesIntegrity(request, env); }
      catch (error) { return errorResponse(error); }
    }
    if (url.pathname === '/api/campaign-opportunity-applications' && request.method === 'POST') {
      try { return await applyToCampaignOpportunityIntegrity(request, env); }
      catch (error) { return errorResponse(error); }
    }
    const opportunityApplication = url.pathname.match(/^\/api\/campaign-opportunity-applications\/([^/]+)$/);
    if (opportunityApplication && request.method === 'PATCH') {
      try { return await reviewCampaignOpportunityApplicationIntegrity(request, env, decodeURIComponent(opportunityApplication[1])); }
      catch (error) { return errorResponse(error); }
    }
    if (url.pathname === '/api/growth-intelligence') {
      try {
        if (request.method === 'GET') return await founderGrowthIntelligence(request, env);
        return methodNotAllowed(['GET']);
      } catch (error) { return errorResponse(error); }
    }
    if (url.pathname === '/api/campaign-costs') {
      try {
        if (request.method === 'GET') return await listCampaignCosts(request, env);
        if (request.method === 'POST') return await recordCampaignCost(request, env);
        return methodNotAllowed(['GET', 'POST']);
      } catch (error) { return errorResponse(error); }
    }
    const voidCost = url.pathname.match(/^\/api\/campaign-costs\/([^/]+)\/void$/);
    if (voidCost) {
      try {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await voidCampaignCost(request, env, decodeURIComponent(voidCost[1]));
      } catch (error) { return errorResponse(error); }
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
