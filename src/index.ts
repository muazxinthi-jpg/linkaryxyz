import type { Env } from './env';
import type { ExecutionContextLike } from './platform';
import { errorResponse, json, methodNotAllowed } from './http';
import { finishXOAuth, startXOAuth } from './auth/x';
import { createCdpSession } from './auth/cdp';
import { getAuthContext, requireAuth, revokeCurrentSession, verifyCsrf } from './auth/session';
import { createEarnedAccess, previewInvite } from './routes/access';
import {
  approveCreatorAccessClaim,
  creatorAccessClaimStatus,
  creatorAccessVerificationSetting,
  listCreatorAccessClaims,
  rejectCreatorAccessClaim,
  startCreatorAccessClaim,
  submitCreatorAccessPost,
} from './routes/creatorAccess';
import { completeOnboarding, onboardingStatus } from './routes/onboarding';
import {
  addProfileBlock,
  deleteProfileBlock,
  publicProfileJson,
  publishProfile,
  renderSitemap,
  reorderProfileBlocks,
  updateProfile,
  getEditableProfile,
  listProfileBlocks,
  profileAnalytics,
  redirectPublicProfileBlock,
  updateProfileBlock,
} from './routes/profiles';
import { renderPublicProfileWithIdentity } from './routes/publicProfileIdentity';
import { personalProfileIdentity } from './routes/profileIdentity';
import { adjustInviteCredits, adminHealth, listAdminUsers, listInviteCreditOwners, setAdminUserStatus } from './routes/admin';
import { adjustUsageCredits, listAdminBillingPlans, listPublicBillingPlans, updateAdminBillingPlan } from './routes/billing';
import { currentBillingStatus } from './routes/billingCurrent';
import { listContactRevealHistory, revealPartnerContact } from './routes/contactReveals';
import { archiveOrganization, createOrganization, listOrganizations, restoreOrganization } from './routes/organizations';
import { createNetworkInvite, inviteBalances, listNetworkInvites, renderInviteLanding } from './routes/invites';
import { createCampaign, listCampaigns } from './routes/campaigns';
import { updateCampaignLifecycleStatus } from './routes/campaignLifecycle';
import { createActivity, listActivities } from './routes/activities';
import { updateActivityLifecycleStatus } from './routes/activityLifecycle';
import { createTrackedLink, listTrackedLinks, redirectTrackedLink, updateTrackedLinkStatus } from './routes/tracking';
import { campaignOutcomeSummary, createConversion, listConversions } from './routes/conversions';
import { assignNetworkEntity, createNetworkEntity, listNetworkEntities } from './routes/network';
import { partnerRelationships } from './routes/partnerRelationships';
import { listProjectShortlist, promoteShortlistPartner, saveProjectShortlist } from './routes/shortlists';
import { listPartnerManagerAssets, listPartnerManagers, savePartnerManager, savePartnerManagerAsset } from './routes/partnerDirectory';
import { communityVerificationStatus, listCommunityVerificationReviews, reviewCommunityVerification, submitCommunityVerification } from './routes/communityVerification';
import { partnerManagerReputation, recordPartnerManagerCollaboration } from './routes/partnerReputation';
import { applyToCampaignOpportunity, listCampaignOpportunities, listCampaignOpportunityApplications, reviewCampaignOpportunityApplication, saveCampaignOpportunity } from './routes/opportunities';
import { listProfileWalletDestinations, saveProfileWalletDestination } from './routes/wallets';
import { addProjectMember, cancelMyProjectAccessRequest, listMyProjectAccessRequests, listProjectAccessRequests, listProjectMembers, removeProjectMember, requestProjectAccess, reviewProjectAccessRequest, searchEligibleProjectMembers, searchRegisteredProjects, transferProjectOwnership, updateProjectMember } from './routes/projectAccess';
import { serveStatic } from './static';
import { getLinkaryUrls } from './urls';

const STATIC_OR_SYSTEM = new Set([
  '', 'index.html', 'styles.css', 'script.js', 'uilib.md', 'favicon.ico', 'assets', 'api', 'onboarding', 'admin', 'app', 'i',
  'robots.txt', 'sitemap.xml', 'pricing', 'about', 'blog', 'privacy', 'terms', 'support', 'help', 'status', 'security',
  'login', 'signup', 'dashboard', 'campaigns', 'creators', 'communities', 'tracking', 'profile', 'invites', 'settings', 'wallets', 'partners', 'opportunities',
]);

function singleSegmentProfilePath(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length !== 1) return null;
  const segment = decodeURIComponent(parts[0]).toLowerCase();
  if (STATIC_OR_SYSTEM.has(segment) || segment.includes('.')) return null;
  return segment;
}

function hostname(value: string): string | null {
  try { return new URL(value).hostname.toLowerCase(); }
  catch { return null; }
}

function withNoIndex(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('x-robots-tag', 'noindex, nofollow');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/api/health') {
    return json({
      ok: true,
      service: 'linkary',
      version: 'creator-access-review',
      database: env.DB ? 'bound' : 'not-bound',
      cdp: env.CDP_PROJECT_ID ? 'configured' : 'not-configured',
      urls: getLinkaryUrls(request, env),
    });
  }
  if (path === '/api/billing/plans') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return listPublicBillingPlans(request, env); }
  if (path === '/api/billing/current') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return currentBillingStatus(request, env); }
  if (path === '/api/auth/cdp/session') { if (request.method !== 'POST') return methodNotAllowed(['POST']); return createCdpSession(request, env); }
  if (path === '/api/auth/me') {
    if (request.method !== 'GET') return methodNotAllowed(['GET']);
    const auth = await getAuthContext(request, env);
    return json({ authenticated: Boolean(auth), user: auth ? { id: auth.user.id, displayName: auth.user.display_name, superadmin: auth.isSuperadmin } : null });
  }
  if (path === '/api/auth/x/start') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return startXOAuth(request, env); }
  if (path === '/api/auth/x/callback') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return finishXOAuth(request, env); }
  if (path === '/api/auth/logout') {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    const auth = await requireAuth(request, env);
    await verifyCsrf(request, env, auth);
    const cookies = await revokeCurrentSession(request, env);
    const headers = new Headers();
    for (const cookie of cookies) headers.append('set-cookie', cookie);
    return json({ ok: true }, { headers });
  }

  if (path === '/api/access/earned') { if (request.method !== 'POST') return methodNotAllowed(['POST']); return createEarnedAccess(request, env); }
  if (path === '/api/access/creator/claim') {
    if (request.method === 'POST') return startCreatorAccessClaim(request, env);
    if (request.method === 'GET') return creatorAccessClaimStatus(request, env);
    return methodNotAllowed(['GET', 'POST']);
  }
  if (path === '/api/access/creator/claim/submit') {
    if (request.method !== 'POST') return methodNotAllowed(['POST']);
    return submitCreatorAccessPost(request, env);
  }

  const invitePreview = path.match(/^\/api\/invites\/([^/]+)\/preview$/);
  if (invitePreview) { if (request.method !== 'GET') return methodNotAllowed(['GET']); return previewInvite(decodeURIComponent(invitePreview[1]), env); }
  if (path === '/api/onboarding/status') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return onboardingStatus(request, env); }
  if (path === '/api/onboarding/complete') { if (request.method !== 'POST') return methodNotAllowed(['POST']); return completeOnboarding(request, env); }
  const publicProfile = path.match(/^\/api\/public\/profiles\/([^/]+)$/);
  if (publicProfile) { if (request.method !== 'GET') return methodNotAllowed(['GET']); return publicProfileJson(decodeURIComponent(publicProfile[1]), env); }
  if (path === '/api/organizations') {
    if (request.method === 'GET') return listOrganizations(request, env);
    if (request.method === 'POST') return createOrganization(request, env);
    return methodNotAllowed(['GET', 'POST']);
  }
  if (path === '/api/projects/search') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return searchRegisteredProjects(request, env); }
  if (path === '/api/projects/access-requests/mine') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return listMyProjectAccessRequests(request, env); }
  const cancelProjectAccessRequest = path.match(/^\/api\/projects\/access-requests\/([^/]+)\/cancel$/);
  if (cancelProjectAccessRequest) { if (request.method !== 'POST') return methodNotAllowed(['POST']); return cancelMyProjectAccessRequest(request, env, decodeURIComponent(cancelProjectAccessRequest[1])); }
  const projectAccessRequests = path.match(/^\/api\/projects\/([^/]+)\/access-requests$/);
  if (projectAccessRequests) { if (request.method === 'GET') return listProjectAccessRequests(request, env, decodeURIComponent(projectAccessRequests[1])); if (request.method === 'POST') return requestProjectAccess(request, env, decodeURIComponent(projectAccessRequests[1])); return methodNotAllowed(['GET', 'POST']); }
  const projectAccessReview = path.match(/^\/api\/projects\/access-requests\/([^/]+)\/(approve|reject)$/);
  if (projectAccessReview) { if (request.method !== 'POST') return methodNotAllowed(['POST']); return reviewProjectAccessRequest(request, env, decodeURIComponent(projectAccessReview[1]), projectAccessReview[2] as 'approve' | 'reject'); }
  const projectMembers = path.match(/^\/api\/projects\/([^/]+)\/members$/);
  if (projectMembers) { if (request.method === 'GET') return listProjectMembers(request, env, decodeURIComponent(projectMembers[1])); if (request.method === 'POST') return addProjectMember(request, env, decodeURIComponent(projectMembers[1])); return methodNotAllowed(['GET', 'POST']); }
  const eligibleProjectMembers = path.match(/^\/api\/projects\/([^/]+)\/eligible-members$/);
  if (eligibleProjectMembers) { if (request.method !== 'GET') return methodNotAllowed(['GET']); return searchEligibleProjectMembers(request, env, decodeURIComponent(eligibleProjectMembers[1])); }
  const projectMember = path.match(/^\/api\/projects\/([^/]+)\/members\/([^/]+)$/);
  if (projectMember) { if (request.method === 'PATCH') return updateProjectMember(request, env, decodeURIComponent(projectMember[1]), decodeURIComponent(projectMember[2])); if (request.method === 'DELETE') return removeProjectMember(request, env, decodeURIComponent(projectMember[1]), decodeURIComponent(projectMember[2])); return methodNotAllowed(['PATCH', 'DELETE']); }
  const transferProjectOwner = path.match(/^\/api\/projects\/([^/]+)\/transfer-ownership$/);
  if (transferProjectOwner) { if (request.method !== 'POST') return methodNotAllowed(['POST']); return transferProjectOwnership(request, env, decodeURIComponent(transferProjectOwner[1])); }
  const archiveOrg = path.match(/^\/api\/organizations\/([^/]+)\/archive$/);
  if (archiveOrg) { if (request.method !== 'POST') return methodNotAllowed(['POST']); return archiveOrganization(request, env, decodeURIComponent(archiveOrg[1])); }
  const restoreOrg = path.match(/^\/api\/organizations\/([^/]+)\/restore$/);
  if (restoreOrg) { if (request.method !== 'POST') return methodNotAllowed(['POST']); return restoreOrganization(request, env, decodeURIComponent(restoreOrg[1])); }
  if (path === '/api/invites/balances') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return inviteBalances(request, env); }
  if (path === '/api/invites/list') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return listNetworkInvites(request, env); }
  if (path === '/api/campaigns') { if (request.method === 'GET') return listCampaigns(request, env); if (request.method === 'POST') return createCampaign(request, env); return methodNotAllowed(['GET', 'POST']); }
  const campaignStatus = path.match(/^\/api\/campaigns\/([^/]+)\/status$/);
  if (campaignStatus) { if (request.method !== 'PATCH') return methodNotAllowed(['PATCH']); return updateCampaignLifecycleStatus(request, env, decodeURIComponent(campaignStatus[1])); }
  if (path === '/api/campaign-activities') { if (request.method === 'GET') return listActivities(request, env); if (request.method === 'POST') return createActivity(request, env); return methodNotAllowed(['GET', 'POST']); }
  const activityStatus = path.match(/^\/api\/campaign-activities\/([^/]+)\/status$/);
  if (activityStatus) { if (request.method !== 'PATCH') return methodNotAllowed(['PATCH']); return updateActivityLifecycleStatus(request, env, decodeURIComponent(activityStatus[1])); }
  if (path === '/api/tracked-links') { if (request.method === 'GET') return listTrackedLinks(request, env); if (request.method === 'POST') return createTrackedLink(request, env); return methodNotAllowed(['GET', 'POST']); }
  const trackedLinkStatus = path.match(/^\/api\/tracked-links\/([^/]+)\/status$/);
  if (trackedLinkStatus) { if (request.method !== 'PATCH') return methodNotAllowed(['PATCH']); return updateTrackedLinkStatus(request, env, decodeURIComponent(trackedLinkStatus[1])); }
  if (path === '/api/conversions') { if (request.method === 'GET') return listConversions(request, env); if (request.method === 'POST') return createConversion(request, env); return methodNotAllowed(['GET', 'POST']); }
  if (path === '/api/network-entities') { if (request.method === 'GET') return listNetworkEntities(request, env); if (request.method === 'POST') return createNetworkEntity(request, env); return methodNotAllowed(['GET', 'POST']); }
  if (path === '/api/partner-relationships') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return partnerRelationships(request, env); }
  if (path === '/api/project-partner-shortlists') { if (request.method === 'GET') return listProjectShortlist(request, env); if (request.method === 'POST') return saveProjectShortlist(request, env); return methodNotAllowed(['GET', 'POST']); }
  const promoteShortlist = path.match(/^\/api\/project-partner-shortlists\/([^/]+)\/promote$/);
  if (promoteShortlist) { if (request.method !== 'POST') return methodNotAllowed(['POST']); return promoteShortlistPartner(request, env, decodeURIComponent(promoteShortlist[1])); }
  if (path === '/api/campaign-activity-participants') { if (request.method !== 'POST') return methodNotAllowed(['POST']); return assignNetworkEntity(request, env); }
  if (path === '/api/campaign-outcomes') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return campaignOutcomeSummary(request, env); }

  if (path === '/api/partner-managers') { if (request.method === 'GET') return listPartnerManagers(request, env); if (request.method === 'POST') return savePartnerManager(request, env); return methodNotAllowed(['GET', 'POST']); }
  if (path === '/api/partner-manager-assets') { if (request.method === 'GET') return listPartnerManagerAssets(request, env); if (request.method === 'POST') return savePartnerManagerAsset(request, env); return methodNotAllowed(['GET', 'POST']); }
  const partnerContactReveal = path.match(/^\/api\/partner-managers\/([^/]+)\/reveal$/);
  if (partnerContactReveal) { if (request.method !== 'POST') return methodNotAllowed(['POST']); return revealPartnerContact(request, env, decodeURIComponent(partnerContactReveal[1])); }
  if (path === '/api/contact-reveals/history') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return listContactRevealHistory(request, env); }
  if (path === '/api/community-verifications') {
    if (request.method === 'GET') return communityVerificationStatus(request, env);
    if (request.method === 'POST') return submitCommunityVerification(request, env);
    return methodNotAllowed(['GET', 'POST']);
  }
  if (path === '/api/partner-manager-reputation') { if (request.method === 'GET') return partnerManagerReputation(request, env); if (request.method === 'POST') return recordPartnerManagerCollaboration(request, env); return methodNotAllowed(['GET', 'POST']); }
  if (path === '/api/campaign-opportunities') { if (request.method === 'GET') return listCampaignOpportunities(request, env); if (request.method === 'POST') return saveCampaignOpportunity(request, env); return methodNotAllowed(['GET', 'POST']); }
  if (path === '/api/campaign-opportunity-applications') { if (request.method === 'GET') return listCampaignOpportunityApplications(request, env); if (request.method === 'POST') return applyToCampaignOpportunity(request, env); return methodNotAllowed(['GET', 'POST']); }
  const opportunityApplicationReview = path.match(/^\/api\/campaign-opportunity-applications\/([^/]+)$/);
  if (opportunityApplicationReview) { if (request.method !== 'PATCH') return methodNotAllowed(['PATCH']); return reviewCampaignOpportunityApplication(request, env, decodeURIComponent(opportunityApplicationReview[1])); }

  if (path === '/api/invites') { if (request.method !== 'POST') return methodNotAllowed(['POST']); return createNetworkInvite(request, env); }
  if (path === '/api/profile-wallets') { if (request.method === 'GET') return listProfileWalletDestinations(request, env); if (request.method === 'POST') return saveProfileWalletDestination(request, env); return methodNotAllowed(['GET', 'POST']); }
  const profilePatch = path.match(/^\/api\/profiles\/([^/]+)$/);
  if (profilePatch) { if (request.method === 'GET') return getEditableProfile(request, env, decodeURIComponent(profilePatch[1])); if (request.method === 'PATCH') return updateProfile(request, env, decodeURIComponent(profilePatch[1])); return methodNotAllowed(['GET', 'PATCH']); }
  const profileIdentity = path.match(/^\/api\/profiles\/([^/]+)\/identity$/);
  if (profileIdentity) { if (request.method !== 'GET' && request.method !== 'PATCH') return methodNotAllowed(['GET', 'PATCH']); return personalProfileIdentity(request, env, decodeURIComponent(profileIdentity[1])); }
  const profileAnalyticsRoute = path.match(/^\/api\/profiles\/([^/]+)\/analytics$/);
  if (profileAnalyticsRoute) { if (request.method !== 'GET') return methodNotAllowed(['GET']); return profileAnalytics(request, env, decodeURIComponent(profileAnalyticsRoute[1])); }
  const profileBlocks = path.match(/^\/api\/profiles\/([^/]+)\/blocks$/);
  if (profileBlocks) { if (request.method === 'GET') return listProfileBlocks(request, env, decodeURIComponent(profileBlocks[1])); if (request.method === 'POST') return addProfileBlock(request, env, decodeURIComponent(profileBlocks[1])); return methodNotAllowed(['GET', 'POST']); }
  const profileBlock = path.match(/^\/api\/profiles\/([^/]+)\/blocks\/([^/]+)$/);
  if (profileBlock) {
    if (request.method === 'PATCH') return updateProfileBlock(request, env, decodeURIComponent(profileBlock[1]), decodeURIComponent(profileBlock[2]));
    if (request.method === 'DELETE') return deleteProfileBlock(request, env, decodeURIComponent(profileBlock[1]), decodeURIComponent(profileBlock[2]));
    return methodNotAllowed(['PATCH', 'DELETE']);
  }
  const profileReorder = path.match(/^\/api\/profiles\/([^/]+)\/blocks-reorder$/);
  if (profileReorder) { if (request.method !== 'POST') return methodNotAllowed(['POST']); return reorderProfileBlocks(request, env, decodeURIComponent(profileReorder[1])); }
  const profilePublish = path.match(/^\/api\/profiles\/([^/]+)\/publish$/);
  if (profilePublish) { if (request.method !== 'POST') return methodNotAllowed(['POST']); return publishProfile(request, env, decodeURIComponent(profilePublish[1]), true); }
  const profileUnpublish = path.match(/^\/api\/profiles\/([^/]+)\/unpublish$/);
  if (profileUnpublish) { if (request.method !== 'POST') return methodNotAllowed(['POST']); return publishProfile(request, env, decodeURIComponent(profileUnpublish[1]), false); }

  if (path === '/api/admin/health') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return adminHealth(request, env); }
  if (path === '/api/admin/users') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return listAdminUsers(request, env); }
  if (path === '/api/admin/invite-credit-owners') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return listInviteCreditOwners(request, env); }
  if (path === '/api/admin/invite-credits/adjust') { if (request.method !== 'POST') return methodNotAllowed(['POST']); return adjustInviteCredits(request, env); }
  if (path === '/api/admin/billing/plans') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return listAdminBillingPlans(request, env); }
  const adminBillingPlan = path.match(/^\/api\/admin\/billing\/plans\/([^/]+)$/);
  if (adminBillingPlan) { if (request.method !== 'PATCH') return methodNotAllowed(['PATCH']); return updateAdminBillingPlan(request, env, decodeURIComponent(adminBillingPlan[1])); }
  if (path === '/api/admin/usage-credits/adjust') { if (request.method !== 'POST') return methodNotAllowed(['POST']); return adjustUsageCredits(request, env); }
  if (path === '/api/admin/community-verifications') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return listCommunityVerificationReviews(request, env); }
  const communityVerificationReview = path.match(/^\/api\/admin\/community-verifications\/([^/]+)\/(approve|reject)$/);
  if (communityVerificationReview) { if (request.method !== 'POST') return methodNotAllowed(['POST']); return reviewCommunityVerification(request, env, decodeURIComponent(communityVerificationReview[1]), communityVerificationReview[2] as 'approve' | 'reject'); }
  const adminUser = path.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
  if (adminUser) { if (request.method !== 'POST') return methodNotAllowed(['POST']); return setAdminUserStatus(request, env, decodeURIComponent(adminUser[1])); }
  if (path === '/api/admin/creator-access') { if (request.method !== 'GET') return methodNotAllowed(['GET']); return listCreatorAccessClaims(request, env); }
  const approveClaim = path.match(/^\/api\/admin\/creator-access\/([^/]+)\/approve$/);
  if (approveClaim) { if (request.method !== 'POST') return methodNotAllowed(['POST']); return approveCreatorAccessClaim(request, env, decodeURIComponent(approveClaim[1])); }
  const rejectClaim = path.match(/^\/api\/admin\/creator-access\/([^/]+)\/reject$/);
  if (rejectClaim) { if (request.method !== 'POST') return methodNotAllowed(['POST']); return rejectCreatorAccessClaim(request, env, decodeURIComponent(rejectClaim[1])); }
  if (path === '/api/admin/settings/creator-access-verification') {
    if (request.method !== 'GET' && request.method !== 'PATCH') return methodNotAllowed(['GET', 'PATCH']);
    return creatorAccessVerificationSetting(request, env);
  }

  return json({ error: 'not_found', message: 'API route not found' }, { status: 404 });
}

async function serveApp(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/app' || url.pathname === '/app/') {
    const canonical = new URL(request.url);
    canonical.pathname = '/';
    return Response.redirect(canonical.toString(), 308);
  }
  if (url.pathname === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' } });
  }
  if (url.pathname.startsWith('/app/assets/') || url.pathname.startsWith('/assets/')) {
    return withNoIndex(await serveStatic(request, env));
  }
  const shellUrl = new URL(request.url);
  shellUrl.pathname = '/app/index.html';
  shellUrl.search = '';
  const shellRequest = new Request(shellUrl.toString(), request);
  return withNoIndex(await serveStatic(shellRequest, env));
}

async function handle(request: Request, env: Env, _ctx: ExecutionContextLike): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return handleApi(request, env);

  const urls = getLinkaryUrls(request, env);
  const appHost = hostname(urls.app);
  if (appHost && url.hostname.toLowerCase() === appHost) return serveApp(request, env);

  if (url.pathname === '/robots.txt') {
    return new Response(`User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${urls.publicSite}/sitemap.xml\n`, {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    });
  }
  if (url.pathname === '/sitemap.xml') return renderSitemap(request, env);

  const inviteLanding = url.pathname.match(/^\/i\/([^/]+)$/);
  if (inviteLanding) return renderInviteLanding(request, env, decodeURIComponent(inviteLanding[1]));
  const trackedRedirect = url.pathname.match(/^\/r\/([^/]+)$/);
  if (trackedRedirect) return redirectTrackedLink(request, env, decodeURIComponent(trackedRedirect[1]));
  const profileBlockRedirect = url.pathname.match(/^\/([^/]+)\/go\/([^/]+)$/);
  if (profileBlockRedirect && env.DB) return redirectPublicProfileBlock(request, env, decodeURIComponent(profileBlockRedirect[1]), decodeURIComponent(profileBlockRedirect[2]));

  if (url.pathname.startsWith('/app') || url.pathname.startsWith('/admin')) {
    return Response.redirect(`${urls.app}${url.pathname.startsWith('/admin') ? url.pathname : '/'}${url.search}`, 302);
  }

  const username = singleSegmentProfilePath(url.pathname);
  if (username && env.DB) {
    try { return await renderPublicProfileWithIdentity(request, env, username); }
    catch (error) {
      if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 404) return serveStatic(request, env);
      throw error;
    }
  }
  return serveStatic(request, env);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    try { return await handle(request, env, ctx); }
    catch (error) { return errorResponse(error); }
  },
};
