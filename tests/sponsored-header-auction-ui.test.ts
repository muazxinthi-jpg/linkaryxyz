import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../frontend/src/ProfileAccessExperience.tsx', import.meta.url), 'utf8');
const promotion = readFileSync(new URL('../frontend/src/PromotionAuctionExperience.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/promotion-auction.css', import.meta.url), 'utf8');

test('editable profiles expose sponsored header monetization controls', () => {
  assert.match(profile, /PromotionOwnerPanel/);
  assert.match(promotion, /Sponsored header auction/);
  assert.match(promotion, /Enable monetization/);
  assert.match(promotion, /6 hours/);
  assert.match(promotion, /12 hours/);
  assert.match(promotion, /24 hours/);
});

test('authenticated bidder flow is routable and includes payment plus creative steps', () => {
  assert.match(app, /\/promotion-auction\//);
  assert.match(app, /PromotionAuctionExperience/);
  assert.match(promotion, /Place bid/);
  assert.match(promotion, /Verify existing payment/);
  assert.match(promotion, /Submit banner/);
  assert.match(promotion, /Transaction hash/);
});

test('CTA choices are fixed and sponsored UI has responsive styling', () => {
  for (const label of ['Join', 'Register', 'Book now', 'Learn more', 'Visit', 'Explore', 'Trade', 'Mint', 'Buy', 'View']) {
    assert.ok(promotion.includes(`'${label}'`) || promotion.includes(`>${label}<`), `${label} CTA should be present`);
  }
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /promotion-auction-card/);
});
