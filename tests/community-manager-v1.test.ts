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
        if (pathname === '/app/index.html') {
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
  assert.deepEqual(requestedPaths, ['/app/index.html']);

  const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
  assert.equal(app.includes("location.pathname === '/communities'"), true);
  assert.equal(app.includes('CommunityManagerExperience'), true);
});

test('Creator navigation exposes Communities without adding it to Project operations', () => {
  const workspace = readFileSync(new URL('../frontend/src/ProductWorkspace.tsx', import.meta.url), 'utf8');
  const creatorNav = workspace.slice(workspace.indexOf('const creatorNav'), workspace.indexOf('const projectNav'));
  const projectNav = workspace.slice(workspace.indexOf('const projectNav'), workspace.indexOf('const nav ='));
  assert.equal(creatorNav.includes("['/communities', 'Communities']"), true);
  assert.equal(projectNav.includes("['/communities', 'Communities']"), false);

  const mobile = readFileSync(new URL('../frontend/src/workspace-mobile.css', import.meta.url), 'utf8');
  assert.equal(mobile.includes('.workspace-creator .ops-nav a[href="/settings"]{display:none!important}'), true);
  assert.equal(mobile.includes('.workspace-creator .ops-nav{grid-template-columns:repeat(6'), true);
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

test('Community Manager workspace supports multiple communities and public profile cards', () => {
  const ui = readFileSync(new URL('../frontend/src/CommunityManagerExperience.tsx', import.meta.url), 'utf8');
  assert.equal(ui.includes("managerType: 'community_manager'"), true);
  assert.equal(ui.includes('/api/partner-manager-assets'), true);
  assert.equal(ui.includes('Add community'), true);
  assert.equal(ui.includes('Managed communities'), true);
  assert.equal(ui.includes("type: 'community_card'"), true);
  assert.equal(ui.includes('Add to public profile'), true);
  assert.equal(ui.includes('Telegram admin ownership and Linkary Tracker verification will be added'), true);
  assert.equal(ui.includes('Linkary will never label an unverified audience as verified'), true);
});
