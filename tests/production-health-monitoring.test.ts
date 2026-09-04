import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/production-health.yml', import.meta.url), 'utf8');
const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');

test('production health monitoring runs hourly and can be dispatched manually', () => {
  assert.equal(workflow.includes("cron: '17 * * * *'"), true);
  assert.equal(workflow.includes('workflow_dispatch:'), true);
  assert.equal(workflow.includes('timeout-minutes: 10'), true);
});

test('production health monitoring covers the current Beta app route surface', () => {
  const routes = [
    '/',
    '/dashboard',
    '/dashboard/inbox',
    '/opportunities',
    '/communities',
    '/campaigns',
    '/tracking',
    '/partners',
    '/creators',
    '/profile',
    '/invites',
    '/wallets',
    '/settings/team-invites',
    '/settings',
    '/admin/readiness',
    '/admin/community-verifications',
    '/team-invite',
  ];

  for (const route of routes) {
    assert.equal(workflow.includes(`"${route}"`), true, `${route} should be monitored`);
    if (route !== '/') assert.equal(app.includes(`location.pathname === '${route}'`), true, `${route} should remain a real app route`);
  }
});

test('new Beta and Superadmin deep links cannot silently fall out of hourly shell monitoring', () => {
  for (const route of [
    '/opportunities',
    '/communities',
    '/creators',
    '/settings/team-invites',
    '/admin/readiness',
    '/admin/community-verifications',
    '/team-invite',
  ]) {
    assert.equal(workflow.includes(`"${route}"`), true, `${route} should stay in production health monitoring`);
  }
});

test('production health monitoring checks for a real React shell instead of HTTP status alone', () => {
  assert.equal(workflow.includes("grep -q 'id=\"root\"'"), true);
  assert.equal(workflow.includes('HTTP ${status}'), true);
  assert.equal(workflow.includes('attempt in 1 2 3'), true);
});

test('production health monitoring also checks the Worker API', () => {
  assert.equal(workflow.includes('https://app.linkary.xyz/api/auth/me'), true);
  assert.equal(workflow.includes("grep -q '\"authenticated\"'"), true);
  assert.equal(workflow.includes('Linkary production API health check failed'), true);
});
