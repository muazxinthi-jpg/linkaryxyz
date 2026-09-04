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

test('Beta runtime readiness passes only with database, Coinbase server auth and canonical URLs', () => {
  const readiness = assessBetaConfiguration({
    DB: {},
    CDP_PROJECT_ID: 'project',
    CDP_API_KEY_ID: 'key-id',
    CDP_API_KEY_SECRET: 'key-secret',
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
