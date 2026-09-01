import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalInviteCode } from '../src/inviteCodes';
import { sha256 } from '../src/security/crypto';

test('human Linkary invite codes are case-insensitive', async () => {
  const mixed = 'LNK-OWNER-nbQtdRoru8eYeyrxuFTF-UCA';
  const upper = mixed.toUpperCase();
  assert.equal(canonicalInviteCode(mixed), upper);
  assert.equal(await sha256(mixed), await sha256(upper));
});

test('already-issued owner bootstrap invite remains compatible with its stored hash', async () => {
  const upper = 'LNK-OWNER-NBQTDRORU8EYEYRXUFTF-UCA';
  assert.equal(await sha256(upper), 'dEY_v7d7voY9U9kpAR1sfWH12yz3yBPu5PAR4JJiolI');
});

test('non-human tokens retain exact hashing behavior', async () => {
  assert.notEqual(await sha256('abc'), await sha256('ABC'));
});
