import type { D1Database, Fetcher } from './platform';

export interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  SESSION_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  X_REDIRECT_URI?: string;
  PUBLIC_SITE_URL?: string;
  APP_BASE_URL?: string;
  TRACKING_BASE_URL?: string;
  API_BASE_URL?: string;
  MCP_BASE_URL?: string;
  APP_ENV?: string;
}

export function requireDb(env: Env): D1Database {
  if (!env.DB) throw new ServiceConfigurationError('D1 binding DB is not configured');
  return env.DB;
}

export class ServiceConfigurationError extends Error {
  readonly status = 503;
}
