import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = readFileSync(new URL('../migrations/0027_network_invite_redemption_guard.sql', import.meta.url), 'utf8');
const teamMigration = readFileSync(new URL('../migrations/0019_project_team_invitations.sql', import.meta.url), 'utf8');

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE invites (
      id TEXT PRIMARY KEY NOT NULL,
      invite_type TEXT NOT NULL,
      status TEXT NOT NULL,
      uses INTEGER NOT NULL DEFAULT 0,
      max_uses INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT
    );
    CREATE TABLE invite_redemptions (
      id TEXT PRIMARY KEY NOT NULL,
      invite_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      redeemed_at TEXT NOT NULL,
      UNIQUE(invite_id, user_id)
    );
  `);
  db.exec(migration);
  return db;
}

test('0027 adds a database guard scoped only to normal network invites', () => {
  assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_network_invite_redemption_guard_before_insert/);
  assert.match(migration, /BEFORE INSERT ON invite_redemptions/);
  assert.match(migration, /i\.invite_type = 'network_invite'/);
  assert.match(migration, /i\.status != 'active'/);
  assert.match(migration, /datetime\(i\.expires_at\) <= CURRENT_TIMESTAMP/);
  assert.match(migration, /i\.uses >= i\.max_uses/);
  assert.match(migration, /COUNT\(\*\)[\s\S]*existing\.invite_id = NEW\.invite_id[\s\S]*>= i\.max_uses/);
  assert.match(migration, /RAISE\(ABORT, 'network_invite_unavailable'\)/);
  assert.equal(migration.includes("invite_type = 'team_invite'"), false);
});

test('existing Team invitation race guard remains separate and unchanged', () => {
  assert.match(teamMigration, /trg_team_invite_redemption_guard_before_insert/);
  assert.match(teamMigration, /i\.invite_type = 'team_invite'/);
  assert.match(teamMigration, /RAISE\(ABORT, 'team_invite_unavailable'\)/);
});

test('a single-use network invite cannot create a second redemption even before its uses counter changes', () => {
  const db = database();
  db.prepare(`INSERT INTO invites (id, invite_type, status, uses, max_uses, expires_at) VALUES (?, 'network_invite', 'active', 0, 1, NULL)`).run('inv_one');
  db.prepare(`INSERT INTO invite_redemptions (id, invite_id, user_id, redeemed_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`).run('red_a', 'inv_one', 'user_a');
  assert.throws(
    () => db.prepare(`INSERT INTO invite_redemptions (id, invite_id, user_id, redeemed_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`).run('red_b', 'inv_one', 'user_b'),
    /network_invite_unavailable/,
  );
});

test('network invite max_uses is enforced from redemption rows as well as the invite counter', () => {
  const db = database();
  db.prepare(`INSERT INTO invites (id, invite_type, status, uses, max_uses, expires_at) VALUES (?, 'network_invite', 'active', 0, 2, NULL)`).run('inv_two');
  const insert = db.prepare(`INSERT INTO invite_redemptions (id, invite_id, user_id, redeemed_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`);
  insert.run('red_1', 'inv_two', 'user_1');
  insert.run('red_2', 'inv_two', 'user_2');
  assert.throws(() => insert.run('red_3', 'inv_two', 'user_3'), /network_invite_unavailable/);
});

test('inactive, exhausted and expired network invites fail closed before redemption', () => {
  const db = database();
  const create = db.prepare(`INSERT INTO invites (id, invite_type, status, uses, max_uses, expires_at) VALUES (?, 'network_invite', ?, ?, 1, ?)`);
  create.run('revoked', 'revoked', 0, null);
  create.run('exhausted', 'active', 1, null);
  create.run('expired', 'active', 0, '2020-01-01T00:00:00Z');
  const insert = db.prepare(`INSERT INTO invite_redemptions (id, invite_id, user_id, redeemed_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`);
  assert.throws(() => insert.run('r1', 'revoked', 'u1'), /network_invite_unavailable/);
  assert.throws(() => insert.run('r2', 'exhausted', 'u2'), /network_invite_unavailable/);
  assert.throws(() => insert.run('r3', 'expired', 'u3'), /network_invite_unavailable/);
});

test('0027 does not add a guard to other invitation types', () => {
  const db = database();
  db.prepare(`INSERT INTO invites (id, invite_type, status, uses, max_uses, expires_at) VALUES (?, 'campaign_invite', 'revoked', 1, 1, NULL)`).run('campaign');
  assert.doesNotThrow(() => {
    db.prepare(`INSERT INTO invite_redemptions (id, invite_id, user_id, redeemed_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`).run('campaign_red', 'campaign', 'campaign_user');
  });
});
