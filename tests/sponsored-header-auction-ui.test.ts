import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../frontend/src/AppV3.tsx', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../frontend/src/ProfileAccessExperience.tsx', import.meta.url), 'utf8');
const promotion = readFileSync(new URL('../frontend/src/PromotionAuctionExperience.tsx', import.meta.url), 'utf8');
const paymentPanel = readFileSync(new URL('../frontend/src/PromotionAuctionPaymentPanel.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/promotion-auction.css', import.meta.url), 'utf8');
const workspaceCss = readFileSync(new URL('../frontend/src/workspace-mobile.css', import.meta.url), 'utf8');

test('editable profiles expose sponsored header monetization controls', () => {
  assert.match(profile, /PromotionOwnerPanel/);
  assert.match(promotion, /Sponsored header auction/);
  assert.match(promotion, /Enable monetization/);
  assert.match(promotion, /6 hours/);
  assert.match(promotion, /12 hours/);
  assert.match(promotion, /24 hours/);
});

test('profile owner can configure a free preferred project header', () => {
  assert.match(promotion, /Free featured project/);
  assert.match(promotion, /Project name/);
  assert.match(promotion, /Banner image URL/);
  assert.match(promotion, /Destination URL/);
  assert.match(promotion, /Show free header/);
  assert.match(promotion, /Save featured header/);
  assert.match(promotion, /no active paid sponsored header/);
  assert.match(promotion, /featured-header/);
});

test('profile monetization remains inside the editable workspace shell', () => {
  assert.match(profile, /createPortal/);
  assert.match(profile, /profile-beta-editor-column/);
  assert.match(profile, /EditableProfileExtensions/);
  assert.doesNotMatch(profile, /<ProfileExperienceIdentityV1[^>]*\s*\/>\s*<PromotionOwnerPanel/);
});

test('desktop workspace keeps sidebar stationary and scrolls only main content', () => {
  assert.match(workspaceCss, /@media \(min-width:901px\)/);
  assert.match(workspaceCss, /\.ops-shell\{[\s\S]*?height:100dvh;[\s\S]*?overflow:hidden;/);
  assert.match(workspaceCss, /\.ops-sidebar\{[\s\S]*?height:100dvh;[\s\S]*?overflow:hidden;/);
  assert.match(workspaceCss, /\.ops-main\{[\s\S]*?height:100dvh;[\s\S]*?overflow-y:auto;/);
});

test('authenticated bidder flow pays from Linkary Wallet and then unlocks creative submission', () => {
  assert.match(app, /\/promotion-auction\//);
  assert.match(app, /PromotionAuctionExperience/);
  assert.match(promotion, /Place bid/);
  assert.match(promotion, /PromotionAuctionPaymentPanel/);
  assert.match(promotion, /Submit banner/);
  assert.doesNotMatch(promotion, /Transaction hash/);
  assert.match(paymentPanel, /useSendUsdc/);
  assert.match(paymentPanel, /network: 'base'/);
  assert.match(paymentPanel, /ETH for gas/);
  assert.match(paymentPanel, /USDC available/);
  assert.match(paymentPanel, /Pay \$\{requiredUsdc\} USDC/);
  assert.match(paymentPanel, /payment\/verify/);
  assert.match(paymentPanel, /Check confirmation/);
});

test('CTA choices are fixed and sponsored UI has responsive styling', () => {
  for (const label of ['Join', 'Register', 'Book now', 'Learn more', 'Visit', 'Explore', 'Trade', 'Mint', 'Buy', 'View']) {
    assert.ok(promotion.includes(`'${label}'`) || promotion.includes(`>${label}<`), `${label} CTA should be present`);
  }
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /promotion-auction-card/);
  assert.match(css, /promotion-wallet-checkout/);
});
