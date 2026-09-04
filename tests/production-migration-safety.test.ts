import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/migrate-production-d1.yml', import.meta.url), 'utf8');

test('production D1 migration workflow always checks out main', () => {
  assert.equal(workflow.includes('workflow_dispatch:'), true);
  assert.equal(workflow.includes('ref: main'), true);
  assert.equal(workflow.includes('test "$(git branch --show-current)" = "main"'), true);
  assert.equal(/^\s*push:/m.test(workflow), false);
  assert.equal(/^\s*pull_request:/m.test(workflow), false);
});

test('production D1 migration workflow defaults to non-mutating verification', () => {
  assert.equal(workflow.includes('default: verify'), true);
  assert.equal(workflow.includes('- verify'), true);
  assert.equal(workflow.includes('- apply'), true);
  assert.equal(workflow.includes('Preflight production migration state'), true);
  assert.equal(workflow.includes('Production D1 has pending migrations.'), true);
});

test('production D1 applies only after an explicit apply selection and verifies afterwards', () => {
  assert.equal(workflow.includes("if: ${{ inputs.mode == 'apply' }}"), true);
  assert.equal(workflow.includes('d1 migrations apply linkary-db --remote'), true);
  assert.equal(workflow.includes('Verify migration state after apply'), true);
  assert.equal(workflow.includes('Production D1 still has pending migrations after apply.'), true);
});

test('current collaboration migrations remain versioned through 0022', () => {
  const exactAssignment = readFileSync(new URL('../migrations/0020_exact_activity_partner_assignment.sql', import.meta.url), 'utf8');
  const inquiries = readFileSync(new URL('../migrations/0021_collaboration_inquiries.sql', import.meta.url), 'utf8');
  const activations = readFileSync(new URL('../migrations/0022_collaboration_inquiry_activations.sql', import.meta.url), 'utf8');

  assert.equal(exactAssignment.includes('campaign_activity_linkary_assignments'), true);
  assert.equal(inquiries.includes('collaboration_inquiries'), true);
  assert.equal(inquiries.includes('An inquiry is not campaign evidence'), true);
  assert.equal(activations.includes('collaboration_inquiry_activations'), true);
  assert.equal(activations.includes('creates no campaign evidence'), true);
});
