import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const memory = readFileSync(new URL('../src/partnerRelationshipMemory.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/routes/partnerRelationships.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const discovery = readFileSync(new URL('../frontend/src/PartnerDiscoveryExperience.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/partner-relationship-memory.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');

test('Relationship Memory derives canonical partner history from exact Linkary activity assignments', () => {
  assert.equal(memory.includes('campaign_activity_linkary_assignments'), true);
  assert.equal(memory.includes("la.assignment_kind = 'creator'"), true);
  assert.equal(memory.includes("la.assignment_kind = 'community'"), true);
  assert.equal(memory.includes('la.creator_profile_id'), true);
  assert.equal(memory.includes('la.partner_manager_id'), true);
  assert.equal(memory.includes('la.partner_asset_id'), true);
});

test('verified performance stays separate from manual conversion evidence', () => {
  assert.equal(memory.includes("ce.source IN ('linkary_tracked','telegram_verified','provider_verified')"), true);
  assert.equal(memory.includes("ce.source = 'manual'"), true);
  assert.equal(memory.includes('verified_outcomes'), true);
  assert.equal(memory.includes('attributed_value_usd'), true);
  assert.equal(memory.includes('manual_outcomes'), true);
  assert.equal(memory.includes('manual_value_usd'), true);
  assert.equal(memory.includes('Manual outcomes remain separate and visibly Manual.'), true);
});

test('relationship lifecycle does not promote cancelled work or accepted-only discussion into completed work', () => {
  assert.equal(memory.includes("a.status IN ('planned','live')"), true);
  assert.equal(memory.includes("a.status = 'completed'"), true);
  assert.equal(memory.includes("a.status != 'cancelled'"), true);
  assert.equal(memory.includes("ci.status = 'accepted' AND ia.inquiry_id IS NULL"), true);
  assert.equal(memory.includes("if (openAccepted > 0) return 'in_discussion'"), true);
  assert.equal(memory.includes("if (summary.active_activities > 0) return 'active'"), true);
  assert.equal(memory.includes("if (summary.completed_activities > 0) return 'worked_before'"), true);
  assert.equal(memory.includes("summary.completed_activities > 0 || summary.activated_inquiries > 0"), false);
});

test('relationship endpoint is Project-private and supports one batch summary request plus detail on demand', () => {
  assert.equal(route.includes('organizationMembership(db, auth.user.id, organizationId)'), true);
  assert.equal(route.includes("throw new HttpError(403, 'Project relationship access denied'"), true);
  assert.equal(route.includes('loadProjectRelationshipSummaries'), true);
  assert.equal(route.includes('loadProjectPartnerRelationship'), true);
  assert.equal(index.includes("if (path === '/api/partner-relationships')"), true);
});

test('Partner Discovery batches relationship summaries instead of requesting history once per card', () => {
  assert.equal(discovery.includes("/api/partner-relationships?organizationId=${encodeURIComponent(organizationId)}&kind=${encodeURIComponent(type)}"), true);
  assert.equal(discovery.includes('setRelationships(new Map(result.relationships.map'), true);
  assert.equal(discovery.includes('relationshipFor(partner)'), true);
  const cardLoop = discovery.slice(discovery.indexOf('partners.map((partner)'), discovery.indexOf('{message &&'));
  assert.equal(cardLoop.includes('/api/partner-relationships?'), false);
});

test('accepted and activated relationships become Work again instead of remaining permanently locked', () => {
  assert.equal(discovery.includes("const inquiryLocked = inquiry?.status === 'pending' || (inquiry?.status === 'accepted' && !inquiry.activated_activity_id)"), true);
  assert.equal(discovery.includes("workedBefore ? 'Work again'"), true);
  assert.equal(discovery.includes("inquiry?.status === 'accepted' && !inquiry.activated_activity_id ? 'Accepted'"), true);
  assert.equal(discovery.includes("inquiry?.activated_activity_id ? inquiry.partner_asset_id || '' : ''"), true);
});

test('relationship detail shows strong performance, Manual evidence, history and exact Communities without a score', () => {
  assert.equal(discovery.includes('PROJECT RELATIONSHIP MEMORY'), true);
  assert.equal(discovery.includes('TRACKED CLICKS'), true);
  assert.equal(discovery.includes('VERIFIED OUTCOMES'), true);
  assert.equal(discovery.includes('ATTRIBUTED VALUE'), true);
  assert.equal(discovery.includes('Manual evidence'), true);
  assert.equal(discovery.includes('EXACT COMMUNITIES USED'), true);
  assert.equal(discovery.includes('Recent exact activities'), true);
  assert.equal(discovery.includes('Recent inquiries'), true);
  assert.equal(discovery.toLowerCase().includes('reputation score'), false);
  assert.equal(discovery.toLowerCase().includes('partner score'), false);
});

test('Relationship Memory UI is responsive and mobile safe', () => {
  assert.match(css, /partner-relationship-modal\{[^}]*max-height:calc\(100dvh - 32px\)[^}]*overflow-y:auto/s);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /@media\(max-width:320px\)/);
  assert.equal(css.includes('min-height:44px'), true);
  assert.equal(css.includes('overflow-wrap:anywhere'), true);
  assert.equal(main.includes("import './partner-relationship-memory.css';"), true);
});
