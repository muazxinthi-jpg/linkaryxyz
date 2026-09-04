import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profileCss = readFileSync(new URL('../frontend/src/profile-beta-acceptance.css', import.meta.url), 'utf8');
const profileView = readFileSync(new URL('../frontend/src/ProfileExperienceBeta.tsx', import.meta.url), 'utf8');
const mainEntry = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');

function squash(value: string) {
  return value.replace(/\s+/g, '');
}

function mediaBlock(start: string, end?: string): string {
  const startIndex = profileCss.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = end ? profileCss.indexOf(end, startIndex + start.length) : -1;
  return profileCss.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

const view = squash(profileView);

test('profile responsive acceptance stylesheet is loaded after the shared acceptance layer', () => {
  const shared = mainEntry.indexOf("import './beta-responsive-acceptance.css';");
  const profile = mainEntry.indexOf("import './profile-beta-acceptance.css';");
  assert.notEqual(shared, -1);
  assert.notEqual(profile, -1);
  assert.equal(profile > shared, true);
});

test('profile editor identity and publish actions keep practical phone targets', () => {
  assert.match(profileCss, /\.profile-beta-head-actions \.ops-button[^{}]*\{[^}]*min-height:44px/);
  assert.match(profileCss, /\.profile-beta-save-row \.ops-button[^{}]*\{[^}]*min-height:44px/);
  const phone = mediaBlock('@media (max-width: 700px)', '@media (max-width: 430px)');
  assert.equal(phone.includes('.profile-beta-head-actions .ops-button'), true);
  assert.equal(phone.includes('width: 100%'), true);
  assert.match(phone, /\.profile-beta-identity-grid input,[\s\S]*?min-height: 44px/);
});

test('profile sections and long destinations fail safe on narrow phones', () => {
  assert.equal(profileCss.includes('overflow-wrap: anywhere'), true);
  assert.equal(profileCss.includes('.profile-beta-block-copy strong'), true);
  assert.equal(profileCss.includes('.profile-beta-block-copy small'), true);
  const phone = mediaBlock('@media (max-width: 430px)', '@media (max-width: 340px)');
  assert.match(phone, /\.profile-beta-block-copy small\{[^}]*white-space: normal[^}]*overflow: visible[^}]*text-overflow: clip/);
  assert.match(phone, /\.profile-beta-block-actions\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(phone, /\.profile-beta-block-actions button\{[^}]*width: 100%/);
});

test('quick add, social and NFT controls reflow safely at 430 and 340px', () => {
  const phone = mediaBlock('@media (max-width: 430px)', '@media (max-width: 340px)');
  const narrow = mediaBlock('@media (max-width: 340px)', '@media (prefers-reduced-motion: reduce)');
  assert.match(phone, /\.profile-beta-quick-add > div:last-child\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(phone, /\.profile-beta-social-picker > div\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(phone, /\.profile-beta-nft-grid,[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(narrow, /\.profile-beta-social-picker > div,[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});

test('profile section modal stays inside the dynamic phone viewport', () => {
  assert.match(profileCss, /\.profile-beta-modal\{[^}]*width: min\(620px, calc\(100vw - 32px\)\)[^}]*max-height: min\(840px, calc\(100dvh - 32px\)\)/);
  const phone = mediaBlock('@media (max-width: 430px)', '@media (max-width: 340px)');
  assert.match(phone, /\.profile-beta \.ops-modal-backdrop\{[^}]*align-items: end[^}]*padding: 8px/);
  assert.match(phone, /\.profile-beta-modal\{[^}]*width: calc\(100vw - 16px\)[^}]*max-height: calc\(100dvh - 16px\)/);
  assert.match(phone, /\.profile-beta-modal \.ops-modal-head button\{[^}]*width: 44px[^}]*height: 44px/);
  assert.match(phone, /\.profile-beta-modal \.ops-form-actions\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
});

test('public preview remains contained and evidence/verification boundaries stay explicit', () => {
  assert.match(profileCss, /\.profile-beta-public-preview\{[^}]*width: 100%[^}]*max-width: 100%[^}]*box-sizing: border-box/);
  assert.match(profileCss, /\.profile-beta-public-preview iframe\{[^}]*max-width: 100%/);
  assert.equal(view.includes("if(error.code==='verification_required')return'VerifytheXidentityforthisprofilebeforepublishing.';"), true);
  assert.equal(view.includes("constaction=data.visibility==='published'?'unpublish':'publish';"), true);
  assert.equal(view.includes('LinkaryProofisaddedautomaticallyfromcampaignevidence,nottypedmetrics.'), true);
  assert.equal(view.includes('Manuallyaddedaddressesarenotsigning-verificationproof.'), true);
  assert.equal(view.includes('https://linkary.xyz/${profile.username}?editorPreview=${previewRevision}'), true);
});
