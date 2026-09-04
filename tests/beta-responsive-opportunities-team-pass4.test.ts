import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const opportunityCss = readFileSync(new URL('../frontend/src/creator-opportunities.css', import.meta.url), 'utf8');
const teamCss = readFileSync(new URL('../frontend/src/team-invites.css', import.meta.url), 'utf8');

function squash(value: string) {
  return value.replace(/\s+/g, '');
}

const opportunities = squash(opportunityCss);
const team = squash(teamCss);

test('Creator Opportunities styles the real search control used by the live TSX', () => {
  assert.equal(opportunities.includes('.creator-opportunity-search{width:min(330px,38vw);'), true);
  assert.equal(opportunities.includes('.creator-opportunity-searchinput{min-width:0;flex:1;'), true);
  assert.equal(opportunities.includes('.creator-opportunity-search:focus-within'), true);
});

test('Creator Opportunities toolbar and search stay usable on phone widths', () => {
  assert.equal(opportunities.includes('@media(max-width:760px)'), true);
  assert.equal(opportunities.includes('.creator-opportunity-toolbar{align-items:stretch;flex-direction:column;gap:12px}'), true);
  assert.equal(opportunities.includes('.creator-opportunity-toolbar.ops-tabsbutton{min-height:44px}'), true);
  assert.equal(opportunities.includes('.creator-opportunity-search{width:100%;min-height:44px}'), true);
  assert.equal(opportunities.includes('.creator-opportunity-searchbutton{width:44px;height:44px}'), true);
});

test('Creator Opportunity cards fail safe against long project, brief and deliverable content', () => {
  assert.equal(opportunities.includes('.creator-opportunity-head>span,.creator-opportunity-cardh3,.creator-opportunity-card>small,.creator-opportunity-card>p,.creator-opportunity-detailstrong'), true);
  assert.equal(opportunities.includes('overflow-wrap:anywhere;word-break:break-word'), true);
  assert.equal(opportunities.includes('@media(max-width:430px)'), true);
  assert.equal(opportunities.includes('.creator-opportunity-head{align-items:flex-start;flex-direction:column}'), true);
});

test('Creator Opportunity application modal stays inside narrow phone viewports', () => {
  assert.equal(opportunities.includes('.creator-opportunities.ops-modal{width:min(520px,calc(100vw-24px));max-width:100%;box-sizing:border-box}'), true);
  assert.equal(opportunities.includes('.creator-opportunities.ops-form-actions.ops-button{min-height:44px}'), true);
  assert.equal(opportunities.includes('.creator-opportunities.ops-modal{width:calc(100vw-20px)}'), true);
});

test('Project Team invitation identities and URLs fail safe against long content', () => {
  assert.equal(team.includes('.team-invite-workspace,.team-invite-principle,.team-invite-created,.team-invite-list,.team-invite-members'), true);
  assert.equal(team.includes('.team-invite-createdspan,.team-invite-copysmall,.team-invite-membersstrong,.team-invite-memberssmall,.team-invite-membersarticle>span{overflow-wrap:anywhere;word-break:break-word}'), true);
  assert.equal(team.includes('.team-invite-copystrong{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere;word-break:break-word;'), true);
});

test('Project Team phone controls keep practical 44px targets', () => {
  assert.equal(team.includes('@media(max-width:640px)'), true);
  assert.equal(team.includes('.team-invite-forminput,.team-invite-formselect,.team-invite-form.ops-button{min-height:44px}'), true);
  assert.equal(team.includes('.team-invite-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));'), true);
  assert.equal(team.includes('.team-invite-actionsbutton{min-height:44px;width:100%;'), true);
  assert.equal(team.includes('@media(max-width:430px){.team-invite-principle>div{padding:14px}.team-invite-actions{grid-template-columns:1fr}'), true);
});

test('Project Team member rows and acceptance card scale to 320-class phones', () => {
  assert.equal(team.includes('.team-invite-membersarticle{grid-template-columns:44pxminmax(0,1fr);align-items:start;'), true);
  assert.equal(team.includes('.team-invite-membersarticle>span{grid-column:2;justify-self:start}'), true);
  assert.equal(team.includes('.team-invite-accept-card.ops-button{min-height:44px;max-width:100%}'), true);
  assert.equal(team.includes('@media(max-width:340px)'), true);
  assert.equal(team.includes('.team-invite-accept-cardh1{font-size:22px}'), true);
});
