import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../frontend/src/partner-discovery-stabilization.css', import.meta.url), 'utf8');

test('Partner Discovery avatars are clipped and scaled safely', () => {
  assert.match(css, /\.partner-discovery-v1\s+\.partner-avatar\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.partner-discovery-v1\s+\.partner-avatar img\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*cover/s);
});

test('Partner Discovery includes required responsive acceptance widths', () => {
  assert.match(css, /@media\s*\(max-width:\s*430px\)/);
  assert.match(css, /@media\s*\(max-width:\s*320px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit,/);
});

test('Partner Discovery mobile actions keep practical tap targets', () => {
  assert.match(css, /@media\s*\(max-width:\s*430px\)[\s\S]*min-height:\s*44px/);
});
