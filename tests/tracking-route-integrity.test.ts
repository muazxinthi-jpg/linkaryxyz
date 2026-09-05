import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

test('invite and tracked-link handlers run before the app SPA fallback', () => {
  const inviteIndex = worker.indexOf("url.pathname.match(/^\\/i\\/([^/]+)$/)");
  const redirectIndex = worker.indexOf("url.pathname.match(/^\\/r\\/([^/]+)$/)");
  const fallbackIndex = worker.indexOf('return baseWorker.fetch(request, env, ctx)');
  assert.notEqual(inviteIndex, -1);
  assert.notEqual(redirectIndex, -1);
  assert.notEqual(fallbackIndex, -1);
  assert.equal(inviteIndex < fallbackIndex, true);
  assert.equal(redirectIndex < fallbackIndex, true);
  assert.equal(worker.includes('renderInviteLanding(request, env'), true);
  assert.equal(worker.includes('redirectTrackedLink(request, env'), true);
});

test('Beta tracking URLs use an explicit Worker-backed origin', () => {
  assert.equal(wrangler.includes('"TRACKING_BASE_URL": "https://app.linkary.xyz"'), true);
  assert.equal(wrangler.includes('"pattern": "app.linkary.xyz/*"'), true);
});
