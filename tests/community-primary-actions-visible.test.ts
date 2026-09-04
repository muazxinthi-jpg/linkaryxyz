import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Community onboarding keeps primary manager and community forms above optional Telegram status', () => {
  const css = readFileSync(new URL('../frontend/src/community-manager.css', import.meta.url), 'utf8');
  assert.match(css, /\.community-manager-page\s*>\s*\.community-manager-grid\s*\{\s*order:2;\s*\}/s);
  assert.match(css, /\.community-manager-page\s*>\s*\.community-list-card\s*\{\s*order:3;\s*\}/s);
});

test('Optional Telegram verification still does not gate Community creation', () => {
  const ui = readFileSync(new URL('../frontend/src/CommunityManagerExperience.tsx', import.meta.url), 'utf8');
  assert.equal(ui.includes('Optional for Beta'), true);
  assert.equal(ui.includes('Create Community Portfolio'), true);
  assert.equal(ui.includes('Add a community'), true);
  assert.equal(ui.includes('fieldset disabled={!manager || busy === \'community\'}'), true);
});
