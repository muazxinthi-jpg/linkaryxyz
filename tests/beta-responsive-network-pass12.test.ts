import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const networkCss = readFileSync(new URL('../frontend/src/network-beta-acceptance.css', import.meta.url), 'utf8');
const networkView = readFileSync(new URL('../frontend/src/NetworkExperience.tsx', import.meta.url), 'utf8');
const mainEntry = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');

function squash(value: string) {
  return value.replace(/\s+/g, '');
}

function mediaBlock(start: string, end?: string): string {
  const startIndex = networkCss.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = end ? networkCss.indexOf(end, startIndex + start.length) : -1;
  return networkCss.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

const css = squash(networkCss);
const view = squash(networkView);

test('Project network responsive acceptance loads after shared and wallet acceptance layers', () => {
  const shared = mainEntry.indexOf("import './beta-responsive-acceptance.css';");
  const wallets = mainEntry.indexOf("import './wallets-beta-acceptance.css';");
  const network = mainEntry.indexOf("import './network-beta-acceptance.css';");
  assert.notEqual(shared, -1);
  assert.notEqual(wallets, -1);
  assert.notEqual(network, -1);
  assert.equal(network > shared, true);
  assert.equal(network > wallets, true);
});

test('network search, tabs and relationship actions keep practical mobile targets', () => {
  assert.equal(css.includes('.network-workspace.ops-tabsbutton,.network-workspace.network-toolbarinput,.network-workspace.network-toolbar.ops-button,.network-workspace.network-actionsbutton,.network-workspace.ops-heading-row>.ops-button,.network-workspace.ops-empty.ops-button,.network-workspace.ops-callout.ops-button{min-height:44px;}'), true);
  assert.equal(css.includes('.network-workspace.network-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));'), true);
  const phone = squash(mediaBlock('@media(max-width:700px)', '@media(max-width:430px)'));
  assert.equal(phone.includes('.network-workspace.network-actions{grid-template-columns:repeat(2,minmax(0,1fr));}'), true);
  const compact = squash(mediaBlock('@media(max-width:430px)', '@media(max-width:340px)'));
  assert.equal(compact.includes('.network-workspace.network-actions,.network-workspace.ops-modal.ops-form-actions{grid-template-columns:minmax(0,1fr);}'), true);
});

test('long creator, community, profile and note content fails safe on narrow layouts', () => {
  assert.equal(css.includes('overflow-wrap:anywhere'), true);
  assert.equal(css.includes('word-break:break-word'), true);
  const phone = squash(mediaBlock('@media(max-width:700px)', '@media(max-width:430px)'));
  assert.equal(phone.includes('.network-workspace.network-card-headstrong{white-space:normal;overflow:visible;text-overflow:clip;}'), true);
  assert.equal(phone.includes('.network-workspace.network-url{min-height:44px;display:flex;align-items:center;white-space:normal;overflow:visible;text-overflow:clip;}'), true);
});

test('network toolbar and verification badge stop squeezing card identity on phones', () => {
  const phone = squash(mediaBlock('@media(max-width:430px)', '@media(max-width:340px)'));
  assert.equal(phone.includes('.network-workspace.network-toolbarform{grid-template-columns:minmax(0,1fr);gap:8px;}'), true);
  assert.equal(phone.includes('.network-workspace.network-card-head{grid-template-columns:38pxminmax(0,1fr);align-items:start;}'), true);
  assert.equal(phone.includes('.network-workspace.network-verify{grid-column:1/-1;justify-self:start;max-width:100%;white-space:normal;}'), true);
});

test('network editor and campaign attachment modals stay inside dynamic phone viewport', () => {
  assert.equal(css.includes('.network-workspace.ops-modal{width:min(620px,calc(100vw-32px));max-width:100%;max-height:min(840px,calc(100dvh-32px));'), true);
  const phone = squash(mediaBlock('@media(max-width:700px)', '@media(max-width:430px)'));
  assert.equal(phone.includes('.network-workspace.ops-modal-backdrop{align-items:end;padding:8px;}'), true);
  assert.equal(phone.includes('.network-workspace.ops-modal{width:calc(100vw-16px);max-height:calc(100dvh-16px);'), true);
  assert.equal(phone.includes('.network-workspace.ops-modal.ops-modal-headbutton{flex:0044px;width:44px;height:44px;min-width:44px;min-height:44px;}'), true);
  assert.equal(phone.includes('.network-workspace.ops-modalinput,.network-workspace.ops-modalselect,.network-workspace.ops-modaltextarea{width:100%;min-width:0;min-height:44px;}'), true);
});

test('320-class network cards can collapse identity and metrics to one column', () => {
  const narrow = squash(mediaBlock('@media(max-width:340px)', '@media(prefers-reduced-motion:reduce)'));
  assert.equal(narrow.includes('.network-workspace.network-card-head{grid-template-columns:minmax(0,1fr);}'), true);
  assert.equal(narrow.includes('.network-workspace.network-metrics{grid-template-columns:minmax(0,1fr);}'), true);
});

test('responsive Project network hardening preserves verification, write-role and activity evidence boundaries', () => {
  assert.equal(view.includes("project.status==='active'&&project.verification_status==='verified_x'&&['owner','admin','marketing_manager'].includes(project.role)"), true);
  assert.equal(view.includes("apiJson('/api/network-entities',{method:'POST'"), true);
  assert.equal(view.includes('requestVerification:true'), true);
  assert.equal(view.includes("apiJson('/api/campaign-activity-participants',{method:'POST'"), true);
  assert.equal(view.includes('JSON.stringify({entityId:attachEntity.id,activityId,role:participantRole})'), true);
  assert.equal(view.includes('Attachtoactivity'), true);
});
