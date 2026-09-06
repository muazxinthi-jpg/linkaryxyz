import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessBetaSchema, REQUIRED_BETA_TABLES, REQUIRED_BETA_TRIGGERS } from '../src/betaReadiness';

test('Beta schema readiness fails closed when required capabilities are absent', () => {
  const readiness = assessBetaSchema([
    { type: 'table', name: 'users' },
    { type: 'table', name: 'profiles' },
  ]);

  assert.equal(readiness.ready, false);
  assert.equal(readiness.missingTables.includes('campaigns'), true);
  assert.equal(readiness.missingTables.includes('project_partner_shortlists'), true);
  assert.equal(readiness.missingTriggers.includes('trg_profiles_verified_x_avatar_after_insert'), true);
});

test('Beta schema readiness passes only when all required tables and X avatar triggers exist', () => {
  const objects = [
    ...REQUIRED_BETA_TABLES.map((name) => ({ type: 'table', name })),
    ...REQUIRED_BETA_TRIGGERS.map((name) => ({ type: 'trigger', name })),
    { type: 'table', name: 'd1_migrations' },
  ];

  const readiness = assessBetaSchema(objects);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.missingTables.length, 0);
  assert.equal(readiness.missingTriggers.length, 0);
  assert.equal(readiness.migrationLedgerPresent, true);
  assert.equal(readiness.presentRequiredTableCount, REQUIRED_BETA_TABLES.length);
  assert.equal(readiness.presentRequiredTriggerCount, REQUIRED_BETA_TRIGGERS.length);
});

test('migration ledger alone never makes an incomplete production schema ready', () => {
  const readiness = assessBetaSchema([{ type: 'table', name: 'd1_migrations' }]);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.migrationLedgerPresent, true);
  assert.equal(readiness.missingTables.length, REQUIRED_BETA_TABLES.length);
});

test('Superadmins can reach a dedicated Beta readiness workspace', () => {
  const main = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');
  const superadminApp = readFileSync(new URL('../frontend/src/SuperadminApp.tsx', import.meta.url), 'utf8');
  const superadminWorkspace = readFileSync(new URL('../frontend/src/SuperadminWorkspace.tsx', import.meta.url), 'utf8');
  const gate = readFileSync(new URL('../frontend/src/SuperadminHostGate.tsx', import.meta.url), 'utf8');
  const readinessUi = readFileSync(new URL('../frontend/src/AdminReadinessExperience.tsx', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../src/routes/admin.ts', import.meta.url), 'utf8');

  assert.equal(main.includes('SuperadminHostGate'), true);
  assert.equal(main.includes('<SuperadminApp me={me} />'), true);
  assert.equal(superadminApp.includes("location.pathname === '/admin/readiness'"), true);
  assert.equal(superadminApp.includes('<AdminReadinessExperience me={me} status={status} />'), true);
  assert.equal(gate.includes('current.data.user?.superadmin'), true);
  assert.equal(superadminWorkspace.includes('Beta readiness'), true);
  assert.equal(readinessUi.includes('/api/admin/health'), true);
  assert.equal(readinessUi.includes('Ready for Beta'), true);
  assert.equal(admin.includes('readBetaSchemaReadiness'), true);
});
