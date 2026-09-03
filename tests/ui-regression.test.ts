import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const partnerCss = readFileSync(new URL('../frontend/src/partner-discovery-stabilization.css', import.meta.url), 'utf8');
const workspaceMobileCss = readFileSync(new URL('../frontend/src/workspace-mobile.css', import.meta.url), 'utf8');

test('Partner Discovery avatars are clipped and scaled safely', () => {
  assert.match(partnerCss, /\.partner-discovery-v1\s+\.partner-avatar\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(partnerCss, /\.partner-discovery-v1\s+\.partner-avatar img\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*cover/s);
});

test('Partner Discovery includes required responsive acceptance widths', () => {
  assert.match(partnerCss, /@media\s*\(max-width:\s*430px\)/);
  assert.match(partnerCss, /@media\s*\(max-width:\s*320px\)/);
  assert.match(partnerCss, /grid-template-columns:\s*repeat\(auto-fit,/);
});

test('Partner Discovery mobile actions keep practical tap targets', () => {
  assert.match(partnerCss, /@media\s*\(max-width:\s*430px\)[\s\S]*min-height:\s*44px/);
});

test('Project phone navigation keeps six primary destinations', () => {
  assert.match(workspaceMobileCss, /\.workspace-project\s+\.ops-nav a\[href="\/settings\/team-invites"\]\s*\{display:none!important\}/);
  assert.match(workspaceMobileCss, /\.workspace-project\s+\.ops-nav\s*\{[\s\S]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)!important/s);
});

test('Phone navigation never regresses to tiny text or undersized targets', () => {
  assert.doesNotMatch(workspaceMobileCss, /font-size:\s*(?:8|9|10)px!important/);
  assert.match(workspaceMobileCss, /font-size:12px!important/);
  assert.match(workspaceMobileCss, /min-height:44px!important/);
});

test('Hidden phone destinations remain intentionally reachable through workspace flows', () => {
  assert.match(workspaceMobileCss, /a\[href="\/tracking"\]/);
  assert.match(workspaceMobileCss, /a\[href="\/partners"\]/);
  assert.match(workspaceMobileCss, /a\[href="\/wallets"\]/);
});
