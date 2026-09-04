import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const inboxCss = readFileSync(new URL('../frontend/src/inbox-beta-acceptance.css', import.meta.url), 'utf8');
const inboxView = readFileSync(new URL('../frontend/src/InboxExperience.tsx', import.meta.url), 'utf8');
const mainEntry = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');

function squash(value: string) {
  return value.replace(/\s+/g, '');
}

function mediaBlock(start: string, end?: string): string {
  const startIndex = inboxCss.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = end ? inboxCss.indexOf(end, startIndex + start.length) : -1;
  return inboxCss.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

const css = squash(inboxCss);
const view = squash(inboxView);

test('Inbox responsive acceptance stylesheet loads after shared and collaboration layers', () => {
  const collaboration = mainEntry.indexOf("import './collaboration-inquiry.css';");
  const shared = mainEntry.indexOf("import './beta-responsive-acceptance.css';");
  const inbox = mainEntry.indexOf("import './inbox-beta-acceptance.css';");
  assert.notEqual(collaboration, -1);
  assert.notEqual(shared, -1);
  assert.notEqual(inbox, -1);
  assert.equal(inbox > collaboration, true);
  assert.equal(inbox > shared, true);
});

test('Inbox identities, messages and sent inquiry content fail safe against long values', () => {
  assert.equal(css.includes('overflow-wrap:anywhere'), true);
  assert.equal(css.includes('word-break:break-word'), true);
  for (const selector of ['.inbox-copystrong', '.inbox-sent-copystrong', '.inbox-updatesstrong', '.inquiry-activation-targetstrong']) {
    assert.equal(css.includes(selector), true, `${selector} should be protected`);
  }
});

test('Inbox decisions become practical responsive controls rather than a cramped action strip', () => {
  assert.equal(css.includes('.inbox-workspace.inbox-actionsa,.inbox-workspace.inbox-actionsbutton'), true);
  assert.equal(css.includes('min-height:44px'), true);
  const phone = squash(mediaBlock('@media(max-width:700px)', '@media(max-width:430px)'));
  assert.equal(phone.includes('.inbox-workspace.inbox-actions{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));'), true);
  assert.equal(phone.includes('.inbox-workspace.inbox-actions>a,.inbox-workspace.inbox-actions>button{width:100%;min-width:0;white-space:normal;}'), true);
  const compact = squash(mediaBlock('@media(max-width:430px)', '@media(max-width:340px)'));
  assert.equal(compact.includes('.inbox-workspace.inbox-actions,.inbox-workspace.inbox-sent-actions,.inbox-workspace.inquiry-activation-modal.ops-form-actions{grid-template-columns:minmax(0,1fr);}'), true);
});

test('Sent inquiries and Project access updates keep full-width reachable actions on phones', () => {
  const phone = squash(mediaBlock('@media(max-width:700px)', '@media(max-width:430px)'));
  assert.equal(phone.includes('.inbox-workspace.inbox-sent-inquiriesarticle{grid-template-columns:minmax(0,1fr);'), true);
  assert.equal(phone.includes('.inbox-workspace.inbox-sent-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%;}'), true);
  assert.equal(phone.includes('.inbox-workspace.inbox-updatesarticle>a,.inbox-workspace.inbox-updatesarticle>button{grid-column:1/-1;width:100%;justify-self:stretch;}'), true);
  const compact = squash(mediaBlock('@media(max-width:430px)', '@media(max-width:340px)'));
  assert.equal(compact.includes('.inbox-workspace.inbox-updatesarticle{grid-template-columns:minmax(0,1fr);}'), true);
});

test('Explicit activation modal stays inside the dynamic phone viewport with reachable form controls', () => {
  assert.equal(css.includes('.inbox-workspace.inquiry-activation-modal{width:min(680px,calc(100vw-32px));max-width:100%;max-height:min(860px,calc(100dvh-32px));'), true);
  const phone = squash(mediaBlock('@media(max-width:700px)', '@media(max-width:430px)'));
  assert.equal(phone.includes('.inbox-workspace.ops-modal-backdrop{align-items:end;padding:8px;}'), true);
  assert.equal(phone.includes('.inbox-workspace.inquiry-activation-modal{width:calc(100vw-16px);max-height:calc(100dvh-16px);'), true);
  assert.equal(phone.includes('.inbox-workspace.inquiry-activation-modal.ops-modal-headbutton{flex:0044px;width:44px;height:44px;min-width:44px;min-height:44px;}'), true);
  assert.equal(phone.includes('.inbox-workspace.inquiry-activation-forminput,.inbox-workspace.inquiry-activation-formselect{width:100%;min-width:0;min-height:44px;}'), true);
});

test('320-class Inbox cards can collapse icon, copy and actions without horizontal pressure', () => {
  const narrow = squash(mediaBlock('@media(max-width:340px)', '@media(prefers-reduced-motion:reduce)'));
  assert.equal(narrow.includes('.inbox-workspace.inbox-list>article{grid-template-columns:minmax(0,1fr);}'), true);
  assert.equal(narrow.includes('.inbox-workspace.inbox-copy,.inbox-workspace.inbox-actions{grid-column:1;}'), true);
});

test('Inbox responsive hardening preserves inquiry and evidence boundaries', () => {
  assert.equal(view.includes('Acceptedmeansthepartnerisopentodiscussion.CampaignactivationisaseparateexplicitProjectaction,andproofstillrequirestrackedorverifiedevidence.'), true);
  assert.equal(view.includes('Thisstepassignstheacceptedpartnertocampaignactivity.Campaignproofstillappearsonlyaftertrackedorverifiedevidenceexists.Notrackinglinksoroutcomesarecreatedautomatically.'), true);
  assert.equal(view.includes('TheexactCommunity,notonlyitsmanager,willownthecampaignevidence.'), true);
  assert.equal(view.includes('Activitiesassignedtoadifferentpartnerarehiddentopreventaccidentalreplacement.'), true);
  assert.equal(view.includes('Trackingandproofremainevidence-driven.'), true);
});
