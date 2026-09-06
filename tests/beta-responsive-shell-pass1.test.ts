import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../frontend/src/ProductWorkspace.tsx', import.meta.url), 'utf8');
const superadminWorkspace = readFileSync(new URL('../frontend/src/SuperadminWorkspace.tsx', import.meta.url), 'utf8');
const responsive = readFileSync(new URL('../frontend/src/beta-responsive-acceptance.css', import.meta.url), 'utf8');

function compact(value: string) {
  return value.replace(/\s+/g, ' ');
}

const css = compact(responsive);

test('Beta responsive acceptance overrides load after the existing UI styles', () => {
  const responsiveImport = main.indexOf("import './beta-responsive-acceptance.css';");
  const previousImport = main.indexOf("import './dashboard-polish.css';");
  assert.notEqual(responsiveImport, -1);
  assert.notEqual(previousImport, -1);
  assert.equal(responsiveImport > previousImport, true);
});

test('phone workspace keeps the intended fixed bottom navigation after tablet cascade rules', () => {
  assert.equal(responsive.includes('@media (max-width: 640px)'), true);
  assert.equal(css.includes('.ops-sidebar { position: fixed;'), true);
  assert.equal(css.includes('bottom: 0;'), true);
  assert.equal(css.includes('height: calc(62px + env(safe-area-inset-bottom));'), true);
  assert.equal(css.includes('.ops-brand, .ops-view-as, .ops-sidebar-footer { display: none;'), true);
});

test('phone content clears the fixed navigation and iOS safe area', () => {
  assert.equal(css.includes('padding-bottom: calc(104px + env(safe-area-inset-bottom)) !important;'), true);
  assert.equal(css.includes('bottom: calc(76px + env(safe-area-inset-bottom));'), true);
});

test('phone users retain access to hidden workspace destinations, Superadmin tools and logout', () => {
  assert.equal(workspace.includes('ops-mobile-account-menu'), true);
  assert.equal(workspace.includes('ops-mobile-menu-panel'), true);
  assert.equal(workspace.includes('key={`mobile-${path}`}'), true);
  assert.equal(workspace.match(/Log out/g)?.length >= 2, true);

  assert.equal(superadminWorkspace.includes('ops-mobile-account-menu'), true);
  assert.equal(superadminWorkspace.includes('ops-mobile-menu-panel'), true);
  assert.equal(superadminWorkspace.includes('Beta readiness'), true);
  assert.equal(superadminWorkspace.includes('Creator access'), true);
  assert.equal(superadminWorkspace.includes('Community reviews'), true);
  assert.equal(superadminWorkspace.includes('Commercial accounts'), true);
  assert.equal(superadminWorkspace.includes('Coupons'), true);
  assert.equal(superadminWorkspace.match(/Log out/g)?.length >= 2, true);

  assert.equal(css.includes('.ops-mobile-account-menu { display: none;'), true);
  assert.equal(css.includes('.ops-mobile-account-menu { display: block; position: relative;'), true);
  assert.equal(css.includes('.ops-topbar .ops-mobile-menu-panel a, .ops-mobile-menu-panel button { width: 100%; min-height: 44px;'), true);
});

test('common Beta mobile actions retain practical 44px interaction targets', () => {
  for (const selector of [
    '.ops-modal-head button',
    '.inbox-actions button',
    '.network-actions button',
    '.invite-row-actions button',
    '.wallet-actions button',
    '.profile-block-actions button',
    '.ops-card-action',
  ]) {
    assert.equal(responsive.includes(selector), true, `${selector} should be protected by the responsive acceptance layer`);
  }
  assert.equal(css.includes('min-height: 44px !important;'), true);
  assert.equal(css.includes('.ops-modal-head button { width: 44px; height: 44px; min-width: 44px; min-height: 44px;'), true);
});

test('narrow layouts wrap long identity and action content instead of forcing document overflow', () => {
  assert.equal(css.includes('max-width: 100vw; overflow-x: clip;'), true);
  assert.equal(css.includes('overflow-wrap: anywhere;'), true);
  assert.equal(css.includes('.network-card-head { grid-template-columns: 38px minmax(0, 1fr);'), true);
  assert.equal(css.includes('.inbox-copy > div:first-child { align-items: flex-start; flex-wrap: wrap;'), true);
  assert.equal(css.includes('.profile-save-row { align-items: stretch; flex-direction: column;'), true);
});

test('320px-class dashboards can collapse metric cards to one readable column', () => {
  assert.equal(responsive.includes('@media (max-width: 340px)'), true);
  assert.equal(css.includes('.dashboard-next-metrics { grid-template-columns: 1fr;'), true);
});
