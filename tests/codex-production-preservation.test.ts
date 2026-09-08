import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repo = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, repo), 'utf8');

test('coding-agent instructions protect the approved Private Network during unrelated work', async () => {
  const agents = await read('AGENTS.md');

  assert.match(agents, /synchronize with `origin\/main`/);
  assert.match(agents, /`Invitations` view/);
  assert.match(agents, /`My network` view/);
  assert.match(agents, /`Network map` view/);
  assert.match(agents, /Gen 1 through Gen 7/);
  assert.match(agents, /wallet export work must stay isolated/i);
  assert.match(agents, /Never run `wrangler deploy` or `npm run deploy` from a non-`main` branch/);
});

test('production deploy command refuses feature branches and exposes a preview command', async () => {
  const packageJson = await read('package.json');
  const guard = await read('scripts/guard-production-deploy.mjs');

  assert.match(packageJson, /"deploy": "node scripts\/guard-production-deploy\.mjs/);
  assert.match(packageJson, /"deploy:public": "node scripts\/guard-production-deploy\.mjs/);
  assert.match(packageJson, /"deploy:preview": "npm run app:build && wrangler versions upload"/);
  assert.match(guard, /WORKERS_CI_BRANCH/);
  assert.match(guard, /GITHUB_REF_NAME/);
  assert.match(guard, /branch !== 'main'/);
  assert.match(guard, /Refusing production deployment from non-main branch/);
});

test('required production workflow hard-protects Private Network and release paths', async () => {
  const workflow = await read('.github/workflows/deploy-production.yml');

  assert.match(workflow, /protected_pattern=/);
  assert.match(workflow, /InviteExperience\\\.tsx/);
  assert.match(workflow, /PersonalNetworkPanel\\\.tsx/);
  assert.match(workflow, /PrivateNetworkMapV2Panel\\\.tsx/);
  assert.match(workflow, /InteractiveNetworkMapV3\\\.tsx/);
  assert.match(workflow, /private-network-tabs\\\.css/);
  assert.match(workflow, /AppV3\\\.tsx/);
  assert.match(workflow, /ProductWorkspace\\\.tsx/);
  assert.match(workflow, /main\\\.tsx/);
  assert.match(workflow, /src\/trackingEntry\\\.ts/);
  assert.match(workflow, /\.github\/workflows\/deploy-production\\\.yml/);
  assert.match(workflow, /approved-product-change/);
  assert.match(workflow, /changes protected Linkary product\/release files/);
});

test('the protected Invite implementation still exposes all three Personal Private Network views', async () => {
  const invite = await read('frontend/src/InviteExperience.tsx');

  assert.match(invite, />Invitations<\/button>/);
  assert.match(invite, />My network<\/button>/);
  assert.match(invite, />Network map<\/button>/);
  assert.match(invite, /PersonalNetworkPanel profileId=\{networkProfileId\} view="network"/);
  assert.match(invite, /PrivateNetworkMapV2Panel profileId=\{networkProfileId\}/);
});
