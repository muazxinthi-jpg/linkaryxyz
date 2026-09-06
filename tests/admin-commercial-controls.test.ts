import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repo = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, repo), 'utf8');

test('Superadmin commercial controls keep comped access separate from payment', async () => {
  const source = await read('src/routes/adminCommercial.ts');
  assert.match(source, /requireSuperadmin/);
  assert.match(source, /verifyCsrf/);
  assert.match(source, /billing_entitlement_grants/);
  assert.match(source, /billing_account_price_overrides/);
  assert.match(source, /usage_credit_ledger/);
  assert.match(source, /billing_entitlement\.granted/);
  assert.match(source, /billing_price_override\.created/);
  assert.match(source, /before: prior, after/);
  assert.match(source, /entitlement-grant:\$\{grantId\}:initial-credits/);
  assert.doesNotMatch(source, /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+billing_payments/i);
  assert.doesNotMatch(source, /INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+billing_subscription_periods/i);
});

test('private payment discounts cannot silently become free access', async () => {
  const source = await read('src/routes/adminCommercial.ts');
  assert.match(source, /value > 99/);
  assert.match(source, /Use a comped grant for free access/);
  assert.match(source, /value >= plan\.base_price_cents/);
  assert.match(source, /value < 1 \|\| value > plan\.base_price_cents/);
});

test('commercial admin routes are protected by the Worker wrapper', async () => {
  const worker = await read('src/worker.ts');
  assert.match(worker, /\/api\/admin\/commercial\/accounts/);
  assert.match(worker, /\/api\/admin\/commercial\/grants/);
  assert.match(worker, /\/api\/admin\/commercial\/price-overrides/);
  assert.match(worker, /\/api\/admin\/commercial\/audit/);
});

test('authenticated app exposes the Superadmin commercial workspace', async () => {
  const app = await read('frontend/src/AppV3.tsx');
  const ui = await read('frontend/src/AdminCommercialExperience.tsx');
  assert.match(app, /admin-commercial/);
  assert.match(app, /\/admin\/commercial/);
  assert.match(app, /AdminCommercialExperience/);
  assert.match(ui, /Grant comped access/);
  assert.match(ui, /Private pricing/);
  assert.match(ui, /Adjust Usage Credits/);
  assert.match(ui, /\/api\/admin\/usage-credits\/adjust/);
  assert.match(ui, /Controlled Beta mode/);
});
