import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../frontend/src/ProductWorkspace.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/trackingEntry.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

test('Superadmin host gate is mounted only on sadmin.linkary.xyz', () => {
  assert.match(main, /SuperadminHostGate/);
  assert.match(main, /window\.location\.hostname\.toLowerCase\(\) === 'sadmin\.linkary\.xyz'/);
});

test('Superadmin navigation exposes readiness, reviews, commercial controls and coupons', () => {
  assert.match(workspace, /window\.location\.hostname\.toLowerCase\(\) === 'sadmin\.linkary\.xyz'/);
  for (const label of ['Beta readiness', 'Community reviews', 'Commercial accounts', 'Coupons', 'Admin review']) {
    assert.equal(workspace.includes(label), true, `missing ${label}`);
  }
});

test('normal app admin URLs redirect while the Superadmin host retains the admin routes', () => {
  assert.match(app, /location\.pathname\.startsWith\('\/admin'\) && !isSuperadminHost/);
  assert.match(app, /<Navigate to="\/dashboard" replace \/>/);
});

test('Superadmin host is no-indexed and reuses host-only session cookies', () => {
  assert.match(entry, /x-robots-tag/);
  assert.match(entry, /SUPERADMIN_BASE_URL/);
  assert.match(entry, /__Host cookies/);
});

test('sadmin is configured as a custom domain, not a duplicate Worker route', () => {
  assert.match(wrangler, /SUPERADMIN_BASE_URL/);
  assert.doesNotMatch(wrangler, /sadmin\.linkary\.xyz\/\*/);
});
