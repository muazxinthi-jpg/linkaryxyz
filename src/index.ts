import type { Env } from './env';
import type { ExecutionContextLike } from './platform';
import { errorResponse, json, methodNotAllowed } from './http';
import { finishXOAuth, startXOAuth } from './auth/x';
import { createCdpSession } from './auth/cdp';
import { getAuthContext, requireAuth, revokeCurrentSession, verifyCsrf } from './auth/session';
import { createEarnedAccess, previewInvite } from './routes/access';
import { completeOnboarding, onboardingStatus } from './routes/onboarding';
import { addProfileBlock, deleteProfileBlock, publicProfileJson, publishProfile, renderPublicProfile, renderSitemap, reorderProfileBlocks, updateProfile, updateProfileBlock } from './routes/profiles';
import { adminHealth } from './routes/admin';
import { archiveOrganization, listOrganizations, restoreOrganization } from './routes/organizations';
import { createNetworkInvite, inviteBalances, renderInviteLanding } from './routes/invites';
import { getLinkaryUrls } from './urls';

const STATIC_OR_SYSTEM = new Set(['', 'index.html', 'styles.css', 'script.js', 'uilib.md', 'favicon.ico', 'assets', 'api', 'onboarding', 'admin', 'app', 'robots.txt', 'sitemap.xml', 'pricing', 'about', 'blog', 'privacy', 'terms', 'support', 'help', 'status', 'security']);
function singleSegmentProfilePath(pathname: string): string | null { const parts=pathname.split('/').filter(Boolean); if(parts.length!==1)return null; const segment=decodeURIComponent(parts[0]).toLowerCase(); if(STATIC_OR_SYSTEM.has(segment)||segment.includes('.'))return null; return segment; }

async function handleApi(request: Request, env: Env): Promise<Response> {
  const path=new URL(request.url).pathname;
  if(path==='/api/health') return json({ok:true,service:'linkary',version:'cdp-auth-foundation',database:env.DB?'bound':'not-bound',cdp:env.CDP_PROJECT_ID?'configured':'not-configured',urls:getLinkaryUrls(request,env)});
  if(path==='/api/auth/cdp/session'){if(request.method!=='POST')return methodNotAllowed(['POST']);return createCdpSession(request,env);}
  if(path==='/api/auth/me'){if(request.method!=='GET')return methodNotAllowed(['GET']);const auth=await getAuthContext(request,env);return json({authenticated:Boolean(auth),user:auth?{id:auth.user.id,displayName:auth.user.display_name,superadmin:auth.isSuperadmin}:null});}
  if(path==='/api/auth/x/start'){if(request.method!=='GET')return methodNotAllowed(['GET']);return startXOAuth(request,env);}
  if(path==='/api/auth/x/callback'){if(request.method!=='GET')return methodNotAllowed(['GET']);return finishXOAuth(request,env);}
  if(path==='/api/auth/logout'){if(request.method!=='POST')return methodNotAllowed(['POST']);const auth=await requireAuth(request,env);await verifyCsrf(request,env,auth);const cookies=await revokeCurrentSession(request,env);const headers=new Headers();for(const cookie of cookies)headers.append('set-cookie',cookie);return json({ok:true},{headers});}
  if(path==='/api/access/earned'){if(request.method!=='POST')return methodNotAllowed(['POST']);return createEarnedAccess(request,env);}
  const invitePreview=path.match(/^\/api\/invites\/([^/]+)\/preview$/);if(invitePreview){if(request.method!=='GET')return methodNotAllowed(['GET']);return previewInvite(decodeURIComponent(invitePreview[1]),env);}
  if(path==='/api/onboarding/status'){if(request.method!=='GET')return methodNotAllowed(['GET']);return onboardingStatus(request,env);}
  if(path==='/api/onboarding/complete'){if(request.method!=='POST')return methodNotAllowed(['POST']);return completeOnboarding(request,env);}
  const publicProfile=path.match(/^\/api\/public\/profiles\/([^/]+)$/);if(publicProfile){if(request.method!=='GET')return methodNotAllowed(['GET']);return publicProfileJson(decodeURIComponent(publicProfile[1]),env);}
  if(path==='/api/organizations'){if(request.method!=='GET')return methodNotAllowed(['GET']);return listOrganizations(request,env);}
  const archiveOrg=path.match(/^\/api\/organizations\/([^/]+)\/archive$/);if(archiveOrg){if(request.method!=='POST')return methodNotAllowed(['POST']);return archiveOrganization(request,env,decodeURIComponent(archiveOrg[1]));}
  const restoreOrg=path.match(/^\/api\/organizations\/([^/]+)\/restore$/);if(restoreOrg){if(request.method!=='POST')return methodNotAllowed(['POST']);return restoreOrganization(request,env,decodeURIComponent(restoreOrg[1]));}
  if(path==='/api/invites/balances'){if(request.method!=='GET')return methodNotAllowed(['GET']);return inviteBalances(request,env);}
  if(path==='/api/invites'){if(request.method!=='POST')return methodNotAllowed(['POST']);return createNetworkInvite(request,env);}
  const profilePatch=path.match(/^\/api\/profiles\/([^/]+)$/);if(profilePatch){if(request.method!=='PATCH')return methodNotAllowed(['PATCH']);return updateProfile(request,env,decodeURIComponent(profilePatch[1]));}
  const profileBlocks=path.match(/^\/api\/profiles\/([^/]+)\/blocks$/);if(profileBlocks){if(request.method!=='POST')return methodNotAllowed(['POST']);return addProfileBlock(request,env,decodeURIComponent(profileBlocks[1]));}
  const profileBlock=path.match(/^\/api\/profiles\/([^/]+)\/blocks\/([^/]+)$/);if(profileBlock){if(request.method==='PATCH')return updateProfileBlock(request,env,decodeURIComponent(profileBlock[1]),decodeURIComponent(profileBlock[2]));if(request.method==='DELETE')return deleteProfileBlock(request,env,decodeURIComponent(profileBlock[1]),decodeURIComponent(profileBlock[2]));return methodNotAllowed(['PATCH','DELETE']);}
  const profileReorder=path.match(/^\/api\/profiles\/([^/]+)\/blocks-reorder$/);if(profileReorder){if(request.method!=='POST')return methodNotAllowed(['POST']);return reorderProfileBlocks(request,env,decodeURIComponent(profileReorder[1]));}
  const profilePublish=path.match(/^\/api\/profiles\/([^/]+)\/publish$/);if(profilePublish){if(request.method!=='POST')return methodNotAllowed(['POST']);return publishProfile(request,env,decodeURIComponent(profilePublish[1]),true);}
  const profileUnpublish=path.match(/^\/api\/profiles\/([^/]+)\/unpublish$/);if(profileUnpublish){if(request.method!=='POST')return methodNotAllowed(['POST']);return publishProfile(request,env,decodeURIComponent(profileUnpublish[1]),false);}
  if(path==='/api/admin/health'){if(request.method!=='GET')return methodNotAllowed(['GET']);return adminHealth(request,env);}
  return json({error:'not_found',message:'API route not found'},{status:404});
}

async function handle(request:Request,env:Env,_ctx:ExecutionContextLike):Promise<Response>{const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return handleApi(request,env);if(url.pathname==='/robots.txt'){const base=getLinkaryUrls(request,env).publicSite;return new Response(`User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`,{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'public, max-age=3600'}});}if(url.pathname==='/sitemap.xml')return renderSitemap(request,env);const inviteLanding=url.pathname.match(/^\/i\/([^/]+)$/);if(inviteLanding)return renderInviteLanding(request,env,decodeURIComponent(inviteLanding[1]));if(url.pathname.startsWith('/admin')||url.pathname.startsWith('/app')){const response=await env.ASSETS.fetch(request);const headers=new Headers(response.headers);headers.set('x-robots-tag','noindex, nofollow');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}const username=singleSegmentProfilePath(url.pathname);if(username&&env.DB){try{return await renderPublicProfile(request,env,username);}catch(error){if(error instanceof Error&&'status' in error&&(error as {status?:number}).status===404)return env.ASSETS.fetch(request);throw error;}}return env.ASSETS.fetch(request);}

export default{async fetch(request:Request,env:Env,ctx:ExecutionContextLike):Promise<Response>{try{return await handle(request,env,ctx);}catch(error){return errorResponse(error);}}};
