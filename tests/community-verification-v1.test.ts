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
        if (pathname === '/assets/linkary-app/index.html') return new Response('<!doctype html><div id="root"></div>', { status: 200, headers: { 'content-type': 'text/html' } });
        return new Response('not found', { status: 404 });
      },
    },
    PUBLIC_SITE_URL: 'https://linkary.xyz',
    APP_BASE_URL: 'https://app.linkary.xyz',
    APP_ENV: 'production',
  };
  return { env, requestedPaths };
}

test('Community verification admin is a real app deep link', async () => {
  const { env, requestedPaths } = appEnv();
  const response = await worker.fetch(new Request('https://app.linkary.xyz/admin/community-verifications'), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(requestedPaths, ['/assets/linkary-app/index.html']);
  const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
  assert.equal(app.includes("location.pathname === '/admin/community-verifications'"), true);
  assert.equal(app.includes('AdminCommunityVerificationExperience'), true);
});

test('Community verification requires public Telegram evidence and an owner-controlled community asset', () => {
  const route = readFileSync(new URL('../src/routes/communityVerification.ts', import.meta.url), 'utf8');
  assert.equal(route.includes("['t.me', 'telegram.me', 'www.t.me'].includes(host)"), true);
  assert.equal(route.includes("a.asset_type = 'telegram_community'"), true);
  assert.equal(route.includes("m.manager_type = 'community_manager'"), true);
  assert.equal(route.includes('p.owner_user_id = ?'), true);
  assert.equal(route.includes('LKY-COMM-'), true);
});

test('Community verification does not silently promote submitted evidence to verified', () => {
  const route = readFileSync(new URL('../src/routes/communityVerification.ts', import.meta.url), 'utf8');
  assert.equal(route.includes("SET verification_status = 'submitted'"), true);
  assert.equal(route.includes("community_verification.submitted"), true);
  assert.equal(route.includes("requireSuperadmin(request, env)"), true);
  assert.equal(route.includes("const next = decision === 'approve' ? 'verified' : 'rejected'"), true);
  assert.equal(route.includes("actor_kind, action, resource_type"), true);
});

test('Community verification uses existing evidence ledger instead of adding another migration', () => {
  const route = readFileSync(new URL('../src/routes/communityVerification.ts', import.meta.url), 'utf8');
  const initial = readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8');
  const partner = readFileSync(new URL('../migrations/0015_partner_directory_and_opportunities.sql', import.meta.url), 'utf8');
  assert.equal(initial.includes('CREATE TABLE IF NOT EXISTS audit_logs'), true);
  assert.equal(partner.includes("verification_status TEXT NOT NULL DEFAULT 'unverified'"), true);
  assert.equal(route.includes('INSERT INTO audit_logs'), true);
});

test('Community manager UI explains manual proof and never calls a submission verified before review', () => {
  const panel = readFileSync(new URL('../frontend/src/CommunityVerificationPanel.tsx', import.meta.url), 'utf8');
  const community = readFileSync(new URL('../frontend/src/CommunityManagerExperience.tsx', import.meta.url), 'utf8');
  assert.equal(panel.includes('Place it temporarily in the Telegram community description'), true);
  assert.equal(panel.includes('Verification submitted for Linkary review.'), true);
  assert.equal(panel.includes('Linkary will not show this community as Verified until a Superadmin approves'), true);
  assert.equal(community.includes('Verified means Linkary separately reviewed public Telegram proof'), true);
});

test('Superadmin review UI exposes proof code, evidence URL, approve and needs-more-proof actions', () => {
  const admin = readFileSync(new URL('../frontend/src/AdminCommunityVerificationExperience.tsx', import.meta.url), 'utf8');
  assert.equal(admin.includes('Expected proof code'), true);
  assert.equal(admin.includes('Open Telegram evidence'), true);
  assert.equal(admin.includes('Approve verification'), true);
  assert.equal(admin.includes('Needs more proof'), true);
});
