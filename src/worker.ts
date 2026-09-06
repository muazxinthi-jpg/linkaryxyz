import baseWorker from './index';
import type { Env } from './env';
import type { ExecutionContextLike } from './platform';
import { currentPersonalTelegramIdentity, refreshCurrentCdpLink } from './auth/cdpCurrentLink';
import { errorResponse, methodNotAllowed } from './http';
import { renderPublicProfileWithIdentity } from './routes/publicProfileIdentity';
import { getLinkaryUrls } from './urls';
import { enhancePublicHomepage } from './homepagePricing';
import { startTelegramConnection, finishTelegramConnection } from './auth/telegram';
import { listCampaignCosts, recordCampaignCost, voidCampaignCost } from './routes/campaignCosts';
import { founderGrowthIntelligence } from './routes/growthIntelligence';
import { createNetworkInviteIntegrity } from './routes/inviteIntegrity';
import { renderInviteLanding } from './routes/invites';
import { redirectTrackedLink } from './routes/tracking';
import {
  billingPaymentConfigurationSafe,
  createBillingCheckoutSafe,
  verifyBillingCheckoutSafe,
} from './routes/billingCheckoutSafe';
import {
  createAdminEntitlementGrant,
  createAdminPriceOverride,
  listAdminCommercialAccounts,
  listAdminCommercialAudit,
  revokeAdminEntitlementGrant,
  revokeAdminPriceOverride,
} from './routes/adminCommercial';
import {
  addProfileBlockIntegrity,
  deleteProfileBlockIntegrity,
  getEditableProfileIntegrity,
  listProfileBlocksIntegrity,
  profileAnalyticsIntegrity,
  publishProfileIntegrity,
  reorderProfileBlocksIntegrity,
  updateProfileBlockIntegrity,
  updateProfileIntegrity,
} from './routes/profileRoleIntegrity';
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

    if (url.pathname === '/api/billing/payment-config') {
      try {
        if (request.method !== 'GET') return methodNotAllowed(['GET']);
        return await billingPaymentConfigurationSafe(request, env);
      } catch (error) { return errorResponse(error); }
    }
    if (url.pathname === '/api/billing/checkout') {
      try {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await createBillingCheckoutSafe(request, env);
      } catch (error) { return errorResponse(error); }
    }
    if (url.pathname === '/api/billing/checkout/verify') {
      try {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await verifyBillingCheckoutSafe(request, env);
      } catch (error) { return errorResponse(error); }
    }

    if (url.pathname === '/api/admin/commercial/accounts') {
      try {
        if (request.method !== 'GET') return methodNotAllowed(['GET']);
        return await listAdminCommercialAccounts(request, env);
      } catch (error) { return errorResponse(error); }
    }
    if (url.pathname === '/api/admin/commercial/audit') {
      try {
        if (request.method !== 'GET') return methodNotAllowed(['GET']);
        return await listAdminCommercialAudit(request, env);
      } catch (error) { return errorResponse(error); }
    }
    if (url.pathname === '/api/admin/commercial/grants') {
      try {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await createAdminEntitlementGrant(request, env);
      } catch (error) { return errorResponse(error); }
    }
    const commercialGrantRevoke = url.pathname.match(/^\/api\/admin\/commercial\/grants\/([^/]+)\/revoke$/);
    if (commercialGrantRevoke) {
      try {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await revokeAdminEntitlementGrant(request, env, decodeURIComponent(commercialGrantRevoke[1]));
      } catch (error) { return errorResponse(error); }
    }
    if (url.pathname === '/api/admin/commercial/price-overrides') {
      try {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await createAdminPriceOverride(request, env);
      } catch (error) { return errorResponse(error); }
    }
    const commercialOverrideRevoke = url.pathname.match(/^\/api\/admin\/commercial\/price-overrides\/([^/]+)\/revoke$/);
    if (commercialOverrideRevoke) {
      try {
        if (request.method !== 'POST') return methodNotAllowed(['POST']);
        return await revokeAdminPriceOverride(request, env, decodeURIComponent(commercialOverrideRevoke[1]));
      } catch (error) { return errorResponse(error); }
    }

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

    const profileBlock = url.pathname.match(/^\/api\/profiles\/([^/]+)\/blocks\/([^/]+)$/);
    if (profileBlock) {
      try {
        const profileId = decodeURIComponent(profileBlock[1]);
        const blockId = decodeURIComponent(profileBlock[2]);
        if (request.method === 'PATCH') return await updateProfileBlockIntegrity(request, env, profileId, blockId);
        if (request.method === 'DELETE') return await deleteProfileBlockIntegrity(request, env, profileId, blockId);
        return methodNotAllowed(['PATCH', 'DELETE']);
      } catch (error) { return errorResponse(error); }
    }
    const profileSubroute = url.pathname.match(/^\/api\/profiles\/([^/]+)\/(blocks|blocks-reorder|publish|unpublish|analytics)$/);
    if (profileSubroute) {
      try {
        const profileId = decodeURIComponent(profileSubroute[1]);
        const action = profileSubroute[2];
        if (action === 'blocks') {
          if (request.method === 'GET') return await listProfileBlocksIntegrity(request, env, profileId);
          if (request.method === 'POST') return await addProfileBlockIntegrity(request, env, profileId);
          return methodNotAllowed(['GET', 'POST']);
        }
        if (action === 'blocks-reorder') {
          if (request.method === 'POST') return await reorderProfileBlocksIntegrity(request, env, profileId);
          return methodNotAllowed(['POST']);
        }
        if (action === 'publish' || action === 'unpublish') {
          if (request.method === 'POST') return await publishProfileIntegrity(request, env, profileId, action === 'publish');
          return methodNotAllowed(['POST']);
        }
        if (request.method === 'GET') return await profileAnalyticsIntegrity(request, env, profileId);
        return methodNotAllowed(['GET']);
      } catch (error) { return errorResponse(error); }
    }
    const editableProfile = url.pathname.match(/^\/api\/profiles\/([^/]+)$/);
    if (editableProfile) {
      try {
        const profileId = decodeURIComponent(editableProfile[1]);
        if (request.method === 'GET') return await getEditableProfileIntegrity(request, env, profileId);
        if (request.method === 'PATCH') return await updateProfileIntegrity(request, env, profileId);
        return methodNotAllowed(['GET', 'PATCH']);
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

    const appHost = host(getLinkaryUrls(request, env).app);
    const publicHomepage = request.method === 'GET'
      && (url.pathname === '/' || url.pathname === '/index.html')
      && (!appHost || url.hostname.toLowerCase() !== appHost);
    if (publicHomepage) return enhancePublicHomepage(request, await baseWorker.fetch(request, env, ctx));
    return baseWorker.fetch(request, env, ctx);
  },
};