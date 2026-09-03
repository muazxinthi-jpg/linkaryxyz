import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const css = readFileSync(new URL('../frontend/src/profile-beta.css', import.meta.url), 'utf8');
const enhancer = readFileSync(new URL('../src/routes/publicProfileEnhancer.ts', import.meta.url), 'utf8');
const platforms = ['x','linkedin','tiktok','facebook','instagram','youtube','telegram','whatsapp','reddit','discord','github','farcaster'];

test('known social networks ship local brand SVG assets', () => {
  for (const platform of platforms) {
    assert.equal(existsSync(new URL(`../assets/social/${platform}.svg`, import.meta.url)), true, `missing ${platform} brand asset`);
    assert.equal(css.includes(`/assets/social/${platform}.svg`), true, `picker does not use ${platform} brand asset`);
  }
});

test('public social links use the same brand SVG assets rather than text marks', () => {
  assert.equal(enhancer.includes('/assets/social/${escapeHtml(platform)}.svg'), true);
  for (const placeholder of ["profile-social-letter">r/", "profile-social-letter">GH", "profile-social-letter">F"]) {
    assert.equal(enhancer.includes(placeholder), false, `legacy placeholder remains: ${placeholder}`);
  }
});

test('social picker selected state preserves brand artwork', () => {
  assert.equal(css.includes("button.active{border-color:#111517;background:#f5f5f2"), true);
  assert.equal(css.includes("button:nth-child(13) b:after{content:'+'"), true);
});
