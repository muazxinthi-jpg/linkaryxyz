import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const http = readFileSync(new URL('src/http.ts', root), 'utf8');
const staticSource = readFileSync(new URL('src/static.ts', root), 'utf8');
const healthWorkflow = readFileSync(new URL('.github/workflows/production-health.yml', root), 'utf8');

const requiredHeaders = [
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["permissions-policy", "camera=(), microphone=(), geolocation=()"],
  ["strict-transport-security", "max-age=31536000; includeSubDomains"],
] as const;

test('JSON and HTML helpers add the low-risk launch security header baseline', () => {
  for (const [name, value] of requiredHeaders) {
    assert.ok(http.includes(`'${name}': '${value}'`), `${name} should be present in shared response defaults`);
  }
  assert.match(http, /provided instanceof Headers \? provided : new Headers\(provided\)/);
  assert.match(http, /if \(!headers\.has\(key\)\) headers\.set\(key, value\)/);
});

test('production HTML shells receive the same launch security header baseline', () => {
  for (const [name, value] of requiredHeaders) {
    assert.ok(staticSource.includes(`headers.set('${name}', '${value}')`), `${name} should be set on production HTML`);
  }
  assert.match(staticSource, /if \(env\.APP_ENV !== 'production' \|\| !isHtml\(response\)\) return response/);
});

test('production health monitoring verifies launch security headers after deploy', () => {
  assert.match(healthWorkflow, /- name: Check launch security headers/);
  assert.match(healthWorkflow, /https:\/\/app\.linkary\.xyz\//);
  assert.match(healthWorkflow, /https:\/\/app\.linkary\.xyz\/api\/auth\/me/);
  assert.match(healthWorkflow, /x-content-type-options: nosniff/i);
  assert.match(healthWorkflow, /referrer-policy: strict-origin-when-cross-origin/i);
  assert.match(healthWorkflow, /permissions-policy: camera=\(\), microphone=\(\), geolocation=\(\)/i);
  assert.match(healthWorkflow, /strict-transport-security: max-age=31536000; includeSubDomains/i);
});

test('launch hardening avoids frame and opener policies that could break auth or public-profile preview', () => {
  assert.doesNotMatch(http, /x-frame-options|cross-origin-opener-policy|content-security-policy/i);
  assert.doesNotMatch(staticSource, /x-frame-options|cross-origin-opener-policy|content-security-policy/i);
});
