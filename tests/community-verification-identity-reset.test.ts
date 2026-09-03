import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('verified community identity changes are null-safe and reset verification', () => {
  const route = readFileSync(new URL('../src/routes/partnerDirectory.ts', import.meta.url), 'utf8');
  assert.equal(route.includes("COALESCE(handle,'') != COALESCE(?, '')"), true);
  assert.equal(route.includes("COALESCE(url,'') != COALESCE(?, '')"), true);
  assert.equal(route.includes("THEN 'unverified' ELSE verification_status END"), true);
  assert.equal(route.includes("handle != ? OR COALESCE(url,''"), false);
});
