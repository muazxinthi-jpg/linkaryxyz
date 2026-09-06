import type { Env } from './env';

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

export interface LinkaryUrls {
  publicSite: string;
  app: string;
  tracking: string;
  api: string;
  mcp: string;
}

export function getLinkaryUrls(request: Request, env: Env): LinkaryUrls {
  const origin = new URL(request.url).origin;
  return {
    publicSite: stripTrailingSlash(env.PUBLIC_SITE_URL || origin),
    app: stripTrailingSlash(env.APP_BASE_URL || origin),
    tracking: stripTrailingSlash(env.TRACKING_BASE_URL || origin),
    api: stripTrailingSlash(env.API_BASE_URL || origin),
    mcp: stripTrailingSlash(env.MCP_BASE_URL || origin),
  };
}

export function publicProfileUrl(request: Request, env: Env, username: string): string {
  return `${getLinkaryUrls(request, env).publicSite}/${encodeURIComponent(username)}`;
}

export function publicProfileCardUrl(request: Request, env: Env, username: string): string {
  return `${getLinkaryUrls(request, env).publicSite}/_social/profile/${encodeURIComponent(username)}.svg`;
}
