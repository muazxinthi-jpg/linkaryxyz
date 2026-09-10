import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const access = readFileSync(new URL('../src/routes/projectAccess.ts', import.meta.url), 'utf8');
const onboarding = readFileSync(new URL('../src/routes/onboarding.ts', import.meta.url), 'utf8');
const projectControl = readFileSync(new URL('../frontend/src/ProjectExperienceBeta.tsx', import.meta.url), 'utf8');
const teamInvites = readFileSync(new URL('../frontend/src/ProjectTeamInvitesExperience.tsx', import.meta.url), 'utf8');

function section(source: string, start: string, end?: string): string {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing section: ${start}`);
  const to = end ? source.indexOf(end, from + start.length) : source.length;
  assert.notEqual(to, -1, `missing section end: ${end}`);
  return source.slice(from, to);
}

test('Project registration keeps its internal owner/controller for authorization', () => {
  assert.match(
    onboarding,
    /INSERT INTO organization_memberships[\s\S]*VALUES \(\?, \?, \?, 'owner', 1, 'active', \?, \?\)/,
  );
  assert.match(onboarding, /created_by_user_id/);
  assert.match(onboarding, /auth\.user\.id/);
});

test('automatic registration controller is not returned as an explicitly added Project team member', () => {
  const members = section(access, 'export async function listProjectMembers', 'export async function searchEligibleProjectMembers');
  assert.match(members, /JOIN organizations o ON o\.id = m\.organization_id/);
  assert.match(members, /AND NOT \(m\.user_id = o\.created_by_user_id AND m\.role = 'owner'\)/);
  assert.match(members, /m\.organization_id = \? AND m\.status = 'active'/);
});

test('team visibility filter does not weaken Project authorization or explicit member flows', () => {
  const adminGuard = section(access, 'async function requireProjectAdmin', 'export async function searchRegisteredProjects');
  assert.match(adminGuard, /\['owner', 'admin'\]\.includes\(membership\.role\)/);

  const approval = section(access, 'export async function reviewProjectAccessRequest', 'export async function listProjectMembers');
  assert.match(approval, /INSERT INTO organization_memberships/);

  const directAdd = section(access, 'export async function addProjectMember', 'export async function updateProjectMember');
  assert.match(directAdd, /organization_memberships/);
});

test('both Project team surfaces derive their visible team and count from the filtered members endpoint', () => {
  assert.match(projectControl, /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/members/);
  assert.match(projectControl, /Team \(\{members\.length\}\)/);
  assert.match(teamInvites, /\/api\/projects\/\$\{encodeURIComponent\(id\)\}\/members/);
  assert.match(teamInvites, /\{members\.length\} active member/);
});
