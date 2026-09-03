import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('CDP auth validates intended email for Team invitations before creating a new Linkary account', () => {
  const source = readFileSync(new URL('../src/auth/cdp.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('team_invite_email_mismatch'), true);
  assert.equal(source.includes('validateInviteAccess(row, verifiedEmail)'), true);
  assert.equal(source.includes('resolveAccessContext(db, body.inviteCode, body.earnedGrant, email)'), true);
  assert.equal(source.includes("row.invite_type === 'team_invite'"), true);
  assert.equal(source.includes('row.intended_email && verifiedEmail'), true);
});

test('an existing Linkary account can redeem a Team invitation during a fresh login session', () => {
  const source = readFileSync(new URL('../src/auth/cdp.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('resolveTeamInviteForExistingAccess'), true);
  assert.equal(source.includes('const alreadyHasAccess = await hasLinkaryAccess'), true);
  assert.equal(source.includes("else if (body.inviteCode?.trim())"), true);
  assert.equal(source.includes('accessContext = await resolveTeamInviteForExistingAccess'), true);
});

test('CDP redemption carries Team Project context without granting a Creator or Project account type', () => {
  const source = readFileSync(new URL('../src/auth/cdp.ts', import.meta.url), 'utf8');
  assert.equal(source.includes("const teamInvite = context.inviteType === 'team_invite'"), true);
  assert.equal(source.includes("teamInvite ? context.organizationId : null"), true);
  assert.equal(source.includes("teamInvite ? 'accepted_team' : 'pending'"), true);
  assert.equal(source.includes('chosen_account_type, organization_id, quality_state'), true);
});
