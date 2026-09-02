import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isValidXPostUrl } from '../src/routes/access';
import { isSystemRoute, normalizeXHandle } from '../src/routes/onboarding';
import { getLinkaryUrls } from '../src/urls';
import worker from '../src/index';
import type { Env } from '../src/env';

const ctx = { waitUntil() {} };

function makeEnv() {
  const requestedPaths: string[] = [];
  const publicPrototype = '<!doctype html><html><head></head><body><nav class="preview-nav"><button>Prototype</button></nav><div data-page="auth"></div><main>Linkary</main></body></html>';
  const appShell = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
  const env: Env = {
    ASSETS: {
      async fetch(input) {
        const request = typeof input === 'string' ? new Request(input) : input;
        const pathname = new URL(request.url).pathname;
        requestedPaths.push(pathname);
        const body = pathname === '/app/index.html' ? appShell : publicPrototype;
        return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
      },
    },
    PUBLIC_SITE_URL: 'https://linkary.xyz',
    APP_BASE_URL: 'https://app.linkary.xyz',
    APP_ENV: 'production',
  };
  return { env, requestedPaths };
}

test('validates X post URLs without any external API call', () => {
  assert.equal(isValidXPostUrl('https://x.com/muazxinthi/status/123456789'), true);
  assert.equal(isValidXPostUrl('https://twitter.com/user/status/987654321?s=20'), true);
  assert.equal(isValidXPostUrl('https://x.com/muazxinthi'), false);
  assert.equal(isValidXPostUrl('https://example.com/user/status/123'), false);
});

test('normalizes X handles and protects only real system routes', () => {
  assert.equal(normalizeXHandle('@MuazXinthi'), 'muazxinthi');
  assert.equal(isSystemRoute('pricing'), true);
  assert.equal(isSystemRoute('muazxinthi'), false);
  assert.throws(() => normalizeXHandle('invalid-handle'));
});

test('URL configuration is domain-agnostic until production domains are attached', () => {
  const request = new Request('https://temporary-worker.example/api/health');
  const urls = getLinkaryUrls(request, {
    ASSETS: { fetch: async () => new Response() },
    PUBLIC_SITE_URL: 'https://linkary.example/',
    APP_BASE_URL: 'https://app.linkary.example/',
    TRACKING_BASE_URL: 'https://l.linkary.example/',
    API_BASE_URL: 'https://api.linkary.example/',
    MCP_BASE_URL: 'https://mcp.linkary.example/',
  });
  assert.deepEqual(urls, {
    publicSite: 'https://linkary.example',
    app: 'https://app.linkary.example',
    tracking: 'https://l.linkary.example',
    api: 'https://api.linkary.example',
    mcp: 'https://mcp.linkary.example',
  });
});

test('Cloudflare assets and app subdomain route are explicitly configured', () => {
  const wrangler = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(wrangler.assets.run_worker_first, true);
  assert.equal(wrangler.assets.html_handling, 'none');
  assert.equal(
    wrangler.routes.some((route: { pattern?: string; zone_name?: string }) => route.pattern === 'app.linkary.xyz/*' && route.zone_name === 'linkary.xyz'),
    true,
  );
});

test('app host serves the React shell at the clean root URL', async () => {
  const { env, requestedPaths } = makeEnv();
  const response = await worker.fetch(new Request('https://app.linkary.xyz/'), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(requestedPaths, ['/app/index.html']);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('app host serves the React shell for signup deep links', async () => {
  const { env, requestedPaths } = makeEnv();
  const response = await worker.fetch(new Request('https://app.linkary.xyz/signup'), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(requestedPaths, ['/app/index.html']);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('app host serves the React shell for authenticated product deep links', async () => {
  for (const pathname of ['/dashboard', '/campaigns', '/tracking', '/partners', '/profile', '/wallets', '/invites', '/settings']) {
    const { env, requestedPaths } = makeEnv();
    const response = await worker.fetch(new Request(`https://app.linkary.xyz${pathname}`), env, ctx);
    assert.equal(response.status, 200, pathname);
    assert.deepEqual(requestedPaths, ['/app/index.html'], pathname);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow', pathname);
  }
});

test('legacy app subdirectory canonicalizes to app host root without a loop', async () => {
  const { env, requestedPaths } = makeEnv();
  const response = await worker.fetch(new Request('https://app.linkary.xyz/app/'), env, ctx);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://app.linkary.xyz/');
  assert.deepEqual(requestedPaths, []);
});

test('public root explicitly fetches index.html and removes prototype controls in production', async () => {
  const { env, requestedPaths } = makeEnv();
  const response = await worker.fetch(new Request('https://linkary.xyz/'), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(requestedPaths, ['/index.html']);
  const html = await response.text();
  assert.equal(html.includes('class="preview-nav"'), false);
  assert.equal(html.includes('linkary-production-routing'), true);
});

test('Project registration remains official-X-only and free-form creation stays blocked', () => {
  const onboarding = readFileSync(new URL('../src/routes/onboarding.ts', import.meta.url), 'utf8');
  const organizations = readFileSync(new URL('../src/routes/organizations.ts', import.meta.url), 'utf8');
  const projectAccess = readFileSync(new URL('../src/routes/projectAccess.ts', import.meta.url), 'utf8');

  assert.equal(onboarding.includes('project_x_identity_required'), true);
  assert.equal(onboarding.includes('project_handle_mismatch'), true);
  assert.equal(onboarding.includes('A Project Linkary username must match the verified Project X handle'), true);
  assert.equal(organizations.includes("'project_registration_required'"), true);
  assert.equal(projectAccess.includes('searchRegisteredProjects'), true);
  assert.equal(projectAccess.includes('requestProjectAccess'), true);
});

test('personal creator profiles are ordered ahead of managed Project workspaces', () => {
  const onboarding = readFileSync(new URL('../src/routes/onboarding.ts', import.meta.url), 'utf8');
  assert.equal(onboarding.includes("CASE WHEN owner_user_id = ? AND profile_type = 'creator' THEN 0"), true);
});

test('growth product keeps tracking primary and Linkary execution optional', () => {
  const campaigns = readFileSync(new URL('../src/routes/campaigns.ts', import.meta.url), 'utf8');
  const growth = readFileSync(new URL('../frontend/src/GrowthExperience.tsx', import.meta.url), 'utf8');
  assert.equal(campaigns.includes("'tracked_elsewhere'"), true);
  assert.equal(campaigns.includes("'run_on_linkary'"), true);
  assert.equal(growth.includes('Run anywhere. Track here.'), true);
  assert.equal(growth.includes('Running a campaign through Linkary is optional'), true);
  assert.equal(growth.includes('Founder growth report'), true);
  assert.equal(growth.includes('Missing spend or outcome data is left out rather than estimated.'), true);
});

test('partner directory models managers, portfolios, combined audience and evidence-based overlap', () => {
  const migration = readFileSync(new URL('../migrations/0015_partner_directory_and_opportunities.sql', import.meta.url), 'utf8');
  assert.equal(migration.includes('partner_managers'), true);
  assert.equal(migration.includes('partner_manager_assets'), true);
  assert.equal(migration.includes('telegram_community'), true);
  assert.equal(migration.includes('kol_creator'), true);
  assert.equal(migration.includes('partner_manager_audience_estimates'), true);
});

test('partner performance history stays evidence-based instead of using an opaque score', () => {
  const migration = readFileSync(new URL('../migrations/0016_partner_performance_history.sql', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../src/routes/partnerReputation.ts', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../frontend/src/PartnerDirectoryExperience.tsx', import.meta.url), 'utf8');
  assert.equal(migration.includes('partner_manager_collaborations'), true);
  assert.equal(migration.includes("evidence_source IN ('manual', 'tracked', 'verified')"), true);
  assert.equal(route.includes("evidence_source, spend_usd, tracked_clicks"), true);
  assert.equal(ui.includes('Manual collaboration entries are clearly labeled and never treated as verified evidence.'), true);
  assert.equal(ui.toLowerCase().includes('reputation score'), false);
});

test('authenticated product has a shared readable responsive typography layer', () => {
  const ux = readFileSync(new URL('../frontend/src/ux-system.css', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');
  assert.equal(main.includes("import './ux-system.css'"), true);
  assert.equal(ux.includes('--ux-body:clamp('), true);
  assert.equal(ux.includes('.ops-nav a{font-size:var(--ux-nav)!important;min-height:42px'), true);
  assert.equal(ux.includes('@media(max-width:640px)'), true);
  assert.equal(ux.includes('.ops-create-card label,.ops-modal label'), true);
});

test('primary user-facing product screens do not expose infrastructure terminology', () => {
  const screens = [
    '../frontend/src/GrowthExperience.tsx',
    '../frontend/src/PartnerDirectoryExperience.tsx',
    '../frontend/src/ProfileExperience.tsx',
    '../frontend/src/WalletExperience.tsx',
  ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8').toLowerCase()).join('\n');
  for (const forbidden of ['cloudflare', 'd1 database', 'tracking_hash_salt', 'cdp_project_id', 'webhook secret']) {
    assert.equal(screens.includes(forbidden), false, forbidden);
  }
});
