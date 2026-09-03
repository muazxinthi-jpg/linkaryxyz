import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/0020_exact_activity_partner_assignment.sql', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/routes/activities.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/TrackingExperience.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/tracking-assignment.css', import.meta.url), 'utf8');

test('exact activity assignment keeps Creator and Community provenance distinct', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS campaign_activity_linkary_assignments/);
  assert.match(migration, /assignment_kind IN \('creator', 'community'\)/);
  assert.match(migration, /creator_profile_id TEXT REFERENCES profiles\(id\)/);
  assert.match(migration, /partner_manager_id TEXT REFERENCES partner_managers\(id\)/);
  assert.match(migration, /partner_asset_id TEXT REFERENCES partner_manager_assets\(id\)/);
  assert.match(migration, /assignment_kind = 'creator'[\s\S]*creator_profile_id IS NOT NULL/);
  assert.match(migration, /assignment_kind = 'community'[\s\S]*partner_manager_id IS NOT NULL AND partner_asset_id IS NOT NULL/);
});

test('activity route binds exact partners into the existing attribution participant chain', () => {
  assert.match(route, /campaign_activity_linkary_assignments/);
  assert.match(route, /campaign_activity_participants/);
  assert.match(route, /creator_profile_id/);
  assert.match(route, /partner_asset_id/);
  assert.match(route, /asset_type = 'telegram_community'/);
  assert.match(route, /provider_object_type = 'person'/);
  assert.match(route, /ownership_verified_at IS NOT NULL/);
  assert.match(route, /clearPartner/);
  assert.match(route, /participant_created_by_assignment/);
});

test('Evidence UI discovers Linkary partners and requires an exact Community asset', () => {
  assert.match(ui, /discovery=1&type=creator&open=1/);
  assert.match(ui, /discovery=1&type=community_manager&open=1/);
  assert.match(ui, /\/api\/partner-manager-assets\?managerId=/);
  assert.match(ui, /partnerAssetId/);
  assert.match(ui, /Exact Telegram Community/);
  assert.match(ui, /This exact Community, not only its manager, will own the campaign evidence/);
  assert.match(ui, /clearPartner: true/);
});

test('Evidence UI preserves verification language instead of upgrading manual evidence', () => {
  assert.match(ui, /Verified Creator/);
  assert.match(ui, /Verified Community/);
  assert.match(ui, /Verification submitted/);
  assert.match(ui, /Verification not approved/);
  assert.match(ui, /Not verified/);
});

test('exact partner Evidence UI has required mobile acceptance protections', () => {
  assert.match(css, /@media\s*\(max-width:\s*430px\)/);
  assert.match(css, /@media\s*\(max-width:\s*320px\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /max-height:\s*calc\(100dvh - 16px\)/);
  assert.match(css, /overflow-y:\s*auto/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});
