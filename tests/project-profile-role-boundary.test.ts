import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const integrity = readFileSync(new URL('../src/routes/profileRoleIntegrity.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
const profileGate = readFileSync(new URL('../frontend/src/ProfileAccessExperience.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
const organizations = readFileSync(new URL('../src/routes/organizations.ts', import.meta.url), 'utf8');

test('Project public profile editing is limited to Owner and Admin at the production integrity boundary', () => {
  assert.match(integrity, /profile\.profile_type === 'creator'[\s\S]*profile\.owner_user_id !== auth\.user\.id/);
  assert.match(integrity, /!\['owner', 'admin'\]\.includes\(membership\.role\)/);
  const projectBoundary = integrity.slice(integrity.indexOf("if (profile.profile_type === 'creator')"), integrity.indexOf('export async function getEditableProfileIntegrity'));
  assert.equal(projectBoundary.includes('marketing_manager'), false);
  assert.equal(projectBoundary.includes('analyst'), false);
  assert.equal(projectBoundary.includes('viewer'), false);
});

test('all editable Project profile HTTP surfaces route through the integrity gateway before the base Worker', () => {
  const boundaryIndex = worker.indexOf('const profileBlock =');
  const fallbackIndex = worker.indexOf('return baseWorker.fetch');
  assert.ok(boundaryIndex >= 0 && fallbackIndex > boundaryIndex);
  for (const handler of [
    'getEditableProfileIntegrity',
    'updateProfileIntegrity',
    'listProfileBlocksIntegrity',
    'addProfileBlockIntegrity',
    'updateProfileBlockIntegrity',
    'deleteProfileBlockIntegrity',
    'reorderProfileBlocksIntegrity',
    'publishProfileIntegrity',
    'profileAnalyticsIntegrity',
  ]) {
    assert.equal(worker.includes(handler), true, `${handler} must be wired into production Worker`);
  }
  assert.match(worker, /blocks\|blocks-reorder\|publish\|unpublish\|analytics/);
});

test('frontend Project profile gate renders editing only for Owner or Admin and fails closed otherwise', () => {
  assert.match(profileGate, /nextRole === 'owner' \|\| nextRole === 'admin' \? 'editable' : 'readonly'/);
  assert.equal(profileGate.includes("role === 'marketing_manager'"), true);
  assert.equal(profileGate.includes('Read-only Project profile'), true);
  assert.equal(profileGate.includes('No editing controls are enabled.'), true);
  assert.match(app, /experience === 'profile'\) return <ProfileAccessExperience/);
});

test('Creator personal profile ownership behavior remains available through the same integrity gateway', () => {
  assert.match(integrity, /profile\.profile_type === 'creator'[\s\S]*profile\.owner_user_id !== auth\.user\.id[\s\S]*return;/);
  assert.equal(integrity.includes('getEditableProfile(request, env, profileId)'), true);
});

test('Campaign Manager retains Project operational writes after losing public profile edit authority', () => {
  assert.match(organizations, /write && !\['owner', 'admin', 'marketing_manager'\]\.includes\(membership\.role\)/);
});
