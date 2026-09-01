import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalInviteCode } from '../src/inviteCodes';
import { sha256 } from '../src/security/crypto';

test('human Linkary invite codes are case-insensitive', async () => {
  const mixed = 'LNK-OWNER-nbQtdRoru8eYeyrxuFTF-UCA';
  const upper = mixed.toUpperCase();
  assert.equal(canonicalInviteCode(mixed), upper);
  assert.equal(await sha256(mixed), await sha256(upper));
  assert.equal(await sha256(upper), 'ZetNxKAgJ3lN0DzvyD14t4t62Bvyolk8EYr3nq8o0nU');
});

test('non-human tokens retain exact hashing behavior', async () => {
  assert.notEqual(await sha256('abc'), await sha256('ABC'));
});
