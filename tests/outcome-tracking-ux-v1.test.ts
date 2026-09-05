import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const conversions = readFileSync(new URL('../src/routes/conversions.ts', import.meta.url), 'utf8');
const tracking = readFileSync(new URL('../frontend/src/TrackingExperience.tsx', import.meta.url), 'utf8');

const squash = (value: string) => value.replace(/\s+/g, '');
const route = squash(conversions);
const lowerRoute = route.toLowerCase();
const view = squash(tracking);

test('Outcome Tracking V1 exposes a consistent founder outcome taxonomy without removing custom outcomes', () => {
  for (const value of [
    'signup',
    'telegram_join',
    'retained_user',
    'wallet_connect',
    'lead',
    'purchase',
    'deposit',
    'subscription',
    'token_purchase',
    'custom',
  ]) {
    assert.equal(conversions.includes(`value: '${value}'`), true, value);
  }
  assert.equal(route.includes('outcomeTypes:OUTCOME_TYPE_CATALOG'), true);
});

test('Founder-entered outcomes remain manual evidence and cannot self-upgrade confidence', () => {
  assert.equal(route.includes("'manual','manual'"), true);
  assert.equal(route.includes("source:'manual',attributionConfidence:'manual'"), true);
  assert.equal(conversions.includes('body.source'), false);
  assert.equal(conversions.includes('body.attributionConfidence'), false);
  assert.equal(view.includes('<optionvalue="provider_verified">Providerverified</option>'), true);
});

test('manual outcome writes validate value, time and canonical outcome identifiers server-side', () => {
  assert.equal(conversions.includes('normalizeOutcomeType'), true);
  assert.equal(conversions.includes('normalizeValueUsd'), true);
  assert.equal(conversions.includes('normalizeOccurredAt'), true);
  assert.equal(conversions.includes("throw new HttpError(400, 'Attributed value must be zero or greater'"), true);
  assert.equal(conversions.includes("throw new HttpError(400, 'Outcome time cannot be in the future'"), true);
});

test('outcome reads expose the exact activity partner context instead of only the manager or campaign', () => {
  assert.equal(lowerRoute.includes('leftjoincampaign_activity_linkary_assignmentslaonla.activity_id=e.activity_id'), true);
  assert.equal(lowerRoute.includes('la.assignment_kindaspartner_kind'), true);
  assert.equal(lowerRoute.includes('la.partner_asset_id'), true);
  assert.equal(lowerRoute.includes('coalesce(cp.display_name,pa.name,ne.display_name)aspartner_display_name'), true);
  assert.equal(lowerRoute.includes('pm.display_nameaspartner_manager_name'), true);
});

test('Outcome CSV carries activity, tracking, evidence and exact partner context together', () => {
  for (const heading of ['Exact Partner Type', 'Exact Partner', 'Partner Handle', 'Community Manager', 'Source', 'Confidence']) {
    assert.equal(conversions.includes(`'${heading}'`), true, heading);
  }
});

test('Outcome Ledger keeps source and confidence filters explicit in the existing Evidence workspace', () => {
  assert.equal(view.includes('OutcomeLedger'), true);
  assert.equal(view.includes('Everyoutcomekeepsitsevidencesourceandconfidencelevel.'), true);
  assert.equal(view.includes('<optionvalue="manual">Manual</option>'), true);
  assert.equal(view.includes('<optionvalue="linkary_tracked">Linkarytracked</option>'), true);
  assert.equal(view.includes('<optionvalue="telegram_verified">Telegramverified</option>'), true);
  assert.equal(view.includes('<optionvalue="provider_verified">Providerverified</option>'), true);
});
