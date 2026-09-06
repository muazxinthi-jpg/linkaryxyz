import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/deploy-production.yml', import.meta.url), 'utf8');
const community = readFileSync(new URL('../src/routes/communityVerificationIntegrity.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
const wallets = readFileSync(new URL('../src/routes/wallets.ts', import.meta.url), 'utf8');

test('authenticated app distinguishes signed-out forbidden and unavailable states without silent fallback', () => {
  assert.equal(app.includes("type GateState = 'loading' | 'legacy' | 'forbidden' | 'unavailable' | 'ready'"), true);
  assert.equal(app.includes('class RequestError extends Error'), true);
  assert.equal(app.includes('function requestGateState'), true);
  assert.equal(app.includes("error.status === 401) return 'legacy'"), true);
  assert.equal(app.includes("error.status === 403) return 'forbidden'"), true);
  assert.equal(app.includes("return 'unavailable'"), true);
  assert.equal(app.includes('Linkary is temporarily unavailable'), true);
  assert.equal(app.includes('Your current page has been preserved.'), true);
  assert.equal(app.includes('onClick={onRetry}>Retry</button>'), true);
  assert.equal(app.includes('Access unavailable'), true);
  assert.equal(app.includes('Your account does not have access to this Linkary workspace or action.'), true);
  assert.match(app, /catch \(error\) \{[\s\S]*setState\(requestGateState\(error\)\)/);
});

test('Team invitation gate distinguishes service failure forbidden and signed-out state', () => {
  const gate = app.slice(app.indexOf('function TeamInviteGate()'), app.indexOf('export default function AppV3()'));
  assert.equal(gate.includes("setState(result.authenticated ? 'ready' : 'legacy')"), true);
  assert.equal(gate.includes('setState(requestGateState(error))'), true);
  assert.equal(gate.includes("if (state === 'forbidden') return <ForbiddenScreen />"), true);
  assert.equal(gate.includes('<UnavailableScreen'), true);
});

test('Superadmin routes fail closed with an explicit forbidden state for normal users', () => {
  assert.equal(app.includes("if (!me.user?.superadmin) return <ForbiddenScreen />"), true);
});

test('Worker backend TypeScript is a mandatory local and GitHub release check', () => {
  assert.equal(packageJson.includes('"backend:check": "tsc -p tsconfig.json --noEmit"'), true);
  assert.equal(packageJson.includes('npm run test && npm run backend:check && npm run app:check && npm run deploy:dry'), true);
  assert.equal(workflow.includes('name: Type-check Worker backend'), true);
  assert.equal(workflow.includes('run: npm run backend:check'), true);
});

test('Community Manager verification is derived from current verified Telegram Community assets', () => {
  assert.match(community, /asset_type = 'telegram_community'[\s\S]*verification_status = 'verified'/);
  assert.equal(community.includes("[verifiedAsset ? 'verified' : 'unverified', now(), managerId]"), true);
  assert.equal(community.includes("manager.manager_type !== 'community_manager'"), true);
  assert.equal(community.includes('telegramIdentity'), false);
});

test('Community asset mutations and superadmin reviews both resync parent manager verification', () => {
  assert.equal(community.includes('savePartnerManagerAssetIntegrity'), true);
  assert.equal(community.includes('reviewCommunityVerificationIntegrity'), true);
  assert.equal(community.match(/syncCommunityManagerVerification/g)?.length >= 3, true);
  assert.equal(worker.includes('savePartnerManagerAssetIntegrity(request, env)'), true);
  assert.equal(worker.includes('reviewCommunityVerificationIntegrity('), true);
});

test('NFT API normalization stays nullable and type-guarded under strict backend TypeScript', () => {
  assert.match(wallets, /function mapEvmNft\([\s\S]*?\): OwnedNft \| null/);
  assert.match(wallets, /function mapSolanaNft\([\s\S]*?\): OwnedNft \| null/);
  assert.equal((wallets.match(/item is OwnedNft/g) || []).length >= 2, true);
});
