import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tasks = readFileSync(new URL('../src/ai/tasks.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../src/ai/projectProfileImprove.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/routes/profileIdentity.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0040_ai2_project_profile_copilot.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/ProjectProfileCopilot.tsx', import.meta.url), 'utf8');
const access = readFileSync(new URL('../frontend/src/ProfileAccessExperience.tsx', import.meta.url), 'utf8');

test('Project Profile Copilot has an independent metered AI task and immutable prompt', () => {
  assert.match(tasks, /project_profile_improve:\s*\{\s*promptKey:\s*'project_profile_improve'/);
  assert.match(tasks, /project_profile_improve:[^\n]+usageCredits:\s*5/);
  assert.match(migration, /aip_project_profile_improve_v1/);
  assert.match(migration, /'project_profile_improve'/);
  assert.match(migration, /human_approval_required/);
  assert.match(migration, /organization_owned_usage/);
});

test('Project Profile Copilot is organization-owned and Owner/Admin bounded', () => {
  assert.match(service, /profile_type = 'project'/);
  assert.match(service, /organization_memberships/);
  assert.match(service, /\['owner', 'admin'\]\.includes\(membership\.role\)/);
  assert.match(service, /ownerType:\s*'organization'/);
  assert.match(service, /ownerId:\s*profile\.organization_id/);
  assert.match(service, /organizationId:\s*profile\.organization_id/);
  assert.match(service, /taskKey:\s*'project_profile_improve'/);
  assert.doesNotMatch(service, /\bdb\.run\s*\(/);
  assert.doesNotMatch(service, /\bdb\.batch\s*\(/);
  assert.doesNotMatch(service, /\bdb\.exec\s*\(/);
  assert.doesNotMatch(service, /\bUPDATE\s+profiles\b/i);
  assert.doesNotMatch(service, /\bINSERT\s+INTO\b/i);
  assert.doesNotMatch(service, /\bDELETE\s+FROM\b/i);
});

test('Project prompt explicitly forbids unsupported commercial and verification claims', () => {
  for (const term of ['funding', 'investors', 'partnerships', 'customers', 'users', 'revenue', 'token claims', 'tokenomics', 'TGE', 'exchange listings', 'supported chains', 'audits', 'licenses', 'regulatory status', 'campaign performance', 'traction']) {
    assert.ok(migration.includes(term), `missing forbidden-claim guard: ${term}`);
  }
  for (const key of ['bio', 'seoTitle', 'seoDescription', 'positioningTip', 'completenessTips', 'socialTips']) {
    assert.ok(migration.includes(key), `missing output contract key: ${key}`);
  }
});

test('existing profile identity route dispatches Project AI without weakening Personal Profile ownership', () => {
  assert.match(route, /targetProfile\?\.profile_type === 'project'/);
  assert.match(route, /body\.action !== 'ai_project_improve'/);
  assert.match(route, /improveProjectProfileWithAI/);
  assert.match(route, /await requireOwnedPersonalProfile\(db, auth\.user\.id, profileId\)/);
  assert.match(route, /body\.action === 'ai_improve'/);
});

test('Project Copilot generation is draft-only and application is explicit', () => {
  assert.match(ui, /data-linkary-ai-project-profile-copilot/);
  assert.match(ui, /action:\s*'ai_project_improve'/);
  assert.match(ui, /window\.confirm\('Apply the reviewed LinkaryAI bio and SEO suggestions/);
  assert.match(ui, /'Apply bio \+ SEO'/);
  assert.match(ui, /displayName:\s*existing\.displayName/);
  assert.match(ui, /avatarUrl:\s*existing\.avatarUrl \|\| ''/);
  assert.match(ui, /bio:\s*suggestions\.bio \?\? existing\.bio/);
  assert.match(ui, /seoTitle:\s*suggestions\.seoTitle \?\? existing\.seoTitle/);
  assert.match(ui, /seoDescription:\s*suggestions\.seoDescription \?\? existing\.seoDescription/);
  assert.doesNotMatch(ui, /verificationStatus:\s*/);
  assert.doesNotMatch(ui, /organization_memberships/);
});

test('Project Copilot is mounted only inside the existing editable profile workspace', () => {
  assert.match(access, /import ProjectProfileCopilot from '\.\/ProjectProfileCopilot'/);
  assert.match(access, /state === 'editable'/);
  assert.match(access, /<ProjectProfileCopilot status=\{status\} \/>/);
  assert.match(access, /nextRole === 'owner' \|\| nextRole === 'admin'/);
});
