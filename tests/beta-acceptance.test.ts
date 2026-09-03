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

test('Inbox is a real authenticated app deep link', async () => {
  const { env, requestedPaths } = appEnv();
  const response = await worker.fetch(new Request('https://app.linkary.xyz/dashboard/inbox'), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(requestedPaths, ['/assets/linkary-app/index.html']);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');

  const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
  const workspace = readFileSync(new URL('../frontend/src/ProductWorkspace.tsx', import.meta.url), 'utf8');
  assert.equal(app.includes("location.pathname === '/dashboard/inbox'"), true);
  assert.equal(workspace.includes("['/dashboard/inbox', 'Inbox']"), true);
});

test('Project public Growth Proof excludes manual conversion evidence', () => {
  const profiles = readFileSync(new URL('../src/routes/profiles.ts', import.meta.url), 'utf8');
  assert.equal(profiles.includes("source IN ('linkary_tracked','telegram_verified','provider_verified')"), true);
  assert.equal(profiles.includes("heading: 'Growth proof'"), true);
  assert.equal(profiles.includes("label: 'Verified outcomes'"), true);
  assert.equal(profiles.includes("Public outcomes and attributed value include Linkary, Telegram, or provider verified events only."), true);

  const projectProofQuery = profiles.slice(profiles.indexOf('async function loadProjectProof'), profiles.indexOf('async function loadCreatorProof'));
  assert.equal(projectProofQuery.includes("source = 'manual'"), false);
  assert.equal(projectProofQuery.includes("source IN ('manual'"), false);
});

test('Creator Campaign Proof requires accepted relationships and tracked or verified evidence', () => {
  const profiles = readFileSync(new URL('../src/routes/profiles.ts', import.meta.url), 'utf8');
  const creatorProof = profiles.slice(profiles.indexOf('async function loadCreatorProof'), profiles.indexOf('async function loadPublicProof'));
  assert.equal(creatorProof.includes("a.status = 'accepted'"), true);
  assert.equal(creatorProof.includes("c.evidence_source IN ('tracked','verified')"), true);
  assert.equal(creatorProof.includes("heading: 'Campaign proof'"), true);
  assert.equal(creatorProof.includes('Performance numbers appear only from tracked or verified evidence records.'), true);
});

test('Project access keeps privileged role boundaries server-side', () => {
  const access = readFileSync(new URL('../src/routes/projectAccess.ts', import.meta.url), 'utf8');
  assert.equal(access.includes("['owner', 'admin'].includes(membership.role)"), true);
  assert.equal(access.includes("membership.role === 'admin' && row.requested_role === 'admin'"), true);
  assert.equal(access.includes('Only a Project Owner can grant Project Admin access'), true);
  assert.equal(access.includes("actor.role === 'admin' && body.role === 'admin'"), true);
  assert.equal(access.includes('Only a Project Owner can add a Project Admin'), true);
  assert.equal(access.includes('Only the current Project Owner can transfer ownership'), true);
  assert.equal(access.includes('You cannot change your own Project role'), true);
  assert.equal(access.includes('You cannot remove yourself from this Project'), true);
});

test('Creator to Project onboarding UX remains exposed', () => {
  const projectUi = readFileSync(new URL('../frontend/src/ProjectExperienceBeta.tsx', import.meta.url), 'utf8');
  assert.equal(projectUi.includes('/api/projects/search?query='), true);
  assert.equal(projectUi.includes('/access-requests'), true);
  assert.equal(projectUi.includes('Campaign Manager'), true);
  assert.equal(projectUi.includes('Project Admin'), true);
  assert.equal(projectUi.includes('Request access'), true);
});

test('Inbox remains an action center for Project access and campaign applications', () => {
  const inbox = readFileSync(new URL('../frontend/src/InboxExperience.tsx', import.meta.url), 'utf8');
  assert.equal(inbox.includes('/api/projects/'), true);
  assert.equal(inbox.includes('/api/campaign-opportunity-applications/'), true);
  assert.equal(inbox.includes('approve'), true);
  assert.equal(inbox.includes('reject'), true);
  assert.equal(inbox.includes('accepted'), true);
});

test('production D1 migrations remain an explicit manual operation', () => {
  const workflow = readFileSync(new URL('../.github/workflows/migrate-production-d1.yml', import.meta.url), 'utf8');
  assert.equal(workflow.includes('workflow_dispatch:'), true);
  assert.equal(workflow.includes('d1 migrations apply linkary-db --remote'), true);
  assert.equal(workflow.includes('d1 migrations list linkary-db --remote'), true);
  assert.equal(/^\s*push:/m.test(workflow), false);
  assert.equal(/^\s*pull_request:/m.test(workflow), false);
});

test('latest controlled Beta migrations stay versioned', () => {
  const shortlist = readFileSync(new URL('../migrations/0017_project_partner_shortlists.sql', import.meta.url), 'utf8');
  const avatars = readFileSync(new URL('../migrations/0018_verified_x_profile_avatars.sql', import.meta.url), 'utf8');
  assert.equal(shortlist.includes('project_partner_shortlists'), true);
  assert.equal(avatars.includes('avatar_url'), true);
});
