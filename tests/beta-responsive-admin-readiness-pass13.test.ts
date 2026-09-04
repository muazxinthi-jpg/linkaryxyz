import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const main = readFileSync(new URL('frontend/src/main.tsx', root), 'utf8');
const readiness = readFileSync(new URL('frontend/src/AdminReadinessExperience.tsx', root), 'utf8');
const css = readFileSync(new URL('frontend/src/admin-readiness-beta-acceptance.css', root), 'utf8');

function compact(value: string) {
  return value.replace(/\s+/g, ' ');
}

test('Superadmin readiness acceptance styles load after the preceding responsive passes', () => {
  const networkIndex = main.indexOf("import './network-beta-acceptance.css';");
  const readinessIndex = main.indexOf("import './admin-readiness-beta-acceptance.css';");
  assert.ok(networkIndex >= 0, 'network acceptance stylesheet should remain loaded');
  assert.ok(readinessIndex > networkIndex, 'readiness acceptance stylesheet should load after prior acceptance layers');
  assert.match(readiness, /className="ops-stack admin-readiness-workspace"/);
});

test('Beta readiness actions and status content stay usable on phones', () => {
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.admin-readiness-workspace \.ops-heading-actions \.ops-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.admin-readiness-workspace \.ops-heading-actions[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.admin-readiness-workspace \.ops-project-state\s*\{[^}]*white-space:\s*normal/s);
});

test('readiness metrics and acceptance rows fail safe for long production capability names', () => {
  assert.match(css, /\.admin-readiness-workspace \.ops-activity-main\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)/s);
  assert.match(css, /\.admin-readiness-workspace \.ops-activity-main small[\s\S]*white-space:\s*normal/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.admin-readiness-workspace \.ops-metrics[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 340px\)[\s\S]*\.admin-readiness-workspace \.ops-metrics[\s\S]*grid-template-columns:\s*1fr/);
});

test('responsive readiness hardening keeps the workspace read-only and migration-controlled', () => {
  const source = compact(readiness);
  assert.match(source, /fetch\('\/api\/admin\/health', \{ credentials: 'same-origin' \}\)/);
  assert.doesNotMatch(source, /method:\s*'(?:POST|PUT|PATCH|DELETE)'/);
  assert.match(source, /Run the protected production migration workflow before real-account Beta acceptance\./);
  assert.match(source, /Do not broaden onboarding until the end-to-end Beta checklist passes with separate accounts\./);
});
