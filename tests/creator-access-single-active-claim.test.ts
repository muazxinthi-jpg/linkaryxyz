import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../src/routes/creatorAccess.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0028_creator_access_single_active_claim.sql', import.meta.url), 'utf8');
const start = route.slice(route.indexOf('export async function startCreatorAccessClaim'), route.indexOf('export async function creatorAccessClaimStatus'));
const submit = route.slice(route.indexOf('export async function submitCreatorAccessPost'), route.indexOf('export async function listCreatorAccessClaims'));

test('0028 resolves duplicate unexpired active Creator claims before installing guards', () => {
  assert.equal(migration.includes('ROW_NUMBER() OVER'), true);
  assert.match(migration, /CASE status\s+WHEN 'approved' THEN 0\s+WHEN 'submitted' THEN 1/);
  assert.match(migration, /UPDATE creator_access_claims\s+SET status = 'revoked'/);
  assert.match(migration, /UPDATE invites\s+SET status = 'revoked'/);
  assert.equal(migration.includes("WHERE status = 'active'"), true);
});

test('0028 prevents a second unexpired active claim on both insert and update', () => {
  assert.equal(migration.includes('trg_creator_access_single_active_before_insert'), true);
  assert.equal(migration.includes('trg_creator_access_single_active_before_update'), true);
  assert.equal(migration.includes("NEW.status IN ('draft', 'submitted', 'approved')"), true);
  assert.equal(migration.includes("existing.status IN ('draft', 'submitted', 'approved')"), true);
  assert.equal(migration.includes("RAISE(ABORT, 'creator_access_active_claim_exists')"), true);
  assert.equal(migration.includes('existing.id != OLD.id'), true);
});

test('start Creator Earn Access still resumes a valid existing active claim first', () => {
  const existingRead = start.indexOf('activeClaimForIdentity');
  const insert = start.indexOf('INSERT INTO creator_access_claims');
  assert.ok(existingRead > 0);
  assert.ok(insert > existingRead);
  assert.equal(start.includes('return json(await resumableClaimPayload(env, existing));'), true);
});

test('concurrent start loser recovers the authoritative winning claim instead of surfacing a database error', () => {
  assert.equal(start.includes('isActiveClaimGuardError(error)'), true);
  assert.equal(start.includes('const winner = await activeClaimForIdentity'), true);
  assert.equal(start.includes('return json(await resumableClaimPayload(env, winner));'), true);
  assert.equal(start.includes("'claim_start_conflict'"), true);
});

test('resumed claim token is derived and verified against the authoritative stored claim', () => {
  const helper = route.slice(route.indexOf('async function resumableClaimPayload'), route.indexOf('export async function startCreatorAccessClaim'));
  assert.equal(helper.includes('deriveClaimToken(env, row.id)'), true);
  assert.equal(helper.includes('sha256(claimToken)'), true);
  assert.equal(helper.includes('row.claim_token_hash'), true);
  assert.equal(helper.includes("'claim_token_mismatch'"), true);
});

test('revoked duplicate tokens recover through the existing expired-claim restart path', () => {
  const tokenLookup = route.slice(route.indexOf('async function claimFromToken'), route.indexOf('async function claimById'));
  assert.equal(tokenLookup.includes("row.status === 'revoked'"), true);
  assert.equal(tokenLookup.includes("'claim_expired'"), true);
});

test('resubmitting an older claim cannot bypass the database active-claim guard', () => {
  assert.equal(submit.includes('isActiveClaimGuardError(error)'), true);
  assert.equal(submit.includes('Another Creator Earn Access claim is already active.'), true);
  assert.equal(submit.includes('ACTIVE_CLAIM_GUARD'), true);
});

test('single-active-claim hardening preserves the seven-day manual review model', () => {
  assert.equal(route.includes('CLAIM_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000'), true);
  assert.equal(route.includes("'draft', 'submitted', 'approved'"), true);
  assert.equal(route.includes("review_mode = 'manual'"), true);
  assert.equal(route.includes('Automated verification is not configured yet. Manual review remains active.'), true);
});
