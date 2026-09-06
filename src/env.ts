import type { D1Database, Fetcher } from './platform';

export interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;

  // Linkary primary authentication / embedded wallet configuration.
  // CDP_PROJECT_ID is public client configuration. CDP API credentials are
  // server-only secrets and must be stored with Cloudflare secret bindings.
  CDP_PROJECT_ID?: string;
  CDP_API_KEY_ID?: string;
  CDP_API_KEY_SECRET?: string;
  // Public receiving address for user-approved Base USDC subscription payments.
  // Payment activation fails closed until this address is configured.
  BILLING_TREASURY_EVM_ADDRESS?: string;
  // Direct Telegram profile linking; the secret is a Cloudflare secret binding.
  TELEGRAM_CLIENT_ID?: string;
  TELEGRAM_CLIENT_SECRET?: string;

  // Server-only Alchemy key used for wallet asset discovery and onchain
  // attribution. Never expose this value to the browser.
  ALCHEMY_API_KEY?: string;

  SESSION_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  // Server-only salt for privacy-preserving tracking visitor pseudonyms.
  TRACKING_HASH_SALT?: string;

  // Legacy direct-X OAuth boundary. Keep temporarily until the CDP cutover is
  // deployed and verified, then retire these variables and routes deliberately.
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
