import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repo = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, repo), 'utf8');

test('approved Personal Private Network remains under Invites across seven generations', async () => {
  const invite = await read('frontend/src/InviteExperience.tsx');
  const map = await read('frontend/src/PrivateNetworkMapV2Panel.tsx');

  assert.match(invite, /type PrivateNetworkView = 'invites' \| 'network' \| 'map'/);
  assert.match(invite, /useState<PrivateNetworkView>\(personalProfile \? 'network' : 'invites'\)/);
  assert.match(invite, />Invitations<\/button>/);
  assert.match(invite, />My network<\/button>/);
  assert.match(invite, />Network map<\/button>/);
  assert.match(invite, /PersonalNetworkPanel profileId=\{networkProfileId\} view="network"/);
  assert.match(invite, /PrivateNetworkMapV2Panel profileId=\{networkProfileId\}/);
  assert.match(invite, /network grows across seven generations/);

  assert.match(map, /InteractiveNetworkMapV3/);
  assert.match(map, /networkGraphLimit: '160'/);
  assert.match(map, /across up to seven generations/);
  assert.match(map, /members across seven generations/);
  assert.match(map, /data-private-network-release="2026-09-08-v3"/);
  assert.match(map, /data-network-root-avatar-overlay/);
});

test('Personal referral Network and Project Network remain separate product entry points', async () => {
  const app = await read('frontend/src/AppV3.tsx');
  const workspace = await read('frontend/src/ProductWorkspace.tsx');

  assert.match(app, /location\.pathname === '\/creators'.*experience="network"/);
  assert.match(app, /location\.pathname === '\/invites'.*experience="invites"/);
  assert.match(workspace, /\['\/invites', 'Invites'\]/);
  assert.match(workspace, /\['\/creators', 'Network'\]/);
  assert.doesNotMatch(workspace, /creatorNav[\s\S]*\['\/creators', 'Network'\][\s\S]*const projectNav/);
});

test('approved production guards for Profile Optimization and Private Network stay mandatory', async () => {
  const workflow = await read('.github/workflows/deploy-production.yml');

  assert.match(workflow, /Verify production invites shell health/);
  assert.match(workflow, /Profile optimization/);
  assert.match(workflow, /My network/);
  assert.match(workflow, /Network map/);
  assert.match(workflow, /Private Network views/);
  assert.match(workflow, /2026-09-08-v3/);
});

test('tracking-first public positioning uses the dedicated source-controlled overlay and is checked in production', async () => {
  const homepage = await read('src/homepagePricing.ts');
  const appWrangler = await read('wrangler.jsonc');
  const publicWrangler = await read('wrangler.public.jsonc');
  const workflow = await read('.github/workflows/deploy-production.yml');
  const packageJson = await read('package.json');
  const contract = await read('docs/APPROVED_PRODUCT_PRESERVATION.md');

  assert.match(homepage, /Run growth anywhere\./);
  assert.match(homepage, /Track it in Linkary\./);
  assert.match(homepage, /External campaigns/);
  assert.match(homepage, /OPTIONAL \/ LINKARY CAMPAIGN WORKSPACE/);

  assert.doesNotMatch(appWrangler, /"pattern": "linkary\.xyz\/\*"/);
  assert.match(appWrangler, /"pattern": "app\.linkary\.xyz\/\*"/);
  assert.match(publicWrangler, /"name": "linkary-public-overlay"/);
  assert.match(publicWrangler, /"main": "src\/trackingEntry\.ts"/);
  assert.match(publicWrangler, /"pattern": "linkary\.xyz\/\*"/);

  assert.match(packageJson, /"deploy:public": "npm run app:build && wrangler deploy --config wrangler\.public\.jsonc"/);
  assert.match(packageJson, /"deploy:public:dry": "npm run app:build && wrangler deploy --config wrangler\.public\.jsonc --dry-run"/);
  assert.match(workflow, /Public overlay Wrangler dry run/);
  assert.match(workflow, /npm run deploy:public:dry/);
  assert.match(workflow, /Deploy public overlay to production/);
  assert.match(workflow, /npm run deploy:public/);
  assert.match(workflow, /Verify production public site positioning/);
  assert.match(workflow, /https:\/\/linkary\.xyz\/\?deploycheck=/);
  assert.match(workflow, /grep -Fq 'Run growth anywhere\.'/);
  assert.match(workflow, /grep -Fq 'Track it in Linkary\.'/);
  assert.match(workflow, /grep -Fq 'External campaigns'/);

  assert.match(contract, /approved-product-change/);
  assert.match(contract, /linkary-public-overlay/);
  assert.match(contract, /Gen 1 through Gen 7/);
  assert.match(contract, /My network remains available/);
  assert.match(contract, /Network map remains available/);
  assert.match(contract, /Manual evidence must not be presented as verified evidence/);
  assert.match(contract, /Profile Copilot keeps explicit review before applying suggestions/);
});

test('preservation contract cannot be quietly rewritten after bootstrap', async () => {
  const workflow = await read('.github/workflows/deploy-production.yml');

  assert.match(workflow, /Enforce approved product change approval/);
  assert.match(workflow, /docs\/APPROVED_PRODUCT_PRESERVATION\\\.md/);
  assert.match(workflow, /tests\/approved-product-preservation\\\.test\\\.ts/);
  assert.match(workflow, /approved-product-change/);
  assert.match(workflow, /Explicit product-owner approval is required/);
});

test('protected migrations and production verification remain release controls', async () => {
  const workflow = await read('.github/workflows/deploy-production.yml');
  const packageJson = await read('package.json');

  assert.match(workflow, /Run regression tests/);
  assert.match(workflow, /Type-check Worker backend/);
  assert.match(workflow, /Type-check authenticated app/);
  assert.match(workflow, /Wrangler dry run/);
  assert.match(workflow, /Public overlay Wrangler dry run/);
  assert.match(workflow, /Report production D1 migration state/);
  assert.match(workflow, /Deploy Worker to production/);
  assert.match(workflow, /Deploy public overlay to production/);
  assert.doesNotMatch(workflow, /d1 migrations apply/);
  assert.match(packageJson, /"test": "tsx --test tests\/\*\.test\.ts"/);
});
