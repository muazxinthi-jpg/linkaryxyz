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
    assert.equal(doc.includes('0022'), true);
    assert.equal(doc.includes('Collaboration Inquiry V1 is not built yet'), false);
    assert.equal(doc.includes('Collaboration Inquiry V1 comes only after'), false);
    assert.equal(doc.includes('build **Collaboration Inquiry V1**'), false);
  });
}

test('implementation status marks production D1 current through 0022', () => {
  assert.equal(implementation.includes('Production schema is current through `0022_collaboration_inquiry_activations.sql`'), true);
});

test('current Beta handoff says acceptance is next rather than a major feature', () => {
  assert.equal(betaState.includes('Do **not** start another major feature.'), true);
  assert.equal(betaState.includes('finish real-account/end-to-end acceptance'), true);
  assert.equal(betaState.includes('finish issue #42 responsive acceptance'), true);
});

test('Codex handoff locks the full current product loop and acceptance phase', () => {
  assert.equal(codex.includes('Identity -> Discovery -> Relationship -> Inquiry -> Accept -> Explicit activation -> Campaign -> Activity -> Exact Partner -> Track -> Outcome -> Attribution -> Proof -> Relationship Memory -> Work Again'), true);
  assert.equal(codex.includes('Beta acceptance, responsive QA, bug fixing and launch hardening'), true);
});
