import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profileEditor = readFileSync('frontend/src/ProfileExperienceBeta.tsx', 'utf8');
const card = readFileSync('frontend/src/ProfileSocialCard.tsx', 'utf8');
const styles = readFileSync('frontend/src/profile-social-card.css', 'utf8');

test('profile edit page restores the approved shareable card under public preview', () => {
  assert.match(profileEditor, /import ProfileSocialCard from '\.\/ProfileSocialCard'/);
  assert.match(profileEditor, /<ProfileSocialCard/);
  assert.match(profileEditor, /PUBLIC PROFILE PREVIEW/);
  assert.match(card, /YOUR SOCIAL CARD/);
  assert.match(card, /Expand card/);
  assert.match(card, /Copy card image/);
  assert.match(card, /Copy profile link/);
});

test('share card stays evidence-safe when richer provider analytics are unavailable', () => {
  assert.match(card, /X data not available/);
  assert.match(card, /No measured reach available/);
  assert.match(card, /No impression data available/);
  assert.match(card, /Your measured click history will appear here/);
  assert.doesNotMatch(card, /Math\.random/);
});

test('share card keeps the approved responsive landscape canvas', () => {
  assert.match(styles, /width:1120px;height:660px/);
  assert.match(styles, /\.lsc-dialog/);
  assert.match(styles, /@media\(max-width:600px\)/);
});
