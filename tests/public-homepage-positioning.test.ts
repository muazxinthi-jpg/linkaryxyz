import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';
import { enhancePublicHomepage } from '../src/homepagePricing';
import { serveStatic } from '../src/static';
import type { Env } from '../src/env';

const repo = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, repo), 'utf8');

test('approved editorial homepage keeps tracking-first positioning and honest evidence', async () => {
  const homepage = await read('index.html');
  assert.match(homepage, /Run growth anywhere\./);
  assert.match(homepage, /Track it in Linkary\./);
  assert.match(homepage, /External campaigns/);
  assert.match(homepage, /Manual entries, submissions, and estimates do not become verified automatically/);
  assert.doesNotMatch(homepage, /Cryptographic Consensus|Immutable Integrity Guarantee|Reserve Handle|session event tokens|50K\+|99\.8%/);
  assert.match(homepage, />Early supporters</);
  assert.doesNotMatch(homepage, />Illustrative artwork</);
  assert.match(homepage, /data-carousel/);
  const slides = JSON.parse(await read('assets/homepage/hero-slides.json'));
  assert.equal(slides.length, 1);
  assert.equal(slides[0].src, '/assets/homepage/linkary-early-supporters-01.png');
  assert.match(homepage, /data-carousel-image src="\/assets\/homepage\/linkary-early-supporters-01\.png"/);
  assert.match(homepage, /Member showcase \/ Coming soon/);
});

test('homepage keeps real app entry points and working section links', async () => {
  const homepage = await read('index.html');
  const ids = new Set([...homepage.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const match of homepage.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.has(match[1]), 'Missing section: ' + match[1]);
  }
  assert.match(homepage, /href="https:\/\/app\.linkary\.xyz\/signup"/);
  assert.match(homepage, /href="https:\/\/app\.linkary\.xyz\/login"/);
  assert.match(homepage, /href="\/bids"/);
  assert.match(homepage, /id="projects"/);
  assert.match(homepage, /id="creators"/);
  assert.match(homepage, /id="communities"/);
  assert.doesNotMatch(homepage, /mailto:|href="#"/);
});

test('homepage retains the real profile example and uses local visual assets', async () => {
  const homepage = await read('index.html');
  assert.match(homepage, /data-profile-example="muazxinthi"/);
  assert.match(homepage, /href="https:\/\/linkary\.xyz\/muazxinthi"/);
  for (const match of homepage.matchAll(/<img[^>]+src="([^"]+)"/g)) {
    assert.ok(match[1].startsWith('/assets/'), 'Images must be local assets');
    await access(new URL(match[1].slice(1), repo));
  }
  assert.doesNotMatch(homepage, /cdn\.tailwindcss\.com|aida-public/);
});

test('production homepage pipeline preserves editorial HTML and a single live pricing renderer', async () => {
  const homepage = await read('index.html');
  const requested: string[] = [];
  const env: Env = {
    APP_ENV: 'production',
    APP_BASE_URL: 'https://app.linkary.xyz',
    PUBLIC_SITE_URL: 'https://linkary.xyz',
    ASSETS: { async fetch(input) {
      requested.push(new URL(typeof input === 'string' ? input : input.url).pathname);
      return new Response(homepage, { headers: { 'content-type': 'text/html', etag: 'stale' } });
    } },
  };
  for (const path of ['/', '/index.html']) {
    const request = new Request('https://linkary.xyz' + path);
    const response = await enhancePublicHomepage(request, await serveStatic(request, env));
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('etag'), null);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    assert.equal((html.match(/src="\/pricing-home\.js"/g) || []).length, 1);
    assert.doesNotMatch(html, /src="\/pricing-catalog\.js"|linkary-production-shell-fixes/);
    assert.match(html, /class="linkary-editorial"/);
    assert.match(html, /href="https:\/\/app\.linkary\.xyz\/signup"/);
  }
  assert.deepEqual(requested, ['/index.html', '/index.html']);
});
