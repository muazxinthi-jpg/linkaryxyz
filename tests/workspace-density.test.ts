import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const main = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');
const density = readFileSync(new URL('../frontend/src/workspace-density.css', import.meta.url), 'utf8');
const profileAccess = readFileSync(new URL('../frontend/src/ProfileAccessExperience.tsx', import.meta.url), 'utf8');
const profileBeta = readFileSync(new URL('../frontend/src/ProfileExperienceBeta.tsx', import.meta.url), 'utf8');
const compact = density.replace(/\s+/g, '');

test('workspace density is the final shared frontend layer', () => {
  const optimization = main.indexOf("import './workspace-optimization.css';");
  const densityImport = main.indexOf("import './workspace-density.css';");
  assert.notEqual(optimization, -1);
  assert.equal(densityImport > optimization, true);
});

test('wide workspaces use the available canvas without weakening readable copy', () => {
  assert.equal(compact.includes('--workspace-max-width:1720px'), true);
  assert.equal(compact.includes('grid-template-columns:var(--workspace-sidebar-width)minmax(0,1fr)'), true);
  assert.equal(compact.includes('.ops-shell.ops-page{width:100%;max-width:var(--workspace-max-width)'), true);
  assert.equal(compact.includes('max-width:760px'), true);
  assert.equal(compact.includes('.ops-shell.bid-auction-grid{grid-template-columns:repeat(4,minmax(0,1fr))}'), true);
});

test('tablet and phone shell contracts remain explicit and safe-area aware', () => {
  assert.equal(density.includes('@media(min-width:641px) and (max-width:900px)'), true);
  assert.equal(density.includes('@media(max-width:640px)'), true);
  assert.equal(density.includes('calc(62px + env(safe-area-inset-bottom))'), true);
  assert.equal(density.includes('calc(104px + env(safe-area-inset-bottom))'), true);
});

test('profile monetization stays inside the sticky workspace shell', () => {
  assert.equal(profileAccess.includes('footer={<><PromotionOwnerPanel profile={profile} />'), true);
  assert.equal(profileBeta.includes('<div className="profile-beta-footer">{footer}</div>'), true);
  assert.equal(compact.includes('.ops-shell.profile-beta-footer.promotion-owner-panel{width:100%;max-width:none;margin:0;}'), true);
});

test('workspace heroes use the Linkary orange accent', () => {
  assert.equal(density.includes('box-shadow:inset 4px 0 #ff4f0a'), true);
  assert.equal(density.includes('rgba(255,79,10,.10)'), true);
});
