import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const walletCss = readFileSync(new URL('../frontend/src/wallets-beta-acceptance.css', import.meta.url), 'utf8');
const walletView = readFileSync(new URL('../frontend/src/WalletExperience.tsx', import.meta.url), 'utf8');
const mainEntry = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');

function squash(value: string) {
  return value.replace(/\s+/g, '');
}

function mediaBlock(start: string, end?: string): string {
  const startIndex = walletCss.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = end ? walletCss.indexOf(end, startIndex + start.length) : -1;
  return walletCss.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

const css = squash(walletCss);
const view = squash(walletView);

test('wallet responsive acceptance stylesheet loads after shared and invite acceptance layers', () => {
  const shared = mainEntry.indexOf("import './beta-responsive-acceptance.css';");
  const invites = mainEntry.indexOf("import './invites-beta-acceptance.css';");
  const wallets = mainEntry.indexOf("import './wallets-beta-acceptance.css';");
  assert.notEqual(shared, -1);
  assert.notEqual(invites, -1);
  assert.notEqual(wallets, -1);
  assert.equal(wallets > shared, true);
  assert.equal(wallets > invites, true);
});

test('wallet copy, edit, remove and transfer controls keep practical mobile targets', () => {
  assert.equal(css.includes('.wallet-workspace.wallet-addressbutton,.wallet-workspace.wallet-editorinput,.wallet-workspace.wallet-editor.ops-button,.wallet-workspace.wallet-actionsbutton,.wallet-workspace.wallet-transfer-actionsbutton,.wallet-workspace.wallet-receive-panel.ops-button{min-height:44px;}'), true);
  assert.equal(css.includes('.wallet-workspace.wallet-addressbutton{min-width:58px;'), true);
  assert.equal(css.includes('.wallet-workspace.wallet-actions,.wallet-workspace.wallet-transfer-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));'), true);
});

test('wallet addresses and safety copy fail safe instead of forcing horizontal overflow', () => {
  assert.equal(css.includes('overflow-wrap:anywhere'), true);
  assert.equal(css.includes('word-break:break-word'), true);
  const phone = squash(mediaBlock('@media(max-width:430px)', '@media(max-width:340px)'));
  assert.equal(phone.includes('.wallet-workspace.wallet-address{display:grid;grid-template-columns:minmax(0,1fr);'), true);
  assert.equal(phone.includes('.wallet-workspace.wallet-addresscode{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere;word-break:break-all;}'), true);
  assert.equal(phone.includes('.wallet-workspace.wallet-addresscode,.wallet-workspace.wallet-addressbutton{width:100%;min-width:0;'), true);
});

test('wallet editor and destructive actions collapse cleanly on 430px phones', () => {
  const phone = squash(mediaBlock('@media(max-width:430px)', '@media(max-width:340px)'));
  assert.equal(phone.includes('.wallet-workspace.wallet-editor>div,.wallet-workspace.wallet-actions,.wallet-workspace.wallet-transfer-actions{grid-template-columns:minmax(0,1fr);}'), true);
  assert.equal(css.includes('.wallet-workspace.wallet-actionsbutton.danger{border-color:#ead8d4;background:#fffafa;color:#99493d;}'), true);
});

test('embedded wallet receive panel is visibly contained and sending remains disabled', () => {
  assert.equal(css.includes('.wallet-workspace.wallet-receive-panel{display:grid;'), true);
  assert.equal(css.includes('.wallet-workspace.wallet-transfer-actionsbutton:disabled{cursor:not-allowed;opacity:.55;}'), true);
  assert.equal(view.includes('<buttondisabledtitle="Securewalletsendingisnotavailableyet">Send<span>Comingsoon</span></button>'), true);
  assert.equal(view.includes('OnlysendsupportedassetsontheBasenetworktothisaddress.'), true);
});

test('320-class wallet warnings and card badges can collapse to one column', () => {
  const narrow = squash(mediaBlock('@media(max-width:340px)', '@media(prefers-reduced-motion:reduce)'));
  assert.equal(narrow.includes('.wallet-workspace.wallet-warning{display:grid;grid-template-columns:minmax(0,1fr);}'), true);
  assert.equal(narrow.includes('.wallet-workspace.wallet-card-top{display:grid;grid-template-columns:minmax(0,1fr);}'), true);
  assert.equal(narrow.includes('.wallet-workspace.wallet-managed,.wallet-workspace.wallet-state{justify-self:start;}'), true);
});

test('responsive wallet hardening preserves destination and custody safety semantics', () => {
  assert.equal(view.includes('/api/profile-wallets?profileId='), true);
  assert.equal(view.includes("body:JSON.stringify({profileId:profile.id,chainFamily,address:form[chainFamily],action:'save'})"), true);
  assert.equal(view.includes("body:JSON.stringify({profileId:profile.id,chainFamily,action:'remove'})"), true);
  assert.equal(view.includes('AdditionalwalletaddressesdonotneedtobeconnectedtoLinkary.'), true);
  assert.equal(view.includes('Blockchaintransferstothewrongaddresscannotbereversed.'), true);
  assert.equal(view.includes('Onlysavewalletsyoucontrol.'), true);
  assert.equal(view.includes('ItdoesnotconnectthatwallettoLinkaryorgiveLinkarycontrolofit.'), true);
});
