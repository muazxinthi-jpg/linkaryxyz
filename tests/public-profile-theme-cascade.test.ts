import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/routes/publicProfileEnhancer.ts', import.meta.url), 'utf8');

test('enhanced public profile stylesheet is appended after all base styles', () => {
  assert.equal(source.includes('id="linkary-enhanced-theme"'), true);
  assert.equal(source.includes('html.replace(\'</head>\', `<style id="linkary-enhanced-theme">${extraCss()}</style></head>`)'), true);
  assert.equal(source.includes("html.replace('</style>', `${extraCss()}</style>`)"), false);
});

test('light canvas and orange matrix remain explicitly enforced', () => {
  assert.equal(source.includes('background:rgba(255,255,255,.92)!important'), true);
  assert.equal(source.includes('width:min(1180px,calc(100% - 64px))!important'), true);
  assert.equal(source.includes('opacity:.64!important;mix-blend-mode:multiply!important'), true);
  assert.equal(source.includes('color:#111!important;font-size:clamp(34px,3.6vw,52px)!important'), true);
});
