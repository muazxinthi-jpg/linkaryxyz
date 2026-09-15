import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assessAlchemyAttributionConfiguration,
  REQUIRED_ALCHEMY_ATTRIBUTION_CONFIGURATION,
} from '../src/betaReadiness';

test('Alchemy attribution readiness fails closed when production provider configuration is absent', () => {
  const readiness = assessAlchemyAttributionConfiguration({} as any);

  assert.equal(readiness.ready, false);
  assert.equal(readiness.presentCount, 0);
  assert.equal(readiness.requiredCount, REQUIRED_ALCHEMY_ATTRIBUTION_CONFIGURATION.length);
  assert.deepEqual(readiness.missing, [...REQUIRED_ALCHEMY_ATTRIBUTION_CONFIGURATION]);
  assert.deepEqual(
    readiness.chains.map((chain) => [chain.chain, chain.configured]),
    [
      ['ethereum', false],
      ['base', false],
      ['bnb', false],
      ['solana', false],
      ['robinhood', false],
    ],
  );
});

test('Alchemy attribution readiness requires Notify control plus complete webhook ID and signing-key pairs for all five Beta networks', () => {
  const readiness = assessAlchemyAttributionConfiguration({
    ALCHEMY_NOTIFY_AUTH_TOKEN: 'notify-secret',
    ALCHEMY_WEBHOOK_ID_ETHEREUM: 'wh-eth',
    ALCHEMY_WEBHOOK_SIGNING_KEY_ETHEREUM: 'sig-eth',
    ALCHEMY_WEBHOOK_ID_BASE: 'wh-base',
    ALCHEMY_WEBHOOK_SIGNING_KEY_BASE: 'sig-base',
    ALCHEMY_WEBHOOK_ID_BNB: 'wh-bnb',
    ALCHEMY_WEBHOOK_SIGNING_KEY_BNB: 'sig-bnb',
    ALCHEMY_WEBHOOK_ID_SOLANA: 'wh-sol',
    ALCHEMY_WEBHOOK_SIGNING_KEY_SOLANA: 'sig-sol',
    ALCHEMY_WEBHOOK_ID_ROBINHOOD: 'wh-rh',
    ALCHEMY_WEBHOOK_SIGNING_KEY_ROBINHOOD: 'sig-rh',
  } as any);

  assert.equal(readiness.ready, true);
  assert.equal(readiness.presentCount, REQUIRED_ALCHEMY_ATTRIBUTION_CONFIGURATION.length);
  assert.deepEqual(readiness.missing, []);
  assert.equal(readiness.chains.every((chain) => chain.configured), true);
});

test('a partial chain webhook pair never reports that chain ready', () => {
  const common = { ALCHEMY_NOTIFY_AUTH_TOKEN: 'notify-secret' };
  const idOnly = assessAlchemyAttributionConfiguration({ ...common, ALCHEMY_WEBHOOK_ID_BASE: 'wh-base' } as any);
  const signingOnly = assessAlchemyAttributionConfiguration({ ...common, ALCHEMY_WEBHOOK_SIGNING_KEY_BASE: 'sig-base' } as any);

  assert.equal(idOnly.chains.find((chain) => chain.chain === 'base')?.configured, false);
  assert.equal(signingOnly.chains.find((chain) => chain.chain === 'base')?.configured, false);
  assert.equal(idOnly.missing.includes('Base attribution webhook'), true);
  assert.equal(signingOnly.missing.includes('Base attribution webhook'), true);
});

test('Superadmin Beta readiness includes onchain provider readiness without exposing provider secrets', () => {
  const admin = readFileSync(new URL('../src/routes/admin.ts', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../frontend/src/AdminReadinessExperience.tsx', import.meta.url), 'utf8');

  assert.match(admin, /const onchainAttribution = assessAlchemyAttributionConfiguration\(env\)/);
  assert.match(admin, /const ready = schemaReady && configuration\.ready && onchainAttribution\.ready/);
  assert.match(admin, /Configure the missing Alchemy attribution webhooks/);
  assert.match(ui, /ONCHAIN PROVIDER/);
  assert.match(ui, /Alchemy attribution networks/);
  assert.match(ui, /Secret values are never exposed here\./);

  assert.doesNotMatch(ui, /ALCHEMY_NOTIFY_AUTH_TOKEN/);
  assert.doesNotMatch(ui, /ALCHEMY_WEBHOOK_ID_/);
  assert.doesNotMatch(ui, /ALCHEMY_WEBHOOK_SIGNING_KEY_/);
});
