import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync(new URL('../frontend/src/OnchainAttributionPanel.tsx', import.meta.url), 'utf8');

test('campaign wallet intelligence loads all provider evidence and only verified provider outcomes', () => {
  assert.match(panel, /\/api\/onchain\/events\?campaignId=/);
  assert.match(panel, /source=provider_verified&confidence=verified/);
  assert.match(panel, /setAllEvents\(allEventResult\.events\)/);
  assert.match(panel, /setVerifiedConversions\(conversionResult\.conversions\)/);
});

test('attributed wallets require confirmed linked evidence and exclude pending ignored and reorged events', () => {
  assert.match(panel, /item\.review_status === 'confirmed' && Boolean\(item\.linked_conversion_id\)/);
  assert.match(panel, /new Set\(confirmedEvents\.map\(walletIdentity\)\)/);
  assert.match(panel, /allEvents\.filter\(\(item\) => item\.review_status === 'pending'\)\.length/);
  assert.match(panel, /Pending, ignored and reorged evidence is excluded/);
});

test('wallet identity normalization preserves Solana case sensitivity while normalizing EVM addresses', () => {
  assert.match(panel, /event\.chain === 'solana' \? event\.watched_address : event\.watched_address\.toLowerCase\(\)/);
  assert.match(panel, /EVM addresses are normalized case-insensitively; Solana public keys remain case-sensitive/);
});

test('verified value and outcome mix are restricted to conversions linked from confirmed onchain evidence', () => {
  assert.match(panel, /const conversionIds = new Set\(confirmedEvents\.flatMap/);
  assert.match(panel, /verifiedConversions\.filter\(\(item\) => conversionIds\.has\(item\.id\)\)/);
  assert.match(panel, /verifiedValueUsd: confirmedConversions\.reduce/);
  assert.match(panel, /outcomes\.set\(item\.event_type/);
});

test('campaign workspace surfaces chain action and outcome intelligence without changing review semantics', () => {
  assert.match(panel, /CAMPAIGN WALLET INTELLIGENCE/);
  assert.match(panel, /ATTRIBUTED WALLETS/);
  assert.match(panel, /VERIFIED OUTCOMES/);
  assert.match(panel, /ATTRIBUTED VALUE/);
  assert.match(panel, /CHAIN MIX/);
  assert.match(panel, /ACTION MIX/);
  assert.match(panel, /OUTCOME MIX/);
  assert.match(panel, /Provider activity stays evidence until a Project operator explicitly confirms it/);
});