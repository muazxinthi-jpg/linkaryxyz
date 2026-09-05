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

test('Creator Opportunities is a real app deep link', async () => {
  const { env, requestedPaths } = appEnv();
  const response = await worker.fetch(new Request('https://app.linkary.xyz/opportunities'), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(requestedPaths, ['/assets/linkary-app/index.html']);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');

  const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
  assert.equal(app.includes("location.pathname === '/opportunities'"), true);
  assert.equal(app.includes('CreatorOpportunitiesExperience'), true);
});

test('workspace navigation separates Creator activation from Project operations', () => {
  const workspace = readFileSync(new URL('../frontend/src/ProductWorkspace.tsx', import.meta.url), 'utf8');
  const creatorNav = workspace.slice(workspace.indexOf('const creatorNav'), workspace.indexOf('const projectNav'));
  const projectNav = workspace.slice(workspace.indexOf('const projectNav'), workspace.indexOf('const nav ='));

  assert.equal(creatorNav.includes("['/opportunities', 'Opportunities']"), true);
  assert.equal(creatorNav.includes("['/campaigns', 'Growth']"), false);
  assert.equal(creatorNav.includes("['/tracking', 'Evidence']"), false);
  assert.equal(projectNav.includes("['/campaigns', 'Growth']"), true);
  assert.equal(projectNav.includes("['/tracking', 'Evidence']"), true);
  assert.equal(projectNav.includes("['/opportunities', 'Opportunities']"), false);
});

test('Creator dashboard promotes profile, opportunities, Projects and invites', () => {
  const dashboard = readFileSync(new URL('../frontend/src/DashboardExperience.tsx', import.meta.url), 'utf8');
  assert.equal(dashboard.includes('Find opportunities'), true);
  assert.equal(dashboard.includes('Complete your profile'), true);
  assert.equal(dashboard.includes('Join a Project'), true);
  assert.equal(dashboard.includes('Invite your network'), true);
  assert.equal(dashboard.includes('<strong>{projectCount}</strong>'), true);
});

test('Creator opportunity feed exposes application state and excludes passed deadlines', () => {
  const route = readFileSync(new URL('../src/routes/opportunities.ts', import.meta.url), 'utf8');
  assert.equal(route.includes('AS my_application_id'), true);
  assert.equal(route.includes('AS my_application_status'), true);
  assert.equal(route.includes("date(o.application_deadline) >= date(?)"), true);
  assert.equal(route.includes("date(application_deadline) < date(?)"), true);
  assert.equal(route.includes("opportunity.status !== 'open' || Boolean(opportunity.deadline_passed)"), true);
});

test('Creator opportunity UI applies through personal Creator identity and shows status', () => {
  const ui = readFileSync(new URL('../frontend/src/CreatorOpportunitiesExperience.tsx', import.meta.url), 'utf8');
  assert.equal(ui.includes('/api/campaign-opportunities'), true);
  assert.equal(ui.includes('/api/campaign-opportunity-applications'), true);
  assert.equal(ui.includes('profileId: personalProfile.id'), true);
  assert.equal(ui.includes('Application pending'), true);
  assert.equal(ui.includes('Accepted'), true);
  assert.equal(ui.includes('Not selected'), true);
  assert.equal(ui.includes('Browse opportunities'), true);
  assert.equal(ui.includes('My applications'), true);
});

test('My Work exposes only assigned activity evidence and the exact Linkary tracking link', () => {
  const ui = readFileSync(new URL('../frontend/src/CreatorOpportunitiesExperience.tsx', import.meta.url), 'utf8');
  assert.equal(ui.includes('My work'), true);
  assert.equal(ui.includes('/api/tracked-links?measurement=1&mine=1'), true);
  assert.equal(ui.includes('Only activities assigned to your Creator identity or one of your exact Community Manager portfolios appear here.'), true);
  assert.equal(ui.includes('Use this exact link in the published content'), true);
  assert.equal(ui.includes('Linkary clicks'), true);
  assert.equal(ui.includes('Attributed value'), true);
  assert.equal(ui.includes('<ActivityMeasurementPanel activityId={item.activityId} canSubmit={true} canReview={false} />'), true);
});

test('My Work stays readable and actionable on tablet and phone widths', () => {
  const css = readFileSync(new URL('../frontend/src/creator-opportunities.css', import.meta.url), 'utf8');
  assert.equal(css.includes('.creator-work-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'), true);
  assert.equal(css.includes('@media(max-width:760px)'), true);
  assert.equal(css.includes('.creator-work-grid{grid-template-columns:1fr;padding:10px}'), true);
  assert.equal(css.includes('@media(max-width:430px)'), true);
  assert.equal(css.includes('.creator-work-link-row input,.creator-work-link-row .ops-button{width:100%;min-height:44px}'), true);
  assert.equal(css.includes('@media(max-width:340px)'), true);
  assert.equal(css.includes('.creator-work-metrics{grid-template-columns:1fr}'), true);
});

test('mobile workspace keeps six primary destinations for Creator and Project contexts', () => {
  const css = readFileSync(new URL('../frontend/src/workspace-mobile.css', import.meta.url), 'utf8');
  assert.equal(css.includes('.ops-nav a[href="/tracking"]'), true);
  assert.equal(css.includes('.ops-nav a[href="/partners"]'), true);
  assert.equal(css.includes('.ops-nav a[href="/wallets"]'), true);
  assert.equal(css.includes('repeat(6,minmax(0,1fr))'), true);
});
