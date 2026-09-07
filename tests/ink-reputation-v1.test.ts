import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { buildInkV1Evidence, INK_COMPONENTS, INK_MAX_SCORE, INK_V1_VERSION } from '../src/ink';

const migration = readFileSync(new URL('../migrations/0038_ink_reputation_v1.sql', import.meta.url), 'utf8');
const profileRoute = readFileSync(new URL('../src/routes/profileIdentity.ts', import.meta.url), 'utf8');
const profileUi = readFileSync(new URL('../frontend/src/PersonalNetworkPanel.tsx', import.meta.url), 'utf8');

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE profiles (
      id TEXT PRIMARY KEY NOT NULL,
      owner_user_id TEXT NOT NULL REFERENCES users(id)
    );
  `);
  db.prepare('INSERT INTO users (id) VALUES (?)').run('user_1');
  db.prepare('INSERT INTO profiles (id, owner_user_id) VALUES (?, ?)').run('profile_1', 'user_1');
  db.exec(migration);
  return db;
}

test('INK V1 component caps total exactly 10,000 points', () => {
  assert.equal(INK_V1_VERSION, 'ink-v1');
  assert.equal(INK_MAX_SCORE, 10_000);
  assert.deepEqual(
    INK_COMPONENTS.map((component) => [component.key, component.maxScore]),
    [
      ['network_strength', 3000],
      ['verified_contribution', 2500],
      ['trust_votes', 2000],
      ['network_economic_footprint', 1000],
      ['integrity_reliability', 1500],
    ],
  );
  assert.equal(INK_COMPONENTS.reduce((sum, component) => sum + component.maxScore, 0), 10_000);
});

test('INK V1 exposes evidence without publishing an invented score', () => {
  const ink = buildInkV1Evidence({
    available: true,
    summary: { directInvites: 2, totalNetwork: 5, creators: 4, projects: 1 },
    generations: [
      { depth: 1, members: 2 },
      { depth: 2, members: 2 },
      { depth: 3, members: 1 },
      { depth: 4, members: 0 },
      { depth: 5, members: 0 },
      { depth: 6, members: 0 },
      { depth: 7, members: 0 },
    ],
  });

  assert.equal(ink.status, 'building');
  assert.equal(ink.scoringActivated, false);
  assert.equal(ink.totalScore, null);
  assert.equal(ink.maxScore, 10_000);
  assert.ok(ink.components.every((component) => component.score === null && component.status === 'building'));
  const network = ink.components.find((component) => component.key === 'network_strength');
  assert.ok(network?.evidenceSummary.includes('5 total network members'));
  assert.ok(network?.evidenceSummary.includes('Gen 3: 1 member'));
});

test('0038 stores versioned evidence and enforces score caps', () => {
  const db = database();
  db.prepare(`
    INSERT INTO ink_score_snapshots (
      id, profile_id, owner_user_id, score_version, status, methodology_note, computed_at, created_at
    ) VALUES (?, ?, ?, ?, 'building', ?, ?, ?)
  `).run('ink_1', 'profile_1', 'user_1', 'ink-v1', 'Evidence collection only', '2026-09-07T17:00:00Z', '2026-09-07T17:00:00Z');

  const row = db.prepare('SELECT total_score AS totalScore, status FROM ink_score_snapshots WHERE id = ?').get('ink_1') as { totalScore: number | null; status: string };
  assert.equal(row.totalScore, null);
  assert.equal(row.status, 'building');

  assert.throws(() => {
    db.prepare(`
      INSERT INTO ink_score_snapshots (
        id, profile_id, owner_user_id, score_version, status, total_score,
        network_strength_score, methodology_note, computed_at, created_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, '', ?, ?)
    `).run('ink_bad', 'profile_1', 'user_1', 'ink-v1', 10001, 3001, '2026-09-07T17:01:00Z', '2026-09-07T17:01:00Z');
  });

  assert.throws(() => {
    db.prepare(`
      INSERT INTO ink_component_evidence (
        id, profile_id, owner_user_id, score_version, component, source_type,
        generation, evidence_status, recorded_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'building', ?, ?)
    `).run('evidence_bad', 'profile_1', 'user_1', 'ink-v1', 'network_strength', 'network_graph', 8, '2026-09-07T17:02:00Z', '2026-09-07T17:02:00Z');
  });
});

test('INK stays separate from verification, billing and attribution authority', () => {
  const source = readFileSync(new URL('../src/ink.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /UPDATE\s+/i);
  assert.doesNotMatch(source, /INSERT\s+/i);
  assert.doesNotMatch(source, /billing/i);
  assert.doesNotMatch(source, /attribution/i);
  assert.doesNotMatch(source, /verification_status\s*=/i);
  assert.match(migration, /does NOT activate a numeric scoring formula/i);
  assert.match(migration, /does NOT\s+activate downstream referral cash rewards/i);
});

test('profile response and Personal Network UI expose explainable INK when wired', () => {
  assert.match(profileRoute, /personalNetworkPayload/);
  assert.match(profileUi, /INK Points/);
  assert.match(profileUi, /Building/);
});
