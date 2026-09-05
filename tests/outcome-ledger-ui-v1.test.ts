import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tracking = readFileSync(new URL('../frontend/src/TrackingExperience.tsx', import.meta.url), 'utf8');
const squash = (value: string) => value.replace(/\s+/g, '');
const view = squash(tracking);

test('Outcome Ledger uses the canonical founder taxonomy and still supports custom outcomes', () => {
  for (const value of ['signup', 'telegram_join', 'retained_user', 'wallet_connect', 'lead', 'purchase', 'deposit', 'subscription', 'token_purchase', 'custom']) {
    assert.equal(tracking.includes(`value: '${value}'`), true, value);
  }
  assert.equal(view.includes('outcomeResult.outcomeTypes?.length'), true);
  assert.equal(view.includes('Customoutcomename'), true);
});

test('manual outcome UI cannot imply founder-entered evidence is verified', () => {
  assert.equal(view.includes('Founder-enteredoutcomesarestoredasManualevidence.Linkarydoesnotupgradethemtotrackedorverified.'), true);
  assert.equal(view.includes('RecordManualoutcome'), true);
  assert.equal(view.includes("setMessage(result.duplicate?'ThatexternaloutcomeIDalreadyexists.Theoriginaloutcomewaskept.':'OutcomerecordedasManualevidence.')"), true);
});

test('Outcome Ledger sends optional occurrence time and preserves duplicate-safe external IDs', () => {
  assert.equal(view.includes('type="datetime-local"'), true);
  assert.equal(view.includes('occurredAt:outcomeForm.occurredAt?newDate(outcomeForm.occurredAt).toISOString():undefined'), true);
  assert.equal(view.includes('ExternaloutcomeID'), true);
  assert.equal(view.includes('Linkarypreventsduplicates.'), true);
});

test('Outcome Ledger exposes outcome-type filtering and keeps it in CSV parity', () => {
  assert.equal(view.includes("if(filters.eventType)outcomeQuery.set('eventType',filters.eventType)"), true);
  assert.equal(view.includes("if(filters.eventType)csvParams.set('eventType',filters.eventType)"), true);
  assert.equal(view.includes('Alloutcometypes'), true);
});

test('Outcome rows distinguish immutable link-creation attribution from legacy partner backfills', () => {
  assert.equal(view.includes('Currentactivitypartner:'), false);
  assert.equal(view.includes('Attributedpartnerattracking-linkcreation'), true);
  assert.equal(view.includes('Legacypartnersnapshot'), true);
  assert.equal(view.includes('Legacysnapshot,notprovenlink-creationhistory'), true);
  assert.equal(view.includes('outcome.partner_display_name'), true);
  assert.equal(view.includes("outcome.partner_kind==='community'"), true);
});
