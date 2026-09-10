import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profiles = readFileSync('src/routes/profiles.ts', 'utf8');
const rendererStart = profiles.indexOf('const previewFallback =');
const rendererEnd = profiles.indexOf('const ctaHtml =', rendererStart);
const renderer = profiles.slice(rendererStart, rendererEnd);

test('resolved public profile media keeps the previously-good rendering path', () => {
  assert.ok(rendererStart >= 0 && rendererEnd > rendererStart);
  assert.match(renderer, /resolved\?\.kind === 'video'[\s\S]*<video src="\$\{escapeHtml\(resolved\.src\)\}"/);
  assert.match(renderer, /resolved\?\.kind === 'image'[\s\S]*<img src="\$\{escapeHtml\(resolved\.src\)\}"/);
  assert.doesNotMatch(renderer, /class=\\"/);
});

test('fallback previews are isolated from existing title spans', () => {
  assert.match(renderer, /return `<div class="\$\{className\}">/);
  assert.match(renderer, /\.showcase-item>span,.product-item>span/);
  assert.match(renderer, /\.feature-site-preview>div,.showcase-site-preview>div/);
});

test('Featured Work is count-aware through the three-column maximum', () => {
  assert.match(renderer, /const countClass = className === 'image-showcase' \? ` count-\$\{Math\.min\(items\.length, 3\)\}` : '';/);
  assert.match(renderer, /\.image-showcase\.count-1 \.showcase-grid\{grid-template-columns:1fr!important\}/);
  assert.match(renderer, /\.image-showcase\.count-2 \.showcase-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important\}/);
  assert.match(renderer, /\.image-showcase\.count-3 \.showcase-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important\}/);
});
