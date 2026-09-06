import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('migrations/0032_contact_reveal_entitlements.sql', 'utf8');
const route = readFileSync('src/routes/contactReveals.ts', 'utf8');
const worker = readFileSync('src/index.ts', 'utf8');
const ui = readFileSync('frontend/src/PartnerDirectoryExperience.tsx', 'utf8');
const billingUi = readFileSync('frontend/src/BillingExperience.tsx', 'utf8');

test('contact reveals are monthly, idempotent and audited', () => {
  assert.match(migration, /monthly_contact_reveals/);
  assert.match(migration, /contact_reveal_events/);
  assert.match(migration, /UNIQUE\(owner_type, owner_id, manager_id, contact_type, period_start\)/);
  assert.match(route, /verifyCsrf\(request, env, auth\)/);
  assert.match(route, /contact_reveal_limit/);
  assert.match(route, /ON CONFLICT\(owner_type, owner_id, manager_id, contact_type, period_start\) DO NOTHING/);
  assert.match(worker, /partnerContactReveal = path\.match/);
  assert.match(ui, /Reveal email/);
  assert.match(worker, /contact-reveals\/history/);
  assert.match(billingUi, /ContactRevealHistory/);
  assert.match(billingUi, /aria-valuenow/);
});
