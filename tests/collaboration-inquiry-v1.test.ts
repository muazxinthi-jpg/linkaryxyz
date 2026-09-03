import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0021_collaboration_inquiries.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../src/db/collaborationInquirySchema.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/routes/collaborationInquiries.ts', import.meta.url), 'utf8');
const shortlists = readFileSync(new URL('../src/routes/shortlists.ts', import.meta.url), 'utf8');
const discovery = readFileSync(new URL('../frontend/src/PartnerDiscoveryExperience.tsx', import.meta.url), 'utf8');
const inbox = readFileSync(new URL('../frontend/src/InboxExperience.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/collaboration-inquiry.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');

test('Collaboration Inquiry V1 has a controlled versioned schema and runtime safety guard', () => {
  assert.equal(migration.includes('CREATE TABLE IF NOT EXISTS collaboration_inquiries'), true);
  assert.equal(migration.includes("target_kind IN ('creator','community_manager')"), true);
  assert.equal(migration.includes("status IN ('pending','accepted','declined','withdrawn','closed')"), true);
  assert.equal(migration.includes("'content_collaboration','telegram_promotion','community_activation','x_campaign','ambassador','partnership','other'"), true);
  assert.equal(schema.includes('CREATE TABLE IF NOT EXISTS collaboration_inquiries'), true);
  assert.equal(schema.includes('Production D1 migrations are deliberately controlled'), true);
});

test('Project inquiry sending is permissioned and preserves exact Linkary partner provenance', () => {
  assert.equal(route.includes('requireOperationalProjectAccess(db, userId, body.organizationId, true)'), true);
  assert.equal(route.includes("profile_type = 'creator' AND visibility = 'published'"), true);
  assert.equal(route.includes("m.manager_type = 'community_manager'"), true);
  assert.equal(route.includes("asset_type = 'telegram_community'"), true);
  assert.equal(route.includes('partner_asset_id'), true);
  assert.equal(route.includes('campaign_id'), true);
  assert.equal(route.includes('budget_usd'), true);
  assert.equal(route.includes('deliverables'), true);
});

test('pending duplicate inquiries are blocked and acceptance itself remains discussion-only', () => {
  assert.equal(route.includes("status = 'pending'"), true);
  assert.equal(route.includes("'inquiry_already_pending'"), true);
  assert.equal(route.includes("SET status = 'negotiating'"), true);
  const acceptance = route.slice(route.indexOf("if (body.action === 'review_inquiry')"), route.indexOf("if (body.action === 'record_activation')"));
  assert.equal(acceptance.includes('markShortlistInDiscussion'), true);
  assert.equal(acceptance.includes("SET status = 'active'"), false);
  assert.equal(acceptance.includes('conversion_events'), false);
  assert.equal(acceptance.includes('campaign_activity_linkary_assignments'), false);
  assert.equal(acceptance.includes('attribution_confidence'), false);
  assert.equal(acceptance.includes("verification_status = 'verified'"), false);
});

test('existing shortlist endpoint carries inquiry lifecycle without adding a parallel API surface', () => {
  assert.equal(shortlists.includes("url.searchParams.get('inquiries')"), true);
  assert.equal(shortlists.includes('listCollaborationInquiries'), true);
  assert.equal(shortlists.includes('handleCollaborationInquiryMutation'), true);
  assert.equal(shortlists.includes('if (body.action)'), true);
});

test('Partner Discovery sends focused typed inquiries with optional campaign budget deliverables and exact Community', () => {
  assert.equal(discovery.includes('Start inquiry'), true);
  assert.equal(discovery.includes("action: 'send_inquiry'"), true);
  assert.equal(discovery.includes('Exact Telegram Community (optional)'), true);
  assert.equal(discovery.includes('Related campaign (optional)'), true);
  assert.equal(discovery.includes('Budget (optional, USD)'), true);
  assert.equal(discovery.includes('Deliverables or expectations (optional)'), true);
  assert.equal(discovery.includes('Inquiry only.'), true);
  assert.equal(discovery.includes('does not create campaign evidence'), true);
});

test('Inbox remains an action center and adds collaboration Accept Decline and sent status', () => {
  assert.equal(inbox.includes("kind: 'collaboration_inquiry'"), true);
  assert.equal(inbox.includes("action: 'review_inquiry'"), true);
  assert.equal(inbox.includes("action: 'withdraw_inquiry'"), true);
  assert.equal(inbox.includes('COLLABORATION INQUIRY'), true);
  assert.equal(inbox.includes('Collaboration inquiries you sent'), true);
  assert.equal(inbox.includes('noisy chat feed'), true);
  assert.equal(inbox.includes('Accepted means the partner is open to discussion.'), true);
  assert.equal(inbox.includes('proof still requires tracked or verified evidence'), true);
});

test('Collaboration Inquiry V1 meets the required mobile acceptance protections', () => {
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /@media\(max-width:320px\)/);
  assert.match(css, /min-height:44px/);
  assert.equal(css.includes('overflow-wrap:anywhere'), true);
  assert.equal(main.trim().includes("import './collaboration-inquiry.css';"), true);
});
