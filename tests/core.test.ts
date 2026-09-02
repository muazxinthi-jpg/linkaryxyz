import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isValidXPostUrl } from '../src/routes/access';
import { isSystemRoute, normalizeXHandle } from '../src/routes/onboarding';
import { getLinkaryUrls } from '../src/urls';
import worker from '../src/index';
import type { Env } from '../src/env';

const ctx = { waitUntil() {} };

function makeEnv() {
  const requestedPaths: string[] = [];
  const publicPrototype = '<!doctype html><html><head></head><body><nav class="preview-nav"><button>Prototype</button></nav><div data-page="auth"></div><main>Linkary</main></body></html>';
  const appShell = '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
  const env: Env = {
    ASSETS: {
      async fetch(input) {
        const request = typeof input === 'string' ? new Request(input) : input;
        const pathname = new URL(request.url).pathname;
        requestedPaths.push(pathname);
        const body = pathname === '/app/index.html' ? appShell : publicPrototype;
        return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
      },
    },
    PUBLIC_SITE_URL: 'https://linkary.xyz',
    APP_BASE_URL: 'https://app.linkary.xyz',
    APP_ENV: 'production',
  };
  return { env, requestedPaths };
}

test('validates X post URLs without any external API call', () => {
  assert.equal(isValidXPostUrl('https://x.com/muazxinthi/status/123456789'), true);
  assert.equal(isValidXPostUrl('https://twitter.com/user/status/987654321?s=20'), true);
  assert.equal(isValidXPostUrl('https://x.com/muazxinthi'), false);
  assert.equal(isValidXPostUrl('https://example.com/user/status/123'), false);
});

test('normalizes X handles and protects only real system routes', () => {
  assert.equal(normalizeXHandle('@MuazXinthi'), 'muazxinthi');
  assert.equal(isSystemRoute('pricing'), true);
  assert.equal(isSystemRoute('muazxinthi'), false);
  assert.throws(() => normalizeXHandle('invalid-handle'));
});

test('URL configuration is domain-agnostic until production domains are attached', () => {
  const request = new Request('https://temporary-worker.example/api/health');
  const urls = getLinkaryUrls(request, {
    ASSETS: { fetch: async () => new Response() },
    PUBLIC_SITE_URL: 'https://linkary.example/',
    APP_BASE_URL: 'https://app.linkary.example/',
    TRACKING_BASE_URL: 'https://l.linkary.example/',
    API_BASE_URL: 'https://api.linkary.example/',
    MCP_BASE_URL: 'https://mcp.linkary.example/',
  });
  assert.deepEqual(urls, {
    publicSite: 'https://linkary.example',
    app: 'https://app.linkary.example',
    tracking: 'https://l.linkary.example',
    api: 'https://api.linkary.example',
    mcp: 'https://mcp.linkary.example',
  });
});

test('Cloudflare assets and app subdomain route are explicitly configured', () => {
  const wrangler = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(wrangler.assets.run_worker_first, true);
  assert.equal(wrangler.assets.html_handling, 'none');
  assert.equal(
    wrangler.routes.some((route: { pattern?: string; zone_name?: string }) => route.pattern === 'app.linkary.xyz/*' && route.zone_name === 'linkary.xyz'),
    true,
  );
});

test('app host serves the React shell at the clean root URL', async () => {
  const { env, requestedPaths } = makeEnv();
  const response = await worker.fetch(new Request('https://app.linkary.xyz/'), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(requestedPaths, ['/app/index.html']);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('app host serves the React shell for signup deep links', async () => {
  const { env, requestedPaths } = makeEnv();
  const response = await worker.fetch(new Request('https://app.linkary.xyz/signup'), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(requestedPaths, ['/app/index.html']);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('legacy app subdirectory canonicalizes to app host root without a loop', async () => {
  const { env, requestedPaths } = makeEnv();
  const response = await worker.fetch(new Request('https://app.linkary.xyz/app/'), env, ctx);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://app.linkary.xyz/');
  assert.deepEqual(requestedPaths, []);
});

test('public root explicitly fetches index.html and removes prototype controls in production', async () => {
  const { env, requestedPaths } = makeEnv();
  const response = await worker.fetch(new Request('https://linkary.xyz/'), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(requestedPaths, ['/index.html']);
  const html = await response.text();
  assert.equal(html.includes('class="preview-nav"'), false);
  assert.equal(html.includes('linkary-production-routing'), true);
});
