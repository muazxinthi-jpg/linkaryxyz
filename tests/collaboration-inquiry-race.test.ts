import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const source = readFileSync(new URL('../src/routes/collaborationInquiries.ts', import.meta.url), 'utf8');

function section(start: string, end?: string) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing section: ${start}`);
  const to = end ? source.indexOf(end, from + start.length) : source.length;
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

test('concurrent inquiry sends resolve to one authoritative pending row', () => {
  const send = section("if (body.action === 'send_inquiry')", "if (body.action === 'review_inquiry')");
  assert.match(send, /INSERT INTO collaboration_inquiries[\s\S]*SELECT \?, \?, \?, \?, \?/);
  assert.match(send, /actor\.status = 'active'/);
  assert.match(send, /actor\.role IN \('owner','admin','marketing_manager'\)/);
  assert.match(send, /project\.status = 'active' AND project\.verification_status = 'verified_x'/);
  assert.match(send, /NOT EXISTS \([\s\S]*existing_inquiry\.status = 'pending'[\s\S]*COALESCE\(existing_inquiry\.partner_manager_id, ''\) = COALESCE\(\?, ''\)/);
  assert.equal(send.includes('const authoritative = await currentPendingInquiry'), true);
  assert.equal(send.includes('duplicate: !createdByThisRequest'), true);
  assert.equal(send.includes('createdByThisRequest ? 201 : 200'), true);
});

test('send inquiry rechecks exact target campaign and Community state at execution time', () => {
  const send = section("if (body.action === 'send_inquiry')", "if (body.action === 'review_inquiry')");
  assert.match(send, /target\.profile_type = 'creator' AND target\.visibility = 'published'/);
  assert.match(send, /manager\.manager_type = 'community_manager' AND manager\.visibility = 'public'/);
  assert.match(send, /asset\.asset_type = 'telegram_community'/);
  assert.match(send, /campaign\.id = \? AND campaign\.organization_id = \?/);
  assert.match(send, /target\.owner_user_id IS NOT NULL AND target\.owner_user_id != \?/);
});

test('Accept and Decline cannot overwrite another completed review', () => {
  const review = section("if (body.action === 'review_inquiry')", "if (body.action === 'record_activation')");
  assert.match(review, /UPDATE collaboration_inquiries[\s\S]*WHERE id = \? AND status = 'pending'/);
  assert.match(review, /target\.id = collaboration_inquiries\.target_profile_id AND target\.owner_user_id = \?/);
  assert.equal(review.includes('current.responded_at !== timestamp'), true);
  assert.equal(review.includes('current.updated_at !== timestamp'), true);
  assert.equal(review.includes("'inquiry_already_reviewed'"), true);
  const mark = review.indexOf('markShortlistInDiscussion');
  const finalCheck = review.indexOf('current.status !== body.decision');
  assert.ok(mark > finalCheck, 'shortlist side effect must happen only after exact winning review is confirmed');
});

test('withdraw requires pending state and current verified Project write authority in the mutation', () => {
  const withdraw = section("if (body.action === 'withdraw_inquiry')");
  assert.match(withdraw, /WHERE id = \? AND status = 'pending'/);
  assert.match(withdraw, /project\.status = 'active' AND project\.verification_status = 'verified_x'/);
  assert.match(withdraw, /actor\.user_id = \? AND actor\.status = 'active'/);
  assert.match(withdraw, /actor\.role IN \('owner','admin','marketing_manager'\)/);
  assert.equal(withdraw.includes("current?.status !== 'withdrawn' || current.updated_at !== timestamp"), true);
  assert.equal(withdraw.includes('await requireOperationalProjectAccess(db, userId, inquiry.organization_id, true)'), true);
});

test('activation insert rechecks accepted inquiry Project authority campaign and exact assignment', () => {
  const activation = section("if (body.action === 'record_activation')", "if (body.action === 'withdraw_inquiry')");
  assert.match(activation, /INSERT OR IGNORE INTO collaboration_inquiry_activations[\s\S]*SELECT ci\.id, a\.id/);
  assert.match(activation, /ci\.status = 'accepted'/);
  assert.match(activation, /c\.organization_id = ci\.organization_id/);
  assert.match(activation, /ci\.campaign_id IS NULL OR ci\.campaign_id = a\.campaign_id/);
  assert.match(activation, /actor\.status = 'active'/);
  assert.match(activation, /actor\.role IN \('owner','admin','marketing_manager'\)/);
  assert.match(activation, /ci\.target_kind = 'creator'[\s\S]*la\.creator_profile_id = ci\.target_profile_id/);
  assert.match(activation, /ci\.target_kind = 'community_manager'[\s\S]*la\.partner_manager_id = ci\.partner_manager_id[\s\S]*la\.partner_asset_id IS NOT NULL/);
  assert.match(activation, /ci\.partner_asset_id IS NULL OR la\.partner_asset_id = ci\.partner_asset_id/);
});

test('activation loser resolves unique-key and stale-state conflicts explicitly', () => {
  const activation = section("if (body.action === 'record_activation')", "if (body.action === 'withdraw_inquiry')");
  assert.equal(activation.includes("WHERE inquiry_id = ?"), true);
  assert.equal(activation.includes("WHERE activity_id = ?"), true);
  assert.equal(activation.includes("'inquiry_already_activated'"), true);
  assert.equal(activation.includes("'activity_already_activated'"), true);
  assert.equal(activation.includes("'activation_partner_mismatch'"), true);
  assert.equal(activation.includes("'inquiry_activation_conflict'"), true);
  assert.equal(activation.includes('createdByThisRequest ? 201 : 200'), true);
});

test('Collaboration Inquiry race repair adds no migration after 0028', () => {
  const migrations = readdirSync(new URL('../migrations/', import.meta.url));
  assert.equal(migrations.some((name) => name.startsWith('0029_')), false);
});
