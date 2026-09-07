import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const deploy = readFileSync(new URL('../.github/workflows/deploy-production.yml', import.meta.url), 'utf8');
const health = readFileSync(new URL('../.github/workflows/production-health.yml', import.meta.url), 'utf8');

test('Superadmin hostname is source-controlled as the current Worker custom domain', () => {
  assert.match(wrangler, /"pattern"\s*:\s*"sadmin\.linkary\.xyz"[\s\S]*?"custom_domain"\s*:\s*true/);
  assert.doesNotMatch(wrangler, /sadmin\.linkary\.xyz\/\*/);
  assert.match(wrangler, /app\.linkary\.xyz\/\*/);
});

test('production deploy fails if Superadmin serves a stale frontend bundle', () => {
  assert.match(deploy, /Verify Superadmin serves current production bundle/);
  assert.match(deploy, /https:\/\/sadmin\.linkary\.xyz\//);
  assert.match(deploy, /app_bundle/);
  assert.match(deploy, /sadmin_bundle/);
  assert.match(deploy, /app_bundle" == "\$sadmin_bundle/);
  assert.match(deploy, /x-robots-tag: noindex/i);
});

test('hourly production health monitors Superadmin bundle parity and noindex', () => {
  assert.match(health, /Check Superadmin bundle parity and noindex/);
  assert.match(health, /https:\/\/sadmin\.linkary\.xyz\//);
  assert.match(health, /app_bundle/);
  assert.match(health, /sadmin_bundle/);
  assert.match(health, /x-robots-tag: noindex/i);
});
