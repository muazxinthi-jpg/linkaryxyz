import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const implementation = readFileSync(new URL('../IMPLEMENTATION_STATUS.md', import.meta.url), 'utf8');
const betaState = readFileSync(new URL('../docs/CURRENT_BETA_BUILD_STATE.md', import.meta.url), 'utf8');
const codex = readFileSync(new URL('../docs/CODEX_NEXT_BUILD.md', import.meta.url), 'utf8');

for (const [name, doc] of [
  ['IMPLEMENTATION_STATUS.md', implementation],
  ['docs/CURRENT_BETA_BUILD_STATE.md', betaState],
  ['docs/CODEX_NEXT_BUILD.md', codex],
] as const) {
  test(`${name} reflects the current Beta phase`, () => {
    assert.equal(doc.includes('Collaboration Inquiry V1'), true);
    assert.equal(doc.includes('Campaign Lifecycle V1'), true);
    assert.equal(doc.includes('0026_immutable_tracked_link_partner_snapshots.sql'), true);
    assert.equal(doc.includes('Collaboration Inquiry V1 is not built yet'), false);
    assert.equal(doc.includes('Collaboration Inquiry V1 comes only after'), false);
    assert.equal(doc.includes('build **Collaboration Inquiry V1**'), false);
  });
}

test('status docs mark production D1 current through 0026', () => {
  assert.equal(implementation.includes('Production schema is current through `0026_immutable_tracked_link_partner_snapshots.sql`'), true);
  assert.equal(betaState.includes('`0026_immutable_tracked_link_partner_snapshots.sql`'), true);
  assert.equal(codex.includes('`0026_immutable_tracked_link_partner_snapshots.sql`'), true);
  for (const doc of [implementation, betaState, codex]) {
    assert.equal(doc.includes('0024_activity_measurement_evidence.sql'), true);
    assert.equal(doc.includes('0025_actual_spend_ledger.sql'), true);
    assert.equal(doc.includes('No migrations to apply!'), true);
  }
});

test('status docs preserve the real authentication model', () => {
  for (const doc of [implementation, betaState, codex]) {
    assert.equal(doc.includes('Email'), true);
    assert.equal(doc.includes('Google'), true);
    assert.equal(doc.includes('X'), true);
    assert.equal(doc.includes('Telegram authentication'), false);
    assert.equal(doc.includes('Telegram linking'), true);
  }
  assert.equal(betaState.includes('Telegram is a separate authenticated Personal Profile connection'), true);
  assert.equal(codex.includes('Telegram is a separate authenticated Personal Profile connection, not a Linkary sign-in provider.'), true);
});

test('current Beta handoff says acceptance is next rather than a major feature', () => {
  assert.equal(betaState.includes('Do **not** start another major feature.'), true);
  assert.equal(betaState.includes('finish real attribution/end-to-end acceptance'), true);
  assert.equal(betaState.includes('finish issue #42 authenticated visual/device acceptance'), true);
});

test('Codex handoff locks the full current product loop and acceptance phase', () => {
  assert.equal(codex.includes('Identity -> Discovery -> Relationship -> Inquiry -> Accept -> Explicit activation -> Campaign -> Activity -> Exact Partner -> Track -> Outcome -> Attribution -> Proof -> Relationship Memory -> Work Again'), true);
  assert.equal(codex.includes('Beta acceptance, responsive QA, bug fixing and launch hardening'), true);
  assert.equal(codex.includes('Creator A -> new Tracking Link -> real browser Click -> Outcome/value -> Growth Intelligence -> reassign Activity to Creator B'), true);
});

test('status docs do not freeze an obsolete regression count', () => {
  for (const doc of [implementation, betaState, codex]) {
    assert.equal(doc.includes('207 passing'), false);
    assert.equal(doc.includes('207 regression'), false);
    assert.equal(doc.includes('latest `main` CI'), true);
  }
});

test('status docs distinguish static responsive coverage from live authenticated acceptance', () => {
  assert.equal(implementation.includes('Static responsive coverage does not close Issue #42 by itself.'), true);
  assert.equal(betaState.includes('Full authenticated live visual/device acceptance is still required'), true);
  assert.equal(codex.includes('Keep Issue #42 open until this authenticated live pass is complete.'), true);
});

test('current Beta state records expanded production health route coverage', () => {
  for (const route of [
    '/opportunities',
    '/communities',
    '/creators',
    '/settings/team-invites',
    '/admin/readiness',
    '/admin/community-verifications',
    '/team-invite',
  ]) {
    assert.equal(betaState.includes(`- \`${route}\``), true, `${route} should be documented in production health coverage`);
  }
});