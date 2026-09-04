import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const inviteCss = readFileSync(new URL('../frontend/src/invites-beta-acceptance.css', import.meta.url), 'utf8');
const inviteView = readFileSync(new URL('../frontend/src/InviteExperience.tsx', import.meta.url), 'utf8');
const mainEntry = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');

function squash(value: string) {
  return value.replace(/\s+/g, '');
}

function mediaBlock(start: string, end?: string): string {
  const startIndex = inviteCss.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = end ? inviteCss.indexOf(end, startIndex + start.length) : -1;
  return inviteCss.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

const css = squash(inviteCss);
const view = squash(inviteView);

test('invite responsive acceptance stylesheet loads after shared acceptance layers', () => {
  const shared = mainEntry.indexOf("import './beta-responsive-acceptance.css';");
  const invite = mainEntry.indexOf("import './invites-beta-acceptance.css';");
  assert.notEqual(shared, -1);
  assert.notEqual(invite, -1);
  assert.equal(invite > shared, true);
});

test('invite creation, URL copy and row actions keep practical phone targets', () => {
  assert.equal(css.includes('.invite-workspace.invite-create-controlsselect,.invite-workspace.invite-create-controls.ops-button,.invite-workspace.invite-row-actionsbutton,.invite-workspace.invite-urlbutton,.invite-workspace.ops-empty.ops-button{min-height:44px;}'), true);
  assert.equal(css.includes('.invite-workspace.invite-create-controlsselect{height:44px;}'), true);
  assert.equal(css.includes('.invite-workspace.invite-urlinput{min-height:44px;}'), true);
});

test('long referral identities, metadata and messages fail safe on narrow layouts', () => {
  assert.equal(css.includes('overflow-wrap:anywhere'), true);
  assert.equal(css.includes('word-break:break-word'), true);
  for (const selector of ['.invite-workspace.invite-row-headstrong', '.invite-workspace.invite-metasp an'.replace(' ', ''), '.invite-workspace.ops-message']) {
    assert.equal(css.includes(selector), true, `${selector} should remain protected`);
  }
});

test('invite summary and referral rows reflow without fixed-width pressure', () => {
  const tablet = squash(mediaBlock('@media(max-width:700px)', '@media(max-width:520px)'));
  assert.equal(tablet.includes('.invite-workspace.invite-summary-card{grid-template-columns:repeat(2,minmax(0,1fr));}'), true);
  assert.equal(tablet.includes('.invite-workspace.invite-create-controls{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr)minmax(150px,auto);'), true);
  assert.equal(tablet.includes('.invite-workspace.invite-row{display:grid;grid-template-columns:minmax(0,1fr)auto;'), true);

  const phone = squash(mediaBlock('@media(max-width:520px)', '@media(max-width:430px)'));
  assert.equal(phone.includes('.invite-workspace.invite-summary-card{grid-template-columns:minmax(0,1fr);}'), true);
  assert.equal(phone.includes('.invite-workspace.invite-row{grid-template-columns:minmax(0,1fr);}'), true);
  assert.equal(phone.includes('.invite-workspace.invite-row-actions{grid-template-columns:repeat(2,minmax(0,1fr));width:100%;}'), true);
});

test('invite URLs stop behaving like a cramped inline field on 430px phones', () => {
  const phone = squash(mediaBlock('@media(max-width:430px)', '@media(max-width:340px)'));
  assert.equal(phone.includes('.invite-workspace.invite-url{grid-template-columns:minmax(0,1fr);border:0;gap:8px;overflow:visible;}'), true);
  assert.equal(phone.includes('.invite-workspace.invite-urlinput,.invite-workspace.invite-urlbutton{width:100%;border:1pxsolid#dedfdb;border-radius:7px;}'), true);
  assert.equal(phone.includes('.invite-workspace.invite-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));}'), true);
});

test('320-class invite rows can collapse identity, metadata and actions to one column', () => {
  const narrow = squash(mediaBlock('@media(max-width:340px)', '@media(prefers-reduced-motion:reduce)'));
  assert.equal(narrow.includes('.invite-workspace.invite-row-head{grid-template-columns:minmax(0,1fr);}'), true);
  assert.equal(narrow.includes('.invite-workspace.invite-meta,.invite-workspace.invite-row-actions{grid-template-columns:minmax(0,1fr);}'), true);
});

test('responsive invite hardening preserves referral attribution and credit behavior', () => {
  assert.equal(view.includes("apiJson<{balances:InviteBalance[]}>('/api/invites/balances')"), true);
  assert.equal(view.includes("apiJson<{invites:Invite[]}>('/api/invites/list')"), true);
  assert.equal(view.includes("body:JSON.stringify({ownerType:owner.type,ownerId:owner.id,expiresInDays:Number(expiryDays)})"), true);
  assert.equal(view.includes("body:JSON.stringify({action:'revoke',inviteId:invite.id})"), true);
  assert.equal(view.includes('Invitationrevokedandthecreditwasreturned.'), true);
  assert.equal(view.includes("visibleInvites=owner?invites.filter((invite)=>invite.owner_type===owner.type&&invite.owner_id===owner.id):[]"), true);
});
