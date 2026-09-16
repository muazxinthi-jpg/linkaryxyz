import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/0057_invite_profile_rewards.sql', import.meta.url), 'utf8');
const rewards = readFileSync(new URL('../src/routes/inviteProfileRewards.ts', import.meta.url), 'utf8');
const profiles = readFileSync(new URL('../src/routes/profiles.ts', import.meta.url), 'utf8');
const invites = readFileSync(new URL('../frontend/src/InviteExperience.tsx', import.meta.url), 'utf8');

test('invite profile rewards are additive and idempotent', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS invite_reward_events/);
  assert.match(migration, /UNIQUE \(invite_id, qualified_user_id, generation\)/);
  assert.match(rewards, /direct_referral_published/);
  assert.match(rewards, /downline_referral_published/);
  assert.match(rewards, /depth BETWEEN 1 AND 7/);
  assert.match(rewards, /ON CONFLICT \(invite_id, qualified_user_id, generation\) DO NOTHING/);
  assert.match(profiles, /rewardReferralOnProfilePublish/);
});

test('invite UI explains direct and seven-generation credit rules', () => {
  assert.match(invites, /Earn 2 invite credits/);
  assert.match(invites, /Gen 2–7 referral/);
});
