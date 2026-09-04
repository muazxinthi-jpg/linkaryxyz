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

const css = squash(profileCss);
const view = squash(profileView);

test('profile responsive acceptance stylesheet is loaded after the shared acceptance layer', () => {
  const shared = mainEntry.indexOf("import './beta-responsive-acceptance.css';");
  const profile = mainEntry.indexOf("import './profile-beta-acceptance.css';");
  assert.notEqual(shared, -1);
  assert.notEqual(profile, -1);
  assert.equal(profile > shared, true);
});

test('profile editor identity and publish actions keep practical phone targets', () => {
  for (const selector of [
    '.profile-beta-head-actions .ops-button',
    '.profile-beta-save-row .ops-button',
    '.profile-beta .ops-section-title > .ops-button',
    '.profile-beta-avatar-actions .ops-button',
    '.profile-beta-seo-fields .ops-button',
  ]) {
    assert.equal(profileCss.includes(selector), true, `${selector} should be covered`);
  }
  assert.equal(css.includes('min-height:44px;box-sizing:border-box;'), true);

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
  assert.match(phone, /\.profile-beta-block-copy small\s*\{[^}]*white-space: normal[^}]*overflow: visible[^}]*text-overflow: clip/);
  assert.match(phone, /\.profile-beta-block-actions\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(phone, /\.profile-beta-block-actions button\s*\{[^}]*width: 100%/);
});

test('quick add, social and NFT controls reflow safely at 430 and 340px', () => {
  const phone = mediaBlock('@media (max-width: 430px)', '@media (max-width: 340px)');
  const narrow = mediaBlock('@media (max-width: 340px)', '@media (prefers-reduced-motion: reduce)');
  assert.match(phone, /\.profile-beta-quick-add > div:last-child\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(phone, /\.profile-beta-social-picker > div\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(phone, /\.profile-beta-nft-grid,[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(narrow, /\.profile-beta-social-picker > div,[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});

test('profile section modal stays inside the dynamic phone viewport', () => {
  assert.equal(
    css.includes('.profile-beta-modal{width:min(620px,calc(100vw-32px));max-height:min(840px,calc(100dvh-32px));'),
    true,
  );
  const phone = squash(mediaBlock('@media (max-width: 430px)', '@media (max-width: 340px)'));
  assert.equal(phone.includes('.profile-beta.ops-modal-backdrop{align-items:end;padding:8px;'), true);
  assert.equal(phone.includes('.profile-beta-modal{width:calc(100vw-16px);max-height:calc(100dvh-16px);'), true);
  assert.equal(phone.includes('.profile-beta-modal.ops-modal-headbutton{width:44px;height:44px;flex-basis:44px;'), true);
  assert.equal(phone.includes('.profile-beta-modal.ops-form-actions{display:grid;grid-template-columns:minmax(0,1fr);width:100%;'), true);
});

test('public preview remains contained and evidence/verification boundaries stay explicit', () => {
  assert.equal(
    css.includes('.profile-beta-public-preview{width:100%;max-width:100%;box-sizing:border-box;'),
    true,
  );
  assert.equal(css.includes('.profile-beta-public-previewiframe{max-width:100%;'), true);
  assert.equal(view.includes("if(error.code==='verification_required')return'VerifytheXidentityforthisprofilebeforepublishing.';"), true);
  assert.equal(view.includes("constaction=data.visibility==='published'?'unpublish':'publish';"), true);
  assert.equal(view.includes('LinkaryProofisaddedautomaticallyfromcampaignevidence,nottypedmetrics.'), true);
  assert.equal(view.includes('Manuallyaddedaddressesarenotsigning-verificationproof.'), true);
  assert.equal(view.includes('https://linkary.xyz/${profile.username}?editorPreview=${previewRevision}'), true);
});
