import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0023_personal_profile_identity.sql', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/routes/profileIdentity.ts', import.meta.url), 'utf8');
const publicRenderer = readFileSync(new URL('../src/routes/publicProfileIdentity.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../frontend/src/ProfileExperienceIdentityV1.tsx', import.meta.url), 'utf8');
const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const model = readFileSync(new URL('../src/db/models.ts', import.meta.url), 'utf8');

test('Personal Profile Identity V1 adds presentation fields without changing structural profile types', () => {
  assert.equal(migration.includes('ALTER TABLE profiles ADD COLUMN public_role TEXT'), true);
  assert.equal(migration.includes('ALTER TABLE profiles ADD COLUMN professional_headline TEXT'), true);
  assert.equal(migration.includes('CREATE INDEX'), false);
  assert.equal(model.includes("profile_type: 'creator' | 'project'"), true);
  assert.equal(migration.includes("profile_type"), true);
});

test('public role choices include founders, creators and manager identities', () => {
  for (const value of ['founder', 'co_founder', 'creator', 'kol', 'community_manager', 'kol_manager', 'growth_bd', 'investor', 'developer_builder']) {
    assert.equal(route.includes(`'${value}'`), true, `${value} should be a supported presentation role`);
  }
  assert.equal(route.includes("Founder"), true);
  assert.equal(route.includes("Community Manager"), true);
  assert.equal(route.includes("KOL Manager"), true);
});

test('identity settings are personal-profile owned, CSRF protected and presentation only', () => {
  assert.equal(route.includes('owner_user_id = ?'), true);
  assert.equal(route.includes("profile.profile_type !== 'creator'"), true);
  assert.equal(route.includes('verifyCsrf(request, env, auth)'), true);
  assert.equal(route.includes('organization_memberships'), false);
  assert.equal(route.includes('verification_status ='), false);
  assert.equal(route.includes('campaign_activity'), false);
  assert.equal(route.includes('invite_credit'), false);
  assert.equal(migration.includes('never grant Project permissions'), true);
});

test('profile edit page exposes role and headline selection as Personal Profile UI', () => {
  assert.equal(app.includes("ProfileExperienceIdentityV1"), true);
  assert.equal(editor.includes('Primary public role'), true);
  assert.equal(editor.includes('Professional headline'), true);
  assert.equal(editor.includes('Select your identity'), true);
  assert.equal(editor.includes('Presentation only'), true);
  assert.equal(editor.includes('Project roles, permissions, verification, manager status or campaign evidence'), true);
  assert.equal(editor.includes('/identity'), true);
});

test('saving public identity refreshes the exact embedded public profile preview', () => {
  assert.equal(editor.includes("document.querySelector<HTMLIFrameElement>('.profile-beta-public-preview iframe')"), true);
  assert.equal(editor.includes("preview.searchParams.set('editorPreview', String(Date.now()))"), true);
  assert.equal(editor.includes('refreshPublicPreview();'), true);
  assert.equal(editor.includes('Public identity saved. Preview refreshed.'), true);
});

test('public personal profiles use the selected label and fail safe to PERSONAL IDENTITY', () => {
  assert.equal(publicRenderer.includes("return 'PERSONAL IDENTITY'"), true);
  assert.equal(publicRenderer.includes('professional-headline'), true);
  assert.equal(publicRenderer.includes("profile.profile_type === 'project'"), true);
  assert.equal(index.includes('renderPublicProfileWithIdentity'), true);
  assert.equal(index.includes('/identity$/'), true);
});
