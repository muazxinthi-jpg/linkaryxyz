import test from 'node:test';
import assert from 'node:assert/strict';
import { isSystemRoute, normalizeProfileUsername } from '../src/routes/onboarding';

test('authenticated workspace routes cannot be claimed as public profile usernames', () => {
  for (const route of [
    'dashboard',
    'campaigns',
    'tracking',
    'profile',
    'invites',
    'settings',
    'wallets',
    'partners',
    'opportunities',
  ]) {
    assert.equal(isSystemRoute(route), true, `${route} must stay reserved`);
  }
});

test('ordinary valid usernames remain claimable', () => {
  for (const username of ['muazxinthi', 'klineoxyz', 'akari_house']) {
    assert.equal(normalizeProfileUsername(username), username);
    assert.equal(isSystemRoute(username), false);
  }
});

test('reserved route checks are case-insensitive', () => {
  assert.equal(isSystemRoute('Opportunities'), true);
  assert.equal(isSystemRoute('PARTNERS'), true);
  assert.equal(isSystemRoute('Wallets'), true);
});
