import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessBetaConfiguration } from '../src/betaReadiness';
import type { Env } from '../src/env';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('commercial migration creates the locked plan catalog and usage-credit foundation', () => {
  const migration = read('../migrations/0029_commercial_plan_catalog_and_usage_credits.sql');

  for (const table of [
    'billing_plans',
    'billing_plan_price_versions',
    'billing_plan_promotions',
    'discount_coupons',
    'coupon_redemptions',
    'billing_entitlement_grants',
    'usage_credit_ledger',
  ]) {
    assert.equal(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), true, `${table} should be created`);
  }

  assert.match(migration, /'plan_free'.*'free'.*'Free'.*'free', 0, 'USD', 25, 0/s);
  assert.match(migration, /'plan_personal_pro'.*'personal_pro'.*'Personal Pro \/ Collector'.*'monthly', 499, 'USD', 250, 0/s);
  assert.match(migration, /'plan_project_manual'.*'project_manual'.*'Project Manual'.*'monthly', 999, 'USD', 500, 1/s);
  assert.match(migration, /'plan_project_automate'.*'project_automate'.*'Project Automate'.*'monthly', 3399, 'USD', 2500, 3/s);
  assert.match(migration, /'plan_project_growth'.*'project_growth'.*'Project Growth'.*'monthly', 9999, 'USD', 10000, 10/s);
  assert.match(migration, /'plan_scale'.*'scale'.*'Scale \/ Agency \/ Enterprise'.*'custom', NULL, 'USD', 25000, NULL/s);
});

test('billing APIs expose one public catalog and protected Superadmin controls', () => {
  const billing = read('../src/routes/billing.ts');
  const index = read('../src/index.ts');

  assert.equal(billing.includes('export async function listPublicBillingPlans'), true);
  assert.equal(billing.includes('export async function listAdminBillingPlans'), true);
  assert.equal(billing.includes('export async function updateAdminBillingPlan'), true);
  assert.equal(billing.includes('export async function adjustUsageCredits'), true);
  assert.equal(billing.includes('requireSuperadmin'), true);
  assert.equal(billing.includes('verifyCsrf'), true);
  assert.equal(billing.includes("'billing_plan.updated'"), true);
  assert.equal(billing.includes("'usage_credits.adjusted'"), true);

  assert.equal(index.includes("path === '/api/billing/plans'"), true);
  assert.equal(index.includes("path === '/api/admin/billing/plans'"), true);
  assert.equal(index.includes('/api\\/admin\\/billing\\/plans\\/([^/]+)'), true);
  assert.equal(index.includes("path === '/api/admin/usage-credits/adjust'"), true);
});

test('Controlled Beta readiness requires a server-only Alchemy API key', () => {
  const baseEnv = {
    DB: {} as Env['DB'],
    AI: {} as Env['AI'],
    CDP_PROJECT_ID: 'cdp-project',
    CDP_API_KEY_ID: 'cdp-key',
    CDP_API_KEY_SECRET: 'cdp-secret',
    SESSION_SECRET: 'session-secret',
    TRACKING_HASH_SALT: 'tracking-salt',
    PUBLIC_SITE_URL: 'https://linkary.xyz',
    APP_BASE_URL: 'https://app.linkary.xyz',
  } as Env;

  const missingAlchemy = assessBetaConfiguration(baseEnv);
  assert.equal(missingAlchemy.ready, false);
  assert.equal(missingAlchemy.missing.includes('Alchemy NFT API key'), true);

  const configured = assessBetaConfiguration({ ...baseEnv, ALCHEMY_API_KEY: 'alchemy-secret' });
  assert.equal(configured.ready, true);
  assert.equal(configured.missing.length, 0);
});

test('Controlled Beta Alchemy chain registry is Ethereum, Base, BNB Chain, Solana and Robinhood', () => {
  const chains = read('../src/chains.ts');
  const wallets = read('../src/routes/wallets.ts');

  for (const key of ['ethereum', 'base', 'bnb', 'solana', 'robinhood']) {
    assert.equal(chains.includes(`key: '${key}'`), true, `missing ${key}`);
  }
  assert.equal(chains.includes("key: 'arbitrum'"), false);
  assert.equal(wallets.includes('BETA_CHAIN_CAPABILITIES'), true);
  assert.equal(wallets.includes('solana-mainnet.g.alchemy.com'), true);
});

test('public billing catalog has safe fallback values before migration 0029 is applied', () => {
  const billing = read('../src/routes/billing.ts');

  assert.equal(billing.includes("code: 'free'"), true);
  assert.equal(billing.includes('basePriceCents: 499'), true);
  assert.equal(billing.includes('basePriceCents: 999'), true);
  assert.equal(billing.includes('basePriceCents: 3399'), true);
  assert.equal(billing.includes('basePriceCents: 9999'), true);
  assert.equal(billing.includes("source: 'fallback'"), true);
});
