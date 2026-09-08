import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repo = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, repo), 'utf8');

test('authenticated app HTML is non-cacheable and performs one-time stale-shell recovery', async () => {
  const entry = await read('src/trackingEntry.ts');

  assert.match(entry, /APP_SHELL_RECOVERY_COOKIE = '__Host-linkary_shell_v4'/);
  assert.match(entry, /function appShellResponse\(request: Request, response: Response\)/);
  assert.match(entry, /contentType\.includes\('text\/html'\)/);
  assert.match(entry, /cache-control', 'no-store, no-cache, must-revalidate, max-age=0'/);
  assert.match(entry, /clear-site-data', '\"cache\"'/);
  assert.match(entry, /x-linkary-shell-release', '2026-09-08-private-network-v4'/);
  assert.match(entry, /if \(isAppHost && !url\.pathname\.startsWith\('\/api\/'\)\) return appShellResponse\(request, response\)/);
});

test('private network UI remains in the authenticated release bundle', async () => {
  const main = await read('frontend/src/main.tsx');
  const invites = await read('frontend/src/InviteExperience.tsx');

  assert.match(main, /APP_RELEASE = '2026-09-08-private-network-v4'/);
  assert.match(main, /document\.documentElement\.dataset\.linkaryRelease = APP_RELEASE/);
  assert.match(invites, /useState<PrivateNetworkView>\(personalProfile \? 'network' : 'invites'\)/);
  assert.match(invites, />Invitations<\/button>/);
  assert.match(invites, />My network<\/button>/);
  assert.match(invites, />Network map<\/button>/);
  assert.match(invites, /PersonalNetworkPanel profileId=\{networkProfileId\} view="network"/);
  assert.match(invites, /PrivateNetworkMapV2Panel profileId=\{networkProfileId\}/);
});
