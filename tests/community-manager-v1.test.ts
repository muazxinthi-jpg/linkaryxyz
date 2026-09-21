import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/index';
import type { Env } from '../src/env';

const ctx = { waitUntil() {} };

function appEnv() {
  const requestedPaths: string[] = [];
  const env: Env = {
    ASSETS: {
      async fetch(input) {
        const request = typeof input === 'string' ? new Request(input) : input;
        const pathname = new URL(request.url).pathname;
        requestedPaths.push(pathname);
        if (pathname === '/assets/linkary-app/index.html') {
          return new Response('<!doctype html><html><body><div id="root"></div></body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        }
        return new Response('not found', { status: 404 });
      },
    },
    PUBLIC_SITE_URL: 'https://linkary.xyz',
    APP_BASE_URL: 'https://app.linkary.xyz',
    APP_ENV: 'production',
  };
  return { env, requestedPaths };
}

test('Communities is a real authenticated app deep link', async () => {
  const { env, requestedPaths } = appEnv();
  const response = await worker.fetch(new Request('https://app.linkary.xyz/communities'), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(requestedPaths, ['/assets/linkary-app/index.html']);

  const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
  const gate = readFileSync(new URL('../frontend/src/CommunityManagerSessionGate.tsx', import.meta.url), 'utf8');
  assert.equal(app.includes("location.pathname === '/communities'"), true);
  assert.equal(app.includes('CommunityManagerSessionGate'), true);
  assert.equal(gate.includes('CommunityManagerExperience'), true);
});

test('Creator navigation exposes Communities without adding it to Project operations', () => {
  const workspace = readFileSync(new URL('../frontend/src/ProductWorkspace.tsx', import.meta.url), 'utf8');
  const creatorNav = workspace.slice(workspace.indexOf('const creatorNav'), workspace.indexOf('const projectNav'));
  const projectNav = workspace.slice(workspace.indexOf('const projectNav'), workspace.indexOf('const nav ='));
  assert.equal(creatorNav.includes("['/communities', 'Communities']"), true);
  assert.equal(projectNav.includes("['/communities', 'Communities']"), false);

  const mobile = readFileSync(new URL('../frontend/src/mobile-workspace-navigation.css', import.meta.url), 'utf8');
  assert.match(mobile, /\.ops-mobile-bottom-nav\s*\{[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/s);
  assert.match(mobile, /\.ops-mobile-drawer-nav/);
});

test('Community Manager V1 reuses the existing evidence-aware partner schema', () => {
  const migration = readFileSync(new URL('../migrations/0015_partner_directory_and_opportunities.sql', import.meta.url), 'utf8');
  assert.equal(migration.includes("manager_type IN ('community_manager', 'kol_manager')"), true);
  assert.equal(migration.includes("asset_type IN ('telegram_community', 'kol_creator')"), true);
  assert.equal(migration.includes('verification_status'), true);
  assert.equal(migration.includes('audience_size'), true);

  const route = readFileSync(new URL('../src/routes/partnerDirectory.ts', import.meta.url), 'utf8');
  assert.equal(route.includes("manager.manager_type === 'community_manager' ? 'telegram_community'"), true);
  assert.equal(route.includes("manager.manager_type === 'community_manager' ? 'Telegram'"), true);
});

test('Personal Telegram verification stays evidence-bearing but does not block Community Portfolio creation', () => {
  const route = readFileSync(new URL('../src/routes/partnerDirectory.ts', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../frontend/src/CommunityManagerExperience.tsx', import.meta.url), 'utf8');
  assert.equal(route.includes("pi.platform = 'telegram'"), true);
  assert.equal(route.includes("pi.provider_object_type = 'person'"), true);
  assert.equal(route.includes("pil.link_type = 'owns'"), true);
  assert.equal(route.includes('pi.ownership_verified_at IS NOT NULL'), true);
  assert.equal(route.includes('requireTelegramIdentity'), false);
  assert.equal(route.includes('telegram_identity_required'), false);
  assert.equal(route.includes("const telegramContact = existing.manager_type === 'community_manager'"), true);
  assert.equal(route.includes("const telegramContact = body.managerType === 'community_manager'"), true);
  assert.equal(route.includes("? telegramIdentity?.current_handle || null"), true);
  assert.equal(ui.includes('Personal Telegram verification is optional.'), true);
  assert.equal(ui.includes('You can create your portfolio and list Communities without connecting Telegram.'), true);
  assert.equal(ui.includes('if (!personalProfile) return;'), true);
  assert.equal(ui.includes('if (!manager) return;'), true);
});

test('Community Manager UI links Telegram instead of trusting a typed personal handle', () => {
  const ui = readFileSync(new URL('../frontend/src/CommunityManagerExperience.tsx', import.meta.url), 'utf8');
  assert.equal(ui.includes('useLinkOAuth'), false);
  assert.equal(ui.includes("window.location.assign('/profile')"), true);
  assert.equal(ui.includes('Personal Telegram verification is optional.'), true);
  assert.equal(ui.includes('telegramContact: managerForm.telegramContact'), false);
  assert.equal(ui.includes('<label>Telegram contact<input'), false);
  assert.equal(ui.includes('stable account ID stays private'), true);
});

test('Telegram linking in Personal Profile keeps Community onboarding available', () => {
  const ui = readFileSync(new URL('../frontend/src/CommunityManagerExperience.tsx', import.meta.url), 'utf8');
  assert.equal(ui.includes('Connect in Profile'), true);
  assert.equal(ui.includes('Disconnect Telegram'), true);
  assert.equal(ui.includes('You can create your portfolio and list Communities without connecting Telegram.'), true);
  assert.equal(ui.includes('/api/auth/cdp/session'), false);
});

test('Personal Telegram identity and exact Community verification remain separate and TrackerBot stays optional', () => {
  const ui = readFileSync(new URL('../frontend/src/CommunityManagerExperience.tsx', import.meta.url), 'utf8');
  const verification = readFileSync(new URL('../src/routes/communityVerification.ts', import.meta.url), 'utf8');
  assert.equal(ui.includes('Personal identity verification is separate from verification of the Communities you manage.'), true);
  assert.equal(ui.includes('Verifying your personal Telegram identity does not automatically verify Community ownership.'), true);
  assert.equal(ui.includes('LinkaryTrackerBot is optional'), true);
  assert.equal(ui.includes('it is not required to list or verify a Community.'), true);
  assert.equal(verification.includes("verification_status = 'submitted'"), true);
  assert.equal(verification.includes("'approved' : 'rejected'"), true);
});

test('Community Manager workspace uses an automatic public Community Portfolio', () => {
  const ui = readFileSync(new URL('../frontend/src/CommunityManagerExperience.tsx', import.meta.url), 'utf8');
  assert.equal(ui.includes("managerType: 'community_manager'"), true);
  assert.equal(ui.includes('/api/partner-manager-assets'), true);
  assert.equal(ui.includes('Add community'), true);
  assert.equal(ui.includes('Managed Communities'), true);
  assert.equal(ui.includes("type: 'community_card'"), false);
  assert.equal(ui.includes('Add to public profile'), false);
  assert.equal(ui.includes('Your portfolio appears on your public Linkary profile'), true);
  assert.equal(ui.includes('Your public Community Portfolio will update automatically.'), true);
  assert.equal(ui.includes('CommunityVerificationPanel'), true);
  assert.equal(ui.includes('Verified</b> means Linkary separately reviewed public proof'), true);
});

test('Communities desktop redesign uses the available page width and keeps Linkary data/actions', () => {
  const ui = readFileSync(new URL('../frontend/src/CommunityManagerExperience.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../frontend/src/community-manager.css', import.meta.url), 'utf8');
  const workspace = readFileSync(new URL('../frontend/src/ProductWorkspace.tsx', import.meta.url), 'utf8');
  assert.equal(workspace.includes("currentPath === '/communities' ? ' community-workspace-page'"), true);
  assert.match(css, /\.ops-shell \.ops-page\.community-workspace-page\s*\{[^}]*width:100%;max-width:none/s);
  assert.match(css, /\.community-manager-page \.community-manager-grid\s*\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*?\.community-manager-page \.community-manager-grid\s*\{grid-template-columns:1fr\}/);
  assert.match(css, /@media\(max-width:640px\)[\s\S]*?\.community-card-grid\s*\{grid-template-columns:1fr\}/);
  for (const preserved of ['CommunityVerificationPanel', 'onClick={() => editCommunity(asset)}', 'onClick={() => void removeCommunity(asset)}', '<label>Community name<input', 'audienceSize:', 'openToCampaigns:']) {
    assert.equal(ui.includes(preserved), true, `missing existing Community behavior: ${preserved}`);
  }
  assert.equal(ui.includes('Example Alpha Community</h3>'), false);
  assert.equal(ui.includes('Myrtle'), false);
});

test('Public profiles derive Community Portfolio directly from manager and Community records', () => {
  const publicProfile = readFileSync(new URL('../src/routes/publicProfileEnhancer.ts', import.meta.url), 'utf8');
  assert.equal(publicProfile.includes('loadAutomaticCommunityPortfolio'), true);
  assert.equal(publicProfile.includes("manager_type = 'community_manager'"), true);
  assert.equal(publicProfile.includes("asset_type = 'telegram_community'"), true);
  assert.equal(publicProfile.includes('automatic-community-portfolio'), true);
  assert.equal(publicProfile.includes('Telegram identity verified'), true);
  assert.equal(publicProfile.includes('Combined audience'), true);
  assert.equal(publicProfile.includes('Open to campaigns'), true);
  assert.equal(publicProfile.includes('Verified Community'), true);
  assert.equal(publicProfile.includes('removeLegacyCommunityCards'), true);
  assert.equal(publicProfile.includes("block.block_type === 'community_card'"), false);
});
