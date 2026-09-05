import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../src/routes/projectAccess.ts', import.meta.url), 'utf8');

function section(start: string, end?: string) {
  const from = route.indexOf(start);
  assert.notEqual(from, -1, `missing section: ${start}`);
  const to = end ? route.indexOf(end, from + start.length) : route.length;
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return route.slice(from, to);
}

test('concurrent Project access requests resume the authoritative pending request', () => {
  const source = section('export async function requestProjectAccess', 'export async function listMyProjectAccessRequests');
  assert.equal(source.includes('catch (error)'), true);
  assert.match(source, /SELECT id FROM project_access_requests WHERE organization_id = \? AND requested_by_user_id = \? AND status = 'submitted'/);
  assert.equal(source.includes('duplicate: true'), true);
  assert.equal(source.includes('throw error'), true);
});

test('access-request cancellation is source-state guarded and audits only the winning cancellation', () => {
  const source = section('export async function cancelMyProjectAccessRequest', 'export async function listProjectAccessRequests');
  assert.match(source, /WHERE id = \? AND requested_by_user_id = \? AND status = 'submitted'/);
  assert.match(source, /r\.status = 'cancelled' AND r\.updated_at = \?/);
  assert.equal(source.includes("'access_request_conflict'"), true);
  assert.equal(source.includes("resulting.status !== 'cancelled'"), true);
  assert.equal(source.includes('resulting.updated_at !== timestamp'), true);
});

test('Project access approval and rejection re-check authority inside the D1 transaction', () => {
  const source = section('export async function reviewProjectAccessRequest', 'export async function listProjectMembers');
  assert.match(source, /actor\.status = 'active'/);
  assert.match(source, /actor\.role = 'owner' OR \(actor\.role = 'admin' AND project_access_requests\.requested_role != 'admin'\)/);
  assert.match(source, /actor\.role IN \('owner', 'admin'\)/);
  assert.match(source, /AND NOT EXISTS \([\s\S]*target\.status = 'active'[\s\S]*\)/);
  assert.match(source, /r\.status = 'approved' AND r\.reviewed_by_user_id = \? AND r\.reviewed_at = \?/);
  assert.match(source, /m\.role = r\.requested_role AND m\.status = 'active' AND m\.updated_at = \?/);
  assert.match(source, /r\.status = 'rejected' AND r\.reviewed_by_user_id = \? AND r\.reviewed_at = \?/);
  assert.equal(source.includes("'access_review_conflict'"), true);
  assert.equal(source.includes('resultingMembership.updated_at !== timestamp'), true);
});

test('direct member add, role update and removal require current Project authority and exact final state', () => {
  const add = section('export async function addProjectMember', 'export async function updateProjectMember');
  assert.match(add, /actor\.status = 'active'/);
  assert.match(add, /actor\.role = 'owner' OR \(actor\.role = 'admin' AND \? != 'admin'\)/);
  assert.match(add, /organization_memberships\.role != 'owner' AND organization_memberships\.status != 'active'/);
  assert.equal(add.includes('resulting.updated_at !== timestamp'), true);

  const update = section('export async function updateProjectMember', 'export async function removeProjectMember');
  assert.match(update, /status = 'active' AND role = \? AND role != 'owner'/);
  assert.match(update, /actor\.status = 'active'/);
  assert.match(update, /actor\.role = 'owner' OR \(actor\.role = 'admin' AND \? != 'admin' AND \? != 'admin'\)/);
  assert.match(update, /role = \? AND status = 'active' AND updated_at = \?/);
  assert.equal(update.includes("'membership_conflict'"), true);

  const remove = section('export async function removeProjectMember', 'export async function transferProjectOwnership');
  assert.match(remove, /status = 'active' AND role = \? AND role != 'owner'/);
  assert.match(remove, /actor\.status = 'active'/);
  assert.match(remove, /actor\.role = 'owner' OR \(actor\.role = 'admin' AND \? != 'admin'\)/);
  assert.match(remove, /role = \? AND status = 'removed' AND updated_at = \?/);
  assert.equal(remove.includes("'membership_conflict'"), true);
});

test('ownership transfer cannot promote a second owner after another transfer wins', () => {
  const source = section('export async function transferProjectOwnership');
  assert.match(source, /role = 'owner' AND status = 'active'/);
  assert.match(source, /SELECT COUNT\(\*\) FROM organization_memberships WHERE organization_id = \? AND status = 'active' AND role = 'owner'\) = 1/);
  assert.match(source, /target\.status = 'active' AND target\.role != 'owner'/);
  assert.match(source, /AND NOT EXISTS \([\s\S]*existing_owner\.role = 'owner'[\s\S]*\)/);
  assert.match(source, /previous_owner\.role = 'admin' AND previous_owner\.updated_at = \?/);
  assert.match(source, /new_owner\.role = 'owner' AND new_owner\.updated_at = \?/);
  assert.match(source, /SELECT COUNT\(\*\) AS count FROM organization_memberships WHERE organization_id = \? AND status = 'active' AND role = 'owner'/);
  assert.equal(source.includes('ownerCount?.count !== 1'), true);
  assert.equal(source.includes("'ownership_conflict'"), true);
});

test('commercial migration 0029 does not change Project access transition schema', () => {
  const migration = readFileSync(new URL('../migrations/0029_commercial_plan_catalog_and_usage_credits.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(migration, /project_access_requests|organization_memberships/);
});