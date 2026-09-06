import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/trackingEntry.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

test('invite handling remains before the app SPA fallback', () => {
  const inviteIndex = worker.indexOf("url.pathname.match(/^\\/i\\/([^/]+)$/)");
  const fallbackIndex = worker.indexOf('return baseWorker.fetch(request, env, ctx)');
  assert.notEqual(inviteIndex, -1);
  assert.notEqual(fallbackIndex, -1);
  assert.equal(inviteIndex < fallbackIndex, true);
  assert.equal(worker.includes('renderInviteLanding(request, env'), true);
});

test('tracking entry intercepts redirects and passes the Worker execution context', () => {
  const redirectIndex = entry.indexOf("url.pathname.match(/^\\/r\\/([^/]+)$/)");
  const fallbackIndex = entry.indexOf('return worker.fetch(request, env, ctx)');
  assert.notEqual(redirectIndex, -1);
  assert.notEqual(fallbackIndex, -1);
  assert.equal(redirectIndex < fallbackIndex, true);
  assert.equal(entry.includes('redirectTrackedLink(request, env, decodeURIComponent(trackedRedirect[1]), ctx)'), true);
});

test('new links use l.linkary.xyz while legacy app.linkary.xyz redirects stay routed', () => {
  assert.equal(wrangler.includes('"main": "src/trackingEntry.ts"'), true);
  assert.equal(wrangler.includes('"TRACKING_BASE_URL": "https://l.linkary.xyz"'), true);
  assert.equal(wrangler.includes('"pattern": "l.linkary.xyz/r/*"'), true);
  assert.equal(wrangler.includes('"pattern": "app.linkary.xyz/*"'), true);
});
