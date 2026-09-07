import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = readFileSync(new URL('../migrations/0037_seven_generation_network.sql', import.meta.url), 'utf8');
const profileRoute = readFileSync(new URL('../src/routes/profileIdentity.ts', import.meta.url), 'utf8');
const networkUi = readFileSync(new URL('../frontend/src/PersonalNetworkPanel.tsx', import.meta.url), 'utf8');
const inviteUi = readFileSync(new URL('../frontend/src/InviteExperience.tsx', import.meta.url), 'utf8');
const profileIdentityUi = readFileSync(new URL('../frontend/src/ProfileExperienceIdentityV1.tsx', import.meta.url), 'utf8');
const networkCss = readFileSync(new URL('../frontend/src/personal-network.css', import.meta.url), 'utf8');
const tabsCss = readFileSync(new URL('../frontend/src/private-network-tabs.css', import.meta.url), 'utf8');

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE invites (
      id TEXT PRIMARY KEY NOT NULL,
      invite_type TEXT NOT NULL,
      inviter_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      uses INTEGER NOT NULL DEFAULT 0,
      max_uses INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT
    );
    CREATE TABLE invite_redemptions (
      id TEXT PRIMARY KEY NOT NULL,
      invite_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      chosen_account_type TEXT,
      organization_id TEXT,
      quality_state TEXT NOT NULL DEFAULT 'pending',
      redeemed_at TEXT NOT NULL,
      UNIQUE(invite_id, user_id)
    );
  `);
  return db;
}

function addUser(db: DatabaseSync, userId: string) {
  db.prepare('INSERT INTO users (id) VALUES (?)').run(userId);
}

function addRedemption(db: DatabaseSync, inviter: string, invitee: string, suffix: string, accountType: 'creator' | 'project' | null = 'creator') {
  const inviteId = `invite_${suffix}`;
  db.prepare(`INSERT INTO invites (id, invite_type, inviter_user_id) VALUES (?, 'network_invite', ?)`).run(inviteId, inviter);
  db.prepare(`INSERT INTO invite_redemptions (id, invite_id, user_id, chosen_account_type, redeemed_at) VALUES (?, ?, ?, ?, ?)`)
    .run(`redemption_${suffix}`, inviteId, invitee, accountType, `2026-09-0${Math.min(9, Number(suffix.replace(/\D/g, '')) || 1)}T00:00:00Z`);
  return inviteId;
}

test('0037 backfills a seven-generation closure without creating generation eight for an ancestor', () => {
  const db = database();
  for (const user of ['a','b','c','d','e','f','g','h','i']) addUser(db, user);
  addRedemption(db, 'a', 'b', '1');
  addRedemption(db, 'b', 'c', '2');
  addRedemption(db, 'c', 'd', '3');
  addRedemption(db, 'd', 'e', '4');
  addRedemption(db, 'e', 'f', '5');
  addRedemption(db, 'f', 'g', '6');
  addRedemption(db, 'g', 'h', '7');
  addRedemption(db, 'h', 'i', '8');

  db.exec(migration);

  const rows = db.prepare(`SELECT descendant_user_id AS descendant, depth FROM network_referral_paths WHERE ancestor_user_id = 'a' ORDER BY depth`).all() as Array<{ descendant: string; depth: number }>;
  assert.deepEqual(rows.map((row) => [row.descendant, row.depth]), [
    ['b',1],['c',2],['d',3],['e',4],['f',5],['g',6],['h',7],
  ]);
  assert.equal(db.prepare(`SELECT COUNT(*) AS total FROM network_referral_paths WHERE depth > 7`).get()?.total, 0);
});

test('new redemptions create direct and inherited paths idempotently after migration', () => {
  const db = database();
  for (const user of ['root','first','second','third']) addUser(db, user);
  addRedemption(db, 'root', 'first', '1');
  db.exec(migration);

  addRedemption(db, 'first', 'second', '2', null);
  addRedemption(db, 'second', 'third', '3', 'project');

  const rootPaths = db.prepare(`SELECT descendant_user_id AS descendant, depth FROM network_referral_paths WHERE ancestor_user_id = 'root' ORDER BY depth`).all() as Array<{ descendant: string; depth: number }>;
  assert.deepEqual(rootPaths.map((row) => [row.descendant, row.depth]), [['first',1],['second',2],['third',3]]);

  db.prepare(`UPDATE invite_redemptions SET chosen_account_type = 'creator' WHERE user_id = 'second'`).run();
  assert.equal(db.prepare(`SELECT chosen_account_type AS type FROM network_referral_edges WHERE invitee_user_id = 'second'`).get()?.type, 'creator');
});

test('self referrals, second inviters and known cycles do not rewrite permanent lineage', () => {
  const db = database();
  for (const user of ['a','b','c']) addUser(db, user);
  db.exec(migration);

  addRedemption(db, 'a', 'a', '1');
  assert.equal(db.prepare(`SELECT COUNT(*) AS total FROM network_referral_edges`).get()?.total, 0);

  addRedemption(db, 'a', 'b', '2');
  addRedemption(db, 'c', 'b', '3');
  const edge = db.prepare(`SELECT inviter_user_id AS inviter FROM network_referral_edges WHERE invitee_user_id = 'b'`).get() as { inviter: string };
  assert.equal(edge.inviter, 'a');

  addRedemption(db, 'b', 'a', '4');
  assert.equal(db.prepare(`SELECT COUNT(*) AS total FROM network_referral_edges WHERE invitee_user_id = 'a'`).get()?.total, 0);
});

test('personal network reads stay bounded, private-safe and seven-generation scoped', () => {
  assert.match(profileRoute, /network_referral_paths p/);
  assert.match(profileRoute, /p\.ancestor_user_id = \?/);
  assert.match(profileRoute, /p\.depth = \?/);
  assert.match(profileRoute, /LIMIT \? OFFSET \?/);
  assert.match(profileRoute, /networkDepth/);
  assert.match(profileRoute, /boundedInteger\([^\n]+1, 1, 7\)/);
  assert.match(profileRoute, /cp\.visibility = 'published'/);
  assert.match(profileRoute, /pp\.visibility = 'published'/);
  assert.match(profileRoute, /networkGraph/);
  assert.match(profileRoute, /networkGraphLimit/);
  assert.match(profileRoute, /boundedInteger\([^\n]+120, 20, 160\)/);
  assert.match(profileRoute, /p\.depth BETWEEN 1 AND 7/);
  assert.match(profileRoute, /opaqueIds/);
  assert.doesNotMatch(profileRoute, /SELECT[^\n]*email/i);
  assert.doesNotMatch(profileRoute, /wallet_address/i);
});

test('Invite workspace owns My Network while Profile stays identity-focused', () => {
  assert.match(inviteUi, /PRIVATE NETWORK/);
  assert.match(inviteUi, /Private Network views/);
  assert.match(inviteUi, />Invitations</);
  assert.match(inviteUi, />My network</);
  assert.match(inviteUi, />Network map</);
  assert.match(inviteUi, /<PersonalNetworkPanel profileId=\{profile\.id\} view="network" \/>/);
  assert.match(inviteUi, /<PersonalNetworkPanel profileId=\{profile\.id\} view="map" \/>/);
  assert.match(inviteUi, /const isPersonal = profile\?\.profile_type === 'creator'/);
  assert.doesNotMatch(profileIdentityUi, /PersonalNetworkPanel/);
  assert.match(profileIdentityUi, /<PersonalTelegramConnection \/>/);
});

test('private network map is interactive, depth-filtered and has a mobile-safe visual fallback', () => {
  assert.match(networkUi, /RELATIONSHIP MAP/);
  assert.match(networkUi, /How your network connects/);
  assert.match(networkUi, /data-network-map/);
  assert.match(networkUi, /<svg/);
  assert.match(networkUi, /Show through/);
  assert.match(networkUi, /Generation \{index \+ 1\}/);
  assert.match(networkUi, /Zoom in/);
  assert.match(networkUi, /Zoom out/);
  assert.match(networkUi, />Reset</);
  assert.match(networkUi, /onPointerDown/);
  assert.match(networkUi, /onPointerMove/);
  assert.match(networkUi, /onWheel/);
  assert.match(networkCss, /\.relationship-map-canvas/);
  assert.match(networkCss, /min-width:720px/);
  assert.match(networkCss, /@media\(max-width:640px\)/);
  assert.match(tabsCss, /min-height:44px/);
});

test('normal member UI does not advertise hidden downstream reward economics', () => {
  const userFacingSource = `${networkUi}\n${inviteUi}\n${profileIdentityUi}`;
  assert.doesNotMatch(userFacingSource, /Downstream network rewards/i);
  assert.doesNotMatch(userFacingSource, /Network Reward Pool/i);
  assert.doesNotMatch(userFacingSource, /Gen\s*[2-7].*(?:%|percent)/i);
  assert.doesNotMatch(userFacingSource, /earn(?:ing|s)?\s+(?:from|through)\s+(?:your\s+)?network/i);
});
