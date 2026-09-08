import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repo = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, repo), 'utf8');

test('authenticated app HTML and auth traffic recover stale pre-v5 bundles without deleting user state', async () => {
  const entry = await read('src/trackingEntry.ts');

  assert.match(entry, /APP_SHELL_RELEASE = '2026-09-09-private-network-v5'/);
  assert.match(entry, /APP_SHELL_RECOVERY_COOKIE = '__Host-linkary_shell_v5'/);
  assert.match(entry, /function appShellResponse\(request: Request, response: Response\)/);
  assert.match(entry, /function appApiCacheRecoveryResponse\(request: Request, response: Response\)/);
  assert.match(entry, /contentType\.includes\('text\/html'\)/);
  assert.match(entry, /cache-control', 'no-store, no-cache, must-revalidate, max-age=0'/);
  assert.match(entry, /clear-site-data', '\"cache\"'/);
  assert.match(entry, /x-linkary-shell-release', APP_SHELL_RELEASE/);
  assert.match(entry, /url\.pathname === '\/api\/auth\/me'/);
  assert.match(entry, /return appApiCacheRecoveryResponse\(request, await worker\.fetch\(request, env, ctx\)\)/);
  assert.doesNotMatch(entry, /clear-site-data', '\"cookies\"/);
  assert.doesNotMatch(entry, /clear-site-data', '\"storage\"/);
});

test('authenticated app self-heals when its running hashed bundle is older than the current app shell', async () => {
  const main = await read('frontend/src/main.tsx');

  assert.match(main, /APP_RELEASE = '2026-09-09-private-network-v5'/);
  assert.match(main, /APP_SHELL_PATH = '\/assets\/linkary-app\/index\.html'/);
  assert.match(main, /function ReleaseFreshnessGuard\(\)/);
  assert.match(main, /cache: 'no-store'/);
  assert.match(main, /latestBundle === runningBundle/);
  assert.match(main, /searchParams\.set\('_linkary_release', APP_RELEASE\)/);
  assert.match(main, /window\.location\.replace\(next\.toString\(\)\)/);
  assert.match(main, /document\.addEventListener\('visibilitychange', onVisibility\)/);
  assert.match(main, /RELEASE_CHECK_INTERVAL_MS = 5 \* 60 \* 1000/);
});

test('private network UI remains in the authenticated release bundle', async () => {
  const main = await read('frontend/src/main.tsx');
  const invites = await read('frontend/src/InviteExperience.tsx');

  assert.match(main, /APP_RELEASE = '2026-09-09-private-network-v5'/);
  assert.match(main, /document\.documentElement\.dataset\.linkaryRelease = APP_RELEASE/);
  assert.match(invites, /useState<PrivateNetworkView>\(personalProfile \? 'network' : 'invites'\)/);
  assert.match(invites, />Invitations<\/button>/);
  assert.match(invites, />My network<\/button>/);
  assert.match(invites, />Network map<\/button>/);
  assert.match(invites, /PersonalNetworkPanel profileId=\{networkProfileId\} view="network"/);
  assert.match(invites, /PrivateNetworkMapV2Panel profileId=\{networkProfileId\}/);
});
