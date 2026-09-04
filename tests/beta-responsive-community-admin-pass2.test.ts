import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const community = readFileSync(new URL('../frontend/src/community-manager.css', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../frontend/src/community-verification-admin.css', import.meta.url), 'utf8');

function squash(value: string) {
  return value.replace(/\s+/g, '');
}

const communityCss = squash(community);
const adminCss = squash(admin);

test('Community Manager cards and proof content fail safe against long identity strings', () => {
  assert.equal(communityCss.includes('.community-manager-page,.community-manager-hero>*,.community-manager-grid>*,'), true);
  assert.equal(communityCss.includes('.community-mainstrong,.community-mainsmall,.community-mainp,'), true);
  assert.equal(communityCss.includes('overflow-wrap:anywhere;word-break:break-word;'), true);
});

test('Community Manager phone actions use practical mobile targets', () => {
  assert.equal(communityCss.includes('@media(max-width:640px)'), true);
  for (const selector of [
    '.community-actions.ops-button',
    '.community-row-actionsa',
    '.community-row-actionsbutton',
    '.community-proof-headingbutton',
    '.community-proof-codebutton',
  ]) {
    assert.equal(communityCss.includes(selector), true, `${selector} should be covered`);
  }
  assert.equal(communityCss.includes('min-height:44px;'), true);
});

test('Community Manager 430px layout keeps row actions and primary actions usable', () => {
  assert.equal(communityCss.includes('@media(max-width:430px)'), true);
  assert.equal(communityCss.includes('.community-row-actions{width:100%;'), true);
  assert.equal(communityCss.includes('.community-row-actionsa,.community-row-actionsbutton{flex:11 120px;'), true);
  assert.equal(communityCss.includes('.community-actions.ops-button{width:100%;'), true);
});

test('Superadmin Community review metadata and proof fail safe against long values', () => {
  assert.equal(adminCss.includes('.community-review-page,.community-review-list,.community-review-card,'), true);
  assert.equal(adminCss.includes('.community-review-headh2,.community-review-headsmall,.community-review-metaspan,'), true);
  assert.equal(adminCss.includes('overflow-wrap:anywhere;word-break:break-word;'), true);
});

test('Superadmin Community review phone actions remain reachable and 44px high', () => {
  assert.equal(adminCss.includes('@media(max-width:640px)'), true);
  assert.equal(adminCss.includes('.community-review-page>.ops-page-header>.ops-secondary,.community-review-actionsbutton,.community-review-proofa{min-height:44px;'), true);
  assert.equal(adminCss.includes('.community-review-page>.ops-page-header>.ops-secondary{width:100%;'), true);
});

test('Superadmin Community review stacks decision actions on 430px phones', () => {
  assert.equal(adminCss.includes('@media(max-width:430px)'), true);
  assert.equal(adminCss.includes('.community-review-actionsbutton{flex:11 100%;'), true);
});
