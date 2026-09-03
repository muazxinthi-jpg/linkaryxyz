import test from 'node:test';
import assert from 'node:assert/strict';
import { serveStatic } from '../src/static';
import type { Env } from '../src/env';

function makeEnv() {
  const requestedPaths: string[] = [];
  const env: Env = {
    ASSETS: {
      async fetch(input) {
        const request = typeof input === 'string' ? new Request(input) : input;
        const pathname = new URL(request.url).pathname;
        requestedPaths.push(pathname);
        if (pathname === '/assets/linkary-app/index.html') {
          return new Response('<!doctype html><html><body><div id="root"></div></body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        }
        return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
      },
    },
    PUBLIC_SITE_URL: 'https://linkary.xyz',
    APP_BASE_URL: 'https://app.linkary.xyz',
    APP_ENV: 'production',
  };
  return { env, requestedPaths };
}

test('app deep links recover from an asset 404 by serving the React shell from the stable assets namespace', async () => {
  for (const pathname of ['/profile', '/dashboard', '/campaigns', '/settings']) {
    const { env, requestedPaths } = makeEnv();
    const response = await serveStatic(new Request(`https://app.linkary.xyz${pathname}`), env);
    assert.equal(response.status, 200, pathname);
    assert.deepEqual(requestedPaths, [pathname, '/assets/linkary-app/index.html'], pathname);
    assert.match(await response.text(), /id="root"/, pathname);
  }
});

test('legacy app shell requests are remapped before hitting the asset binding', async () => {
  const { env, requestedPaths } = makeEnv();
  const response = await serveStatic(new Request('https://app.linkary.xyz/app/index.html'), env);
  assert.equal(response.status, 200);
  assert.deepEqual(requestedPaths, ['/assets/linkary-app/index.html']);
  assert.match(await response.text(), /id="root"/);
});

test('public-site 404s are not rewritten to the authenticated app shell', async () => {
  const { env, requestedPaths } = makeEnv();
  const response = await serveStatic(new Request('https://linkary.xyz/not-a-real-page'), env);
  assert.equal(response.status, 404);
  assert.deepEqual(requestedPaths, ['/not-a-real-page']);
});

test('app asset 404s are not rewritten as HTML', async () => {
  const { env, requestedPaths } = makeEnv();
  const response = await serveStatic(new Request('https://app.linkary.xyz/assets/linkary-app/assets/missing.js'), env);
  assert.equal(response.status, 404);
  assert.deepEqual(requestedPaths, ['/assets/linkary-app/assets/missing.js']);
});
