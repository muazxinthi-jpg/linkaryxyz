import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const identityWrapper = readFileSync(new URL('../src/routes/publicProfileIdentity.ts', import.meta.url), 'utf8');

test('public username routes keep the enhanced renderer beneath the Personal Profile identity layer', () => {
  assert.equal(source.includes("import { renderPublicProfileWithIdentity } from './routes/publicProfileIdentity';"), true);
  assert.equal(source.includes('return await renderPublicProfileWithIdentity(request, env, username);'), true);
  assert.equal(identityWrapper.includes("import { renderPublicProfileEnhanced } from './publicProfileEnhancer';"), true);
  assert.equal(identityWrapper.includes('renderPublicProfileEnhanced(request, env, username)'), true);
  assert.equal(source.includes('return await renderPublicProfile(request, env, username);'), false);
});