import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const panel = read('../frontend/src/OnchainAttributionPanel.tsx');
const tracking = read('../frontend/src/TrackingExperience.tsx');
const styles = read('../frontend/src/onchain-attribution.css');
const main = read('../frontend/src/main.tsx');

test('campaign evidence workspace exposes on-chain attribution without expanding global navigation', () => {
  assert.match(tracking, /On-chain attribution/);
  assert.match(tracking, /<OnchainAttributionPanel/);
  assert.match(tracking, /campaignId=\{campaignId\}/);
  assert.doesNotMatch(read('../frontend/src/ProductWorkspace.tsx'), /On-chain Attribution/);
});

test('wallet form uses exactly the five production attribution chains', () => {
  for (const entry of [
    "{ value: 'ethereum', label: 'Ethereum' }",
    "{ value: 'base', label: 'Base' }",
    "{ value: 'bnb', label: 'BNB Chain' }",
    "{ value: 'solana', label: 'Solana' }",
    "{ value: 'robinhood', label: 'Robinhood Chain' }",
  ]) assert.match(panel, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(panel, /value: 'polygon'/);
  assert.match(panel, /form\.chain === 'solana' \? 'Solana public key' : '0x…'/);
  assert.match(panel, /Address validation is enforced by the backend/);
});

test('watched-wallet workflow reuses create, retry and disable APIs', () => {
  assert.match(panel, /\/api\/onchain\/watch-targets\?campaignId=/);
  assert.match(panel, /await api\('\/api\/onchain\/watch-targets'/);
  assert.match(panel, /retry \? \{/);
  assert.match(panel, /Retry sync/);
  assert.match(panel, /\/api\/onchain\/watch-targets\/\$\{encodeURIComponent\(target\.id\)\}\/disable/);
  assert.match(panel, /Stop monitoring this wallet\? Historical evidence will remain preserved\./);
});

test('provider states and safe errors are visible without exposing credentials', () => {
  for (const text of ['Monitoring', 'Configuration pending', 'Syncing', 'Sync error', 'Disabled', 'View sync error']) {
    assert.match(panel, new RegExp(text));
  }
  for (const code of ['alchemy_not_configured', 'alchemy_sync_failed', 'invalid_wallet_address', 'unsupported_chain', 'invalid_activity_context', 'invalid_tracking_context', 'event_reorged', 'event_already_confirmed']) {
    assert.match(panel, new RegExp(code));
  }
  assert.doesNotMatch(panel, /ALCHEMY_(?:API_KEY|NOTIFY_AUTH_TOKEN|WEBHOOK_SIGNING_KEY)/);
});

test('evidence inbox supports every bounded backend review filter and explicit refresh', () => {
  for (const status of ['pending', 'confirmed', 'ignored', 'reorged', 'all']) {
    assert.match(panel, new RegExp(`value: '${status}'`));
  }
  assert.match(panel, /useState<EvidenceFilter>\('pending'\)/);
  assert.match(panel, /\/api\/onchain\/events\?\$\{eventQuery\.toString\(\)\}/);
  assert.match(panel, />Refresh</);
  assert.doesNotMatch(panel, /setInterval|setTimeout/);
});

test('evidence cards show normalized campaign context instead of raw provider JSON', () => {
  for (const label of ['Asset / value', 'Transaction', 'Block / slot', 'Occurred', 'Activity', 'Tracking link']) {
    assert.match(panel, new RegExp(label.replace('/', '\\/')));
  }
  assert.match(panel, /item\.from_address/);
  assert.match(panel, /item\.to_address/);
  assert.match(panel, /item\.direction/);
  assert.doesNotMatch(panel, /raw_payload_json|reorg_payload_json/);
});

test('human review remains required and reorged evidence cannot render confirmation actions', () => {
  assert.match(panel, /item\.review_status === 'pending'.*Confirm as outcome/);
  assert.match(panel, /reviewing && writable && reviewing\.review_status === 'pending'/);
  assert.match(panel, /\/api\/onchain\/events\/\$\{encodeURIComponent\(reviewing\.id\)\}\/confirm/);
  assert.match(panel, /\/api\/onchain\/events\/\$\{encodeURIComponent\(item\.id\)\}\/ignore/);
  assert.match(panel, /Reorged — no longer valid on-chain/);
  assert.match(panel, /linked Provider Verified outcome was revoked automatically/);
});

test('confirmed evidence is reflected through the existing provider-verified Outcome Ledger', () => {
  assert.match(panel, /A Provider Verified outcome now appears in the Outcome Ledger/);
  assert.match(panel, /onOutcomeConfirmed/);
  assert.match(tracking, /<option value="provider_verified">Provider verified<\/option>/);
  assert.match(tracking, /confidence-\$\{outcome\.attribution_confidence\}/);
  assert.match(tracking, /\{human\(outcome\.source\)\}/);
});

test('Project roles keep mutation controls operator-only', () => {
  assert.match(tracking, /\['owner', 'admin', 'marketing_manager'\]\.includes\(project\.role\)/);
  assert.match(tracking, /writable=\{writable\(project\)\}/);
  assert.match(panel, /writable && <button[^>]*onClick=\{\(\) => setShowAdd\(true\)\}>\+ Add wallet/);
  assert.match(panel, /writable && item\.review_status === 'pending'/);
  assert.match(panel, /showAdd && writable/);
  assert.match(panel, /reviewing && writable/);
});

test('on-chain workspace has explicit narrow-phone behavior and practical controls', () => {
  assert.match(main, /import '\.\/onchain-attribution\.css'/);
  assert.match(styles, /@media\(max-width:760px\)/);
  assert.match(styles, /@media\(max-width:430px\)/);
  assert.match(styles, /min-height:44px/);
  assert.match(styles, /grid-template-columns:1fr/);
  assert.match(styles, /overflow-wrap:anywhere/);
});
