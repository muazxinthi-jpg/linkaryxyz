import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const partnerCss = readFileSync(new URL('../frontend/src/partner-discovery-stabilization.css', import.meta.url), 'utf8');
const workspaceMobileCss = readFileSync(new URL('../frontend/src/mobile-workspace-navigation.css', import.meta.url), 'utf8');
const productWorkspace = readFileSync(new URL('../frontend/src/ProductWorkspace.tsx', import.meta.url), 'utf8');

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

test('phone shell keeps five primary routes and provides a drawer for every workspace destination', () => {
  assert.match(workspaceMobileCss, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(productWorkspace, /id="ops-mobile-drawer" role="dialog" aria-modal="true"/);
  assert.match(productWorkspace, /navSections\.map\(\(\[section, items\]\)/);
  assert.match(productWorkspace, /\['\/tracking', 'Evidence'\]/);
  assert.match(productWorkspace, /\['\/settings\/team-invites', 'Team'\]/);
});

test('Phone navigation never regresses to tiny text or undersized targets', () => {
  assert.match(workspaceMobileCss, /min-height:50px/);
  assert.match(workspaceMobileCss, /min-height:44px/);
});

test('Hidden phone destinations remain intentionally reachable through workspace flows', () => {
  assert.match(productWorkspace, /\['\/tracking', 'Evidence'\]/);
  assert.match(productWorkspace, /\['\/partners', 'Partners'\]/);
  assert.match(productWorkspace, /\['\/wallets', 'Wallets'\]/);
  assert.match(productWorkspace, /navSections\.map\(\(\[section, items\]\)/);
});
