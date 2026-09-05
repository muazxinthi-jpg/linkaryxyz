import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const projectAccess = readFileSync(new URL('../src/routes/projectAccess.ts', import.meta.url), 'utf8');
const inviteIntegrity = readFileSync(new URL('../src/routes/inviteIntegrity.ts', import.meta.url), 'utf8');
const cdp = readFileSync(new URL('../src/auth/cdp.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');

test('add-member and access-request upserts cannot overwrite Project ownership', () => {
  assert.match(projectAccess, /existing\?\.role === 'owner'.*owner_protected/s);
  assert.match(projectAccess, /ON CONFLICT\(user_id, organization_id\) DO UPDATE SET[\s\S]*WHERE organization_memberships\.role != 'owner'/);
  assert.match(projectAccess, /UPDATE organization_memberships SET role = \?, updated_at = \? WHERE user_id = \? AND organization_id = \? AND role != 'owner'/);
  assert.match(projectAccess, /UPDATE organization_memberships SET status = 'removed'.*AND role != 'owner'/s);
});

test('email-bound Team invites require a present matching verified email in both auth paths', () => {
  assert.match(cdp, /if \(row\.intended_email\) \{[\s\S]*const currentEmail = verifiedEmail\?\.trim\(\)\.toLowerCase\(\) \|\| ''[\s\S]*if \(!currentEmail \|\| expectedEmail !== currentEmail\)/);
  assert.match(inviteIntegrity, /if \(invite\.intended_email\) \{[\s\S]*const currentEmail = auth\.user\.email\?\.trim\(\)\.toLowerCase\(\) \|\| ''[\s\S]*if \(!currentEmail \|\| currentEmail !== expectedEmail\)/);
  assert.equal(inviteIntegrity.includes('team_invite_email_mismatch'), true);
});

test('network invite creation is coupled to an available credit in the same D1 batch', () => {
  assert.match(inviteIntegrity, /INSERT INTO invites[\s\S]*FROM invite_balances[\s\S]*privileges_status = 'active' AND available_credits > 0/);
  assert.match(inviteIntegrity, /UPDATE invite_balances[\s\S]*available_credits = available_credits - 1[\s\S]*EXISTS \(SELECT 1 FROM invites WHERE id = \?\)/);
  assert.match(inviteIntegrity, /INSERT INTO invite_ledger[\s\S]*'network_invite_created'[\s\S]*EXISTS \(SELECT 1 FROM invites WHERE id = \?\)/);
  assert.match(inviteIntegrity, /if \(!created \|\| !ledger\)/);
});

test('network invite refund is idempotent and only credits the balance when this request created the refund ledger', () => {
  assert.match(inviteIntegrity, /NOT EXISTS \([\s\S]*related_invite_id = \? AND transaction_type = 'refund'/);
  assert.match(inviteIntegrity, /UPDATE invite_balances SET available_credits = available_credits \+ 1[\s\S]*EXISTS \(SELECT 1 FROM invite_ledger WHERE id = \? AND transaction_type = 'refund'\)/);
  assert.equal(inviteIntegrity.includes('alreadyRevoked: true'), true);
});

test('production Worker routes invite writes through the integrity gateway', () => {
  assert.equal(worker.includes("import { createNetworkInviteIntegrity } from './routes/inviteIntegrity';"), true);
  assert.match(worker, /url\.pathname === '\/api\/invites'[\s\S]*createNetworkInviteIntegrity\(request, env\)/);
});
