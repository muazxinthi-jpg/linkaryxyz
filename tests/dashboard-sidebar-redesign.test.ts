import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const shell = readFileSync(new URL('frontend/src/ProductWorkspace.tsx', root), 'utf8');
const entry = readFileSync(new URL('frontend/src/main.tsx', root), 'utf8');
const sidebarCss = readFileSync(new URL('frontend/src/dashboard-sidebar-redesign.css', root), 'utf8');

test('sidebar redesign keeps the existing Creator destinations and Account route', () => {
  for (const label of ['Overview', 'Analytics', 'Inbox', 'Bids', 'Opportunities', 'Communities', 'Partners', 'Profile', 'Wallets', 'Invites', 'Projects', 'Account']) {
    assert.ok(shell.includes(`'${label}'`), `missing existing sidebar destination: ${label}`);
  }
  assert.match(shell, /\['\/account', 'Account'\]/);
  assert.match(shell, /\['\/analytics', 'Analytics'\]/);
});

test('refreshed sidebar styling loads after the existing workspace density rules', () => {
  assert.ok(entry.indexOf("import './workspace-density.css'") < entry.indexOf("import './dashboard-sidebar-redesign.css'"));
  assert.match(sidebarCss, /--linkary-sidebar-ink:#1d3047/);
  assert.match(sidebarCss, /--linkary-sidebar-accent:#f15a32/);
  assert.match(sidebarCss, /@media\(min-width:901px\)/);
  assert.match(sidebarCss, /prefers-reduced-motion:reduce/);
  assert.ok(sidebarCss.includes('@media(max-width:900px)'));
  assert.ok(sidebarCss.includes('@media(max-width:640px)'));
  assert.match(sidebarCss, /\.ops-shell \.ops-sidebar\{box-sizing:border-box;width:100%;min-width:0/);
  assert.match(sidebarCss, /\.ops-shell \.ops-main\{box-sizing:border-box;width:100%;min-width:0\}/);
  assert.match(sidebarCss, /\.ops-shell \.ops-topbar\{width:100%;height:64px;box-sizing:border-box/);
  assert.match(sidebarCss, /@media\(max-width:1200px\).*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.ok(sidebarCss.includes('ops-nav a:hover .ops-nav-icon'));
  assert.ok(sidebarCss.includes('ops-nav a.active .ops-nav-icon'));
  assert.match(shell, /function WorkspaceIcon\(/);
  assert.match(shell, /className="ops-nav-icon"/);
  assert.match(shell, /className="ops-brand-mark"/);
  for (const icon of ['Overview', 'Analytics', 'Invites', 'Projects', 'Account', 'Plan & billing', 'Log out']) {
    assert.ok(shell.includes(`${icon}:`) || shell.includes(`'${icon}':`), `missing icon mapping for ${icon}`);
  }
});
