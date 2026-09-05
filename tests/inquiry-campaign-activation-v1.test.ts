import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0022_collaboration_inquiry_activations.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../src/db/collaborationInquirySchema.ts', import.meta.url), 'utf8');
const inquiries = readFileSync(new URL('../src/routes/collaborationInquiries.ts', import.meta.url), 'utf8');
const activities = readFileSync(new URL('../src/routes/activities.ts', import.meta.url), 'utf8');
const inbox = readFileSync(new URL('../frontend/src/InboxExperience.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/collaboration-inquiry.css', import.meta.url), 'utf8');

test('inquiry activation has one-to-one versioned provenance and runtime safety', () => {
  assert.equal(migration.includes('CREATE TABLE IF NOT EXISTS collaboration_inquiry_activations'), true);
  assert.match(migration, /inquiry_id TEXT PRIMARY KEY NOT NULL REFERENCES collaboration_inquiries\(id\)/);
  assert.match(migration, /activity_id TEXT NOT NULL UNIQUE REFERENCES campaign_activities\(id\)/);
  assert.equal(schema.includes('CREATE TABLE IF NOT EXISTS collaboration_inquiry_activations'), true);
  assert.equal(schema.includes('idx_collaboration_inquiry_activations_project'), true);
});

test('accepted inquiry remains discussion-only until explicit record_activation', () => {
  const acceptance = inquiries.slice(inquiries.indexOf("if (body.action === 'review_inquiry')"), inquiries.indexOf("if (body.action === 'record_activation')"));
  assert.equal(acceptance.includes("body.decision === 'accepted'"), true);
  assert.equal(acceptance.includes('markShortlistInDiscussion'), true);
  assert.equal(acceptance.includes('collaboration_inquiry_activations'), false);
  assert.equal(acceptance.includes('campaign_activity_linkary_assignments'), false);
  assert.equal(acceptance.includes('tracked_links'), false);
  assert.equal(acceptance.includes('conversion_events'), false);
});

test('activation requires accepted inquiry and Project write authority', () => {
  const activation = inquiries.slice(inquiries.indexOf("if (body.action === 'record_activation')"), inquiries.indexOf("if (body.action === 'withdraw_inquiry')"));
  assert.equal(activation.includes('requireOperationalProjectAccess(db, userId, inquiry.organization_id, true)'), true);
  assert.equal(activation.includes("inquiry.status !== 'accepted'"), true);
  assert.equal(activation.includes("'inquiry_not_accepted'"), true);
  assert.equal(activation.includes("'inquiry_already_activated'"), true);
  assert.equal(activation.includes("'activity_already_activated'"), true);
});

test('activation validates exact Creator or exact Community provenance already assigned to activity', () => {
  const activation = inquiries.slice(inquiries.indexOf("if (body.action === 'record_activation')"), inquiries.indexOf("if (body.action === 'withdraw_inquiry')"));
  assert.equal(activation.includes('campaign_activity_linkary_assignments'), true);
  assert.equal(activation.includes("activity.assignment_kind === 'creator'"), true);
  assert.equal(activation.includes('activity.creator_profile_id === inquiry.target_profile_id'), true);
  assert.equal(activation.includes("activity.assignment_kind === 'community'"), true);
  assert.equal(activation.includes('activity.partner_manager_id === inquiry.partner_manager_id'), true);
  assert.equal(activation.includes('activity.partner_asset_id === inquiry.partner_asset_id'), true);
  assert.equal(activation.includes("'activation_partner_mismatch'"), true);
});

test('general Community inquiry still needs one exact Community assignment before activation', () => {
  const activation = inquiries.slice(inquiries.indexOf("if (body.action === 'record_activation')"), inquiries.indexOf("if (body.action === 'withdraw_inquiry')"));
  assert.equal(activation.includes('Boolean(activity.partner_asset_id)'), true);
  assert.equal(activation.includes('!inquiry.partner_asset_id || activity.partner_asset_id === inquiry.partner_asset_id'), true);
  assert.equal(inbox.includes('Choose the exact Telegram Community before activating this collaboration.'), true);
  assert.equal(inbox.includes('The exact Community, not only its manager, will own the campaign evidence.'), true);
});

test('activation marker never manufactures tracking outcomes value or verification', () => {
  const activation = inquiries.slice(inquiries.indexOf("if (body.action === 'record_activation')"), inquiries.indexOf("if (body.action === 'withdraw_inquiry')"));
  assert.equal(activation.includes('INSERT INTO tracked_links'), false);
  assert.equal(activation.includes('tracked_link_clicks'), false);
  assert.equal(activation.includes('INSERT INTO conversion_events'), false);
  assert.equal(activation.includes('attribution_confidence'), false);
  assert.equal(activation.includes('SET verification_status ='), false);
  assert.equal(activation.includes('attributed_value'), false);
  assert.match(activation, /INSERT OR IGNORE INTO collaboration_inquiry_activations[\s\S]*SELECT ci\.id, a\.id/);
});

test('existing campaign activity endpoint remains the exact assignment authority', () => {
  assert.equal(activities.includes("kind?: 'creator' | 'community'"), true);
  assert.equal(activities.includes('creatorProfileId'), true);
  assert.equal(activities.includes('partnerManagerId'), true);
  assert.equal(activities.includes('partnerAssetId'), true);
  assert.equal(activities.includes("asset_type = 'telegram_community'"), true);
  assert.equal(activities.includes('ownership_verified_at IS NOT NULL'), true);
  assert.equal(activities.includes('campaign_activity_linkary_assignments'), true);
});

test('outgoing inquiry list exposes activation state without mutating inquiry status', () => {
  assert.equal(inquiries.includes('activated_activity_id'), true);
  assert.equal(inquiries.includes('activated_activity_title'), true);
  assert.equal(inquiries.includes('activated_campaign_id'), true);
  assert.equal(inquiries.includes('activated_campaign_name'), true);
  assert.equal(inquiries.includes('ia.activated_at'), true);
});

test('Inbox explicitly activates accepted inquiry through campaign activity then provenance marker', () => {
  assert.equal(inbox.includes('Activate in campaign'), true);
  assert.equal(inbox.includes('Create new activity'), true);
  assert.equal(inbox.includes('Use existing activity'), true);
  assert.equal(inbox.includes("api('/api/campaign-activities'"), true);
  assert.equal(inbox.includes("action: 'record_activation'"), true);
  assert.equal(inbox.indexOf("api('/api/campaign-activities'") < inbox.indexOf("action: 'record_activation'"), true);
  assert.equal(inbox.includes('This step assigns the accepted partner to campaign activity. Campaign proof still appears only after tracked or verified evidence exists.'), true);
  assert.equal(inbox.includes('No tracking links or outcomes are created automatically.'), true);
  assert.equal(inbox.includes('Open Evidence'), true);
});

test('activation UI is responsive and mobile safe', () => {
  assert.match(css, /inquiry-activation-modal\{[^}]*max-height:calc\(100dvh - 32px\)[^}]*overflow-y:auto/s);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /@media\(max-width:320px\)/);
  assert.equal(css.includes('min-height:44px'), true);
  assert.equal(css.includes('overflow-wrap:anywhere'), true);
});
