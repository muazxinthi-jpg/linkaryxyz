import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const growthCss = readFileSync(new URL('../frontend/src/growth-beta-acceptance.css', import.meta.url), 'utf8');
const growthView = readFileSync(new URL('../frontend/src/GrowthExperience.tsx', import.meta.url), 'utf8');
const lifecycleView = readFileSync(new URL('../frontend/src/CampaignLifecycleActions.tsx', import.meta.url), 'utf8');
const mainEntry = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');

function squash(value: string) {
  return value.replace(/\s+/g, '');
}

function mediaBlock(start: string, end?: string): string {
  const startIndex = growthCss.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = end ? growthCss.indexOf(end, startIndex + start.length) : -1;
  return growthCss.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

const css = squash(growthCss);
const view = squash(growthView);
const lifecycle = squash(lifecycleView);

test('Growth responsive acceptance stylesheet is loaded after shared acceptance CSS', () => {
  const shared = mainEntry.indexOf("import './beta-responsive-acceptance.css';");
  const growth = mainEntry.indexOf("import './growth-beta-acceptance.css';");
  assert.notEqual(shared, -1);
  assert.notEqual(growth, -1);
  assert.equal(growth > shared, true);
});

test('Growth tabs and campaign actions keep practical phone targets and long content fails safe', () => {
  assert.equal(css.includes('.growth-workspace.growth-tabsbutton,.growth-workspace.growth-campaign-actionsbutton,.growth-workspace.growth-report-actions.ops-button{min-height:44px;}'), true);
  assert.equal(css.includes('.growth-workspace.growth-tabs{overflow-x:auto;'), true);
  assert.equal(css.includes('overflow-wrap:anywhere'), true);
  const phone = squash(mediaBlock('@media (max-width:700px)', '@media (max-width:430px)'));
  assert.equal(phone.includes('.growth-workspace.growth-campaign-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));'), true);
  assert.equal(phone.includes('.growth-workspace.growth-campaign-actions>.campaign-lifecycle-control{grid-column:1/-1;width:100%;}'), true);
});

test('Founder growth report becomes a labeled card layout instead of an 840px phone table', () => {
  const phone = squash(mediaBlock('@media (max-width:700px)', '@media (max-width:430px)'));
  assert.equal(phone.includes('.growth-workspace.growth-report-table{overflow:visible;}'), true);
  assert.equal(phone.includes('.growth-workspace.growth-report-row.header{display:none;}'), true);
  assert.equal(phone.includes('.growth-workspace.growth-report-row:not(.header){min-width:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));'), true);
  for (const label of ['Source', 'Spend', 'Clicks', 'Outcomes', 'Value', 'Return']) {
    assert.equal(phone.includes(`content:'${label}'`), true, `${label} label should remain in the mobile report card`);
  }
  const narrow = squash(mediaBlock('@media (max-width:340px)', '@media (prefers-reduced-motion:reduce)'));
  assert.equal(narrow.includes('.growth-workspace.growth-report-row:not(.header){grid-template-columns:minmax(0,1fr);'), true);
});

test('Growth report and campaign controls stack cleanly at 430px', () => {
  const phone = squash(mediaBlock('@media (max-width:430px)', '@media (max-width:340px)'));
  assert.equal(phone.includes('.growth-workspace.growth-campaign-stats,.growth-workspace.growth-campaign-actions,.growth-workspace.growth-report-actions>div:last-child{grid-template-columns:minmax(0,1fr);}'), true);
  assert.equal(phone.includes('.growth-workspace.growth-campaign-actions>*,.growth-workspace.growth-campaign-actionsbutton{width:100%;}'), true);
});

test('Growth modals stay inside the dynamic phone viewport with reachable controls', () => {
  assert.equal(css.includes('.growth-workspace.ops-modal{width:min(620px,calc(100vw-32px));max-width:100%;max-height:min(840px,calc(100dvh-32px));'), true);
  const phone = squash(mediaBlock('@media (max-width:700px)', '@media (max-width:430px)'));
  assert.equal(phone.includes('.growth-workspace.ops-modal-backdrop{align-items:end;padding:8px;}'), true);
  assert.equal(phone.includes('.growth-workspace.ops-modal{width:calc(100vw-16px);max-height:calc(100dvh-16px);'), true);
  assert.equal(phone.includes('.growth-workspace.ops-modal.ops-modal-headbutton{flex:0044px;width:44px;height:44px;min-height:44px;}'), true);
  assert.equal(phone.includes('.growth-workspace.ops-modal.ops-field-grid.two,.growth-workspace.ops-modal.ops-form-actions{grid-template-columns:minmax(0,1fr);}'), true);
});

test('Growth acceptance does not weaken campaign or evidence semantics', () => {
  assert.equal(view.includes('CampaignLifecycleActions'), true);
  assert.equal(view.includes('ThesefiguresonlyuserecordedLinkaryevidence.Missingspendoroutcomedataisleftoutratherthanestimated.'), true);
  assert.equal(lifecycle.includes('Completingthecampaigndoesnotcreateperformanceproof.'), true);
  assert.equal(lifecycle.includes('Attributionconfidenceisnotchanged.'), true);
});
