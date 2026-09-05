import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assessBetaConfiguration,
  REQUIRED_BETA_CONFIGURATION,
} from '../src/betaReadiness';

test('Beta runtime readiness fails closed when onboarding configuration is missing', () => {
  const readiness = assessBetaConfiguration({} as any);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.presentCount, 0);
  assert.deepEqual(readiness.missing, [...REQUIRED_BETA_CONFIGURATION]);
});

test('Beta runtime readiness passes only with database, Coinbase server auth, Alchemy, security secrets and canonical URLs', () => {
  const readiness = assessBetaConfiguration({
    DB: {},
    CDP_PROJECT_ID: 'project',
    CDP_API_KEY_ID: 'key-id',
    CDP_API_KEY_SECRET: 'key-secret',
    ALCHEMY_API_KEY: 'alchemy-test-key',
    SESSION_SECRET: 'creator-access-signing-secret',
    TRACKING_HASH_SALT: 'tracking-visitor-privacy-salt',
    PUBLIC_SITE_URL: 'https://linkary.xyz',
    APP_BASE_URL: 'https://app.linkary.xyz',
  } as any);

  assert.equal(readiness.ready, true);
  assert.equal(readiness.requiredCount, REQUIRED_BETA_CONFIGURATION.length);
  assert.equal(readiness.presentCount, REQUIRED_BETA_CONFIGURATION.length);
  assert.deepEqual(readiness.missing, []);
});

test('partial Coinbase server credentials never report onboarding ready', () => {
  const common = {
    DB: {},
    CDP_PROJECT_ID: 'project',
    ALCHEMY_API_KEY: 'alchemy-test-key',
    SESSION_SECRET: 'creator-access-signing-secret',
    TRACKING_HASH_SALT: 'tracking-visitor-privacy-salt',
    PUBLIC_SITE_URL: 'https://linkary.xyz',
    APP_BASE_URL: 'https://app.linkary.xyz',
  };
  const missingSecret = assessBetaConfiguration({ ...common, CDP_API_KEY_ID: 'key-id' } as any);
  const missingKeyId = assessBetaConfiguration({ ...common, CDP_API_KEY_SECRET: 'key-secret' } as any);

  assert.equal(missingSecret.ready, false);
  assert.equal(missingKeyId.ready, false);
  assert.equal(missingSecret.missing.includes('Coinbase CDP server credentials'), true);
  assert.equal(missingKeyId.missing.includes('Coinbase CDP server credentials'), true);
});

test('missing Creator claim signing or tracking privacy secrets block readiness without revealing a secret value', () => {
  const common = {
    DB: {},
    CDP_PROJECT_ID: 'project',
    CDP_API_KEY_ID: 'key-id',
    CDP_API_KEY_SECRET: 'key-secret',
    ALCHEMY_API_KEY: 'alchemy-test-key',
    SESSION_SECRET: 'creator-access-signing-secret',
    TRACKING_HASH_SALT: 'tracking-visitor-privacy-salt',
    PUBLIC_SITE_URL: 'https://linkary.xyz',
    APP_BASE_URL: 'https://app.linkary.xyz',
  };
  const missingClaimSigning = assessBetaConfiguration({ ...common, SESSION_SECRET: '' } as any);
  const missingTrackingSalt = assessBetaConfiguration({ ...common, TRACKING_HASH_SALT: '' } as any);

  assert.equal(missingClaimSigning.ready, false);
  assert.equal(missingTrackingSalt.ready, false);
  assert.equal(missingClaimSigning.missing.includes('Creator access claim signing secret'), true);
  assert.equal(missingTrackingSalt.missing.includes('Tracking visitor privacy salt'), true);
});

test('Superadmin readiness combines schema and runtime configuration without exposing secret values', () => {
  const admin = readFileSync(new URL('../src/routes/admin.ts', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../frontend/src/AdminReadinessExperience.tsx', import.meta.url), 'utf8');

  assert.match(admin, /const configuration = assessBetaConfiguration\(env\)/);
  assert.match(admin, /const ready = schemaReady && configuration\.ready/);
  assert.match(admin, /Configure the missing production requirements, then refresh this check\./);
  assert.match(ui, /PRODUCTION CONFIG/);
  assert.match(ui, /configuration\.missing\.map/);
  assert.match(ui, /Secret values are never exposed here\./);
  assert.doesNotMatch(ui, /CDP_API_KEY_SECRET|CDP_API_KEY_ID/);
});
