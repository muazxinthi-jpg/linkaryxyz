import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('public username routes use the enhanced public profile renderer', () => {
  assert.equal(source.includes("import { renderPublicProfileEnhanced } from './routes/publicProfileEnhancer';"), true);
  assert.equal(source.includes('return await renderPublicProfileEnhanced(request, env, username);'), true);
  assert.equal(source.includes('return await renderPublicProfile(request, env, username);'), false);
});
