import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Community desktop layout presents summary, Telegram identity and paired portfolio forms', () => {
  const css = readFileSync(new URL('../frontend/src/community-manager.css', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../frontend/src/CommunityManagerExperience.tsx', import.meta.url), 'utf8');
  assert.match(css, /\.community-manager-page\s*\{width:100%;max-width:none;gap:22px/);
  assert.match(css, /\.community-manager-page \.community-manager-grid\s*\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.ok(ui.indexOf('community-manager-stats') < ui.indexOf('community-telegram-card'));
  assert.ok(ui.indexOf('community-telegram-card') < ui.indexOf('community-manager-grid'));
});

test('Optional Telegram verification still does not gate Community creation', () => {
  const ui = readFileSync(new URL('../frontend/src/CommunityManagerExperience.tsx', import.meta.url), 'utf8');
  assert.equal(ui.includes('Personal Telegram verification is optional.'), true);
  assert.equal(ui.includes('Create Community Portfolio'), true);
  assert.equal(ui.includes('Add a Community'), true);
  assert.equal(ui.includes('fieldset disabled={!manager || busy === \'community\'}'), true);
});
