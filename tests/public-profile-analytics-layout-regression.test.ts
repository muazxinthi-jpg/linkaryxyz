import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profiles = readFileSync('src/routes/profiles.ts', 'utf8');
const editor = readFileSync('frontend/src/ProfileExperienceBeta.tsx', 'utf8');
const card = readFileSync('frontend/src/ProfileSocialCard.tsx', 'utf8');

test('profile analytics restores measured monthly history and destination contribution', () => {
  assert.match(profiles, /GROUP BY substr\(created_at, 1, 7\)/);
  assert.match(profiles, /GROUP BY block_id/);
  assert.match(profiles, /monthlyClicks: monthlyClickSeries\(monthRows, linkClicks\)/);
  assert.match(profiles, /platformClicks,/);
  assert.match(editor, /platformClicks: analyticsResult\.platformClicks \?\? \[\]/);
  assert.match(editor, /proof: analyticsResult\.proof \?\? null/);
  assert.match(card, /onPointerEnter=\{\(\) => setPoint\(i\)\}/);
  assert.match(card, /Hover or touch to explore/);
});

test('featured work layout is count-aware while larger collections stay responsive', () => {
  assert.match(profiles, /className === 'image-showcase' && items\.length === 1/);
  assert.match(profiles, /grid-template-columns:1fr!important/);
  assert.match(profiles, /className === 'image-showcase' && items\.length === 2/);
  assert.match(profiles, /repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(profiles, /showcase \$\{className\} count-\$\{items\.length\}/);
  assert.match(profiles, /image-showcase\.count-1 \.showcase-item/);
});

test('public media retains shared metadata resolution and has a nonblank global fallback', () => {
  assert.match(profiles, /await resolveFeaturedPreview\(config\.mediaUrl, block\.url, block\.block_type\)/);
  assert.match(profiles, /const previewFallback = \(block: ProfileBlockRow/);
  assert.match(profiles, /ARTICLE PREVIEW/);
  assert.match(profiles, /showcase-site-preview/);
  assert.match(profiles, /nextElementSibling/);
});
