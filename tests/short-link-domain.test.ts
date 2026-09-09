import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
const invites = readFileSync(new URL('../src/routes/invites.ts', import.meta.url), 'utf8');

test('l.linkary.xyz is a production Worker custom domain', () => {
  assert.equal(wrangler.includes('"TRACKING_BASE_URL": "https://l.linkary.xyz"'), true);
  assert.equal(wrangler.includes('"pattern": "l.linkary.xyz"'), true);
  assert.equal(wrangler.includes('"custom_domain": true'), true);
});

test('short-link Worker keeps invite and tracking entry routes', () => {
  assert.equal(worker.includes("url.pathname.match(/^\\/i\\/([^/]+)$/)"), true);
  assert.equal(worker.includes('renderInviteLanding(request, env'), true);
  assert.equal(worker.includes("url.pathname.match(/^\\/r\\/([^/]+)$/)"), true);
  assert.equal(worker.includes('redirectTrackedLink(request, env'), true);
});

test('network invites continue using the configured Linkary short-link host', () => {
  assert.equal(invites.includes('`${urls.tracking}/i/${encodeURIComponent(row.display_code)}`'), true);
  assert.equal(invites.includes('`${getLinkaryUrls(request, env).tracking}/i/${encodeURIComponent(rawCode)}`'), true);
});
