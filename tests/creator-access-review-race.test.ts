import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/routes/creatorAccess.ts', import.meta.url), 'utf8');
const submit = source.slice(source.indexOf('export async function submitCreatorAccessPost'), source.indexOf('export async function listCreatorAccessClaims'));
const approve = source.slice(source.indexOf('export async function approveCreatorAccessClaim'), source.indexOf('export async function rejectCreatorAccessClaim'));
const reject = source.slice(source.indexOf('export async function rejectCreatorAccessClaim'), source.indexOf('export async function creatorAccessVerificationSetting'));

test('Creator claim submission only wins from draft or rejected state and re-reads authoritative state', () => {
  assert.equal(submit.includes("WHERE id = ? AND status IN ('draft', 'rejected')"), true);
  assert.equal(submit.includes('const updated = await claimFromToken(db, token);'), true);
  assert.equal(submit.includes("updated.status === 'submitted' && updated.submitted_x_url === postUrl"), true);
  assert.equal(submit.includes("'claim_submission_conflict'"), true);
});

test('Creator claim submission preserves duplicate X-post fail-closed behavior', () => {
  assert.equal((submit.match(/submitted_x_url = \? AND id <> \?/g) || []).length >= 2, true);
  assert.equal(submit.includes("'x_post_already_used'"), true);
});

test('approval invite is created only while the claim is still reviewable', () => {
  assert.equal(approve.includes('INSERT INTO invites'), true);
  assert.equal(approve.includes("WHERE id = ? AND status = 'submitted' AND submitted_x_url IS NOT NULL AND expires_at > ?"), true);
  assert.equal(approve.includes('SELECT ?, ?, NULL'), true);
});

test('approval transition requires the exact invite created for that transition', () => {
  assert.equal(approve.includes("SET approved_invite_id = ?, status = 'approved'"), true);
  assert.equal(approve.includes("AND EXISTS (SELECT 1 FROM invites WHERE id = ? AND code_hash = ?)"), true);
  assert.equal(approve.includes("status = 'submitted'"), true);
});

test('approval audit is conditional on the exact successful approved state', () => {
  assert.equal(approve.includes("'creator_access.approved'"), true);
  assert.equal(approve.includes("status = 'approved' AND approved_invite_id = ? AND reviewed_by_user_id = ? AND reviewed_at = ?"), true);
  assert.equal(approve.includes('const finalClaim = await claimById(db, claim.id);'), true);
  assert.equal(approve.includes("'claim_review_conflict'"), true);
});

test('repeated approved review is idempotent and does not create another invite', () => {
  const idempotentIndex = approve.indexOf("claim.status === 'approved' && claim.approved_invite_id");
  const inviteInsertIndex = approve.indexOf('INSERT INTO invites');
  assert.ok(idempotentIndex > 0);
  assert.ok(inviteInsertIndex > idempotentIndex);
  assert.equal(approve.includes('idempotent: true'), true);
});

test('rejection audit is conditional on the exact successful rejected state', () => {
  assert.equal(reject.includes("WHERE id = ? AND status = 'submitted'"), true);
  assert.equal(reject.includes("'creator_access.rejected'"), true);
  assert.equal(reject.includes("status = 'rejected' AND rejection_reason = ? AND reviewed_by_user_id = ? AND reviewed_at = ?"), true);
  assert.equal(reject.includes('const finalClaim = await claimById(db, claim.id);'), true);
  assert.equal(reject.includes("'claim_review_conflict'"), true);
});

test('Creator review race repair stays migration-free and manual-review-only', () => {
  assert.equal(source.includes("CLAIM_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000"), true);
  assert.equal(source.includes("review_mode = 'manual'"), true);
  assert.equal(source.includes("Automated verification is not configured yet. Manual review remains active."), true);
});
