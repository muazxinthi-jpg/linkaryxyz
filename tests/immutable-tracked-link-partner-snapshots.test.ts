import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0026_immutable_tracked_link_partner_snapshots.sql', import.meta.url), 'utf8');
const runtimeSchema = readFileSync(new URL('../src/db/attributionSchema.ts', import.meta.url), 'utf8');
const tracking = readFileSync(new URL('../src/routes/tracking.ts', import.meta.url), 'utf8');
const conversions = readFileSync(new URL('../src/routes/conversions.ts', import.meta.url), 'utf8');
const view = readFileSync(new URL('../frontend/src/TrackingExperience.tsx', import.meta.url), 'utf8');

const squash = (value: string) => value.replace(/\s+/g, '').toLowerCase();
const migrationView = squash(migration);
const runtimeView = squash(runtimeSchema);
const trackingView = squash(tracking);
const conversionView = squash(conversions);
const frontendView = squash(view);

test('tracked links have a dedicated immutable exact-partner snapshot schema', () => {
  assert.equal(migrationView.includes('createtableifnotexiststracked_link_partner_snapshots'), true);
  assert.equal(migrationView.includes("snapshot_sourcetextnotnullcheck(snapshot_sourcein('link_creation','legacy_backfill'))"), true);
  assert.equal(runtimeView.includes('createtableifnotexiststracked_link_partner_snapshots'), true);
});

test('legacy tracked links are frozen once without pretending to know historical link-creation provenance', () => {
  assert.equal(migrationView.includes('insertorignoreintotracked_link_partner_snapshots'), true);
  assert.equal(migrationView.includes("'legacy_backfill'"), true);
  assert.equal(migration.includes('not proven link-creation provenance'), true);
});

test('new tracking links snapshot the exact partner in the same write batch', () => {
  assert.equal(trackingView.includes('awaitdb.batch(['), true);
  assert.equal(trackingView.includes('insertintotracked_link_partner_snapshots'), true);
  assert.equal(trackingView.includes("'link_creation'"), true);
  assert.equal(trackingView.includes('partner_entity_id'), true);
  assert.equal(trackingView.includes('creator_profile_id'), true);
  assert.equal(trackingView.includes('partner_asset_id'), true);
});

test('tracking redirects and link reads prefer the immutable snapshot even when its partner is intentionally null', () => {
  assert.equal(trackingView.includes('leftjointracked_link_partner_snapshotssnaponsnap.tracked_link_id=t.id'), true);
  assert.equal(trackingView.includes('casewhensnap.tracked_link_idisnotnullthensnap.assignment_kindelsecla.assignment_kindend'), true);
  assert.equal(trackingView.includes('casewhensnap.tracked_link_idisnotnullthensnap.partner_handleelsepne.primary_handleend'), true);
  assert.equal(trackingView.includes('casewhensnap.tracked_link_idisnotnullthensnap.partner_display_nameelsepne.display_nameend'), true);
});

test('Outcome Ledger and CSV use tracking-link snapshot provenance rather than mutable activity assignment', () => {
  assert.equal(conversionView.includes('leftjointracked_link_partner_snapshotssnaponsnap.tracked_link_id=e.tracked_link_id'), true);
  assert.equal(conversionView.includes('casewhensnap.tracked_link_idisnotnullthensnap.partner_display_name'), true);
  assert.equal(conversions.includes("'Partner Snapshot Source'"), true);
  assert.equal(conversions.includes("'Partner Snapshot Captured At'"), true);
  assert.equal(conversions.includes('snap.snapshot_source AS partner_snapshot_source'), true);
  assert.equal(conversions.includes('snap.captured_at AS partner_snapshot_captured_at'), true);
});

test('founder UI distinguishes proven link-creation snapshots from legacy backfills', () => {
  assert.equal(frontendView.includes('currentactivitypartner:'), false);
  assert.equal(view.includes('Attributed partner at tracking-link creation'), true);
  assert.equal(view.includes('Legacy partner snapshot'), true);
  assert.equal(view.includes('Legacy snapshot, not proven link-creation history'), true);
});
