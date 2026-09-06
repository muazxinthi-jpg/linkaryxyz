import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/0013_project_network_entities.sql', import.meta.url), 'utf8');
const route = readFileSync(new URL('../src/routes/activities.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../frontend/src/TrackingExperience.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/tracking-assignment.css', import.meta.url), 'utf8');

test('one campaign supports many contributor activities without another campaign record', () => {
  assert.match(migration, /campaign_activity_participants/);
  assert.match(migration, /activity_id TEXT NOT NULL REFERENCES campaign_activities/);
  assert.match(migration, /UNIQUE\(activity_id, entity_id\)/);
  assert.match(ui, /One campaign can include many Creators and Communities/);
  assert.match(ui, /not a new campaign/);
});

test('campaign Evidence shows an aggregated contributor roster', () => {
  assert.match(route, /FROM campaign_activity_participants p/);
  assert.match(route, /participantsByActivity/);
  assert.match(route, /is_exact_linkary_assignment/);
  assert.match(ui, /const campaignTeam = useMemo/);
  assert.match(ui, /CAMPAIGN TEAM/);
  assert.match(ui, /campaignTeam\.creators/);
  assert.match(ui, /campaignTeam\.communities/);
  assert.match(ui, /campaignTeam\.unassigned/);
  assert.match(ui, /Private network record/);
  assert.match(ui, /Exact Linkary identity/);
  assert.match(ui, /member\.activities === 1 \? 'contribution' : 'contributions'/);
});

test('project teams can quickly add several contributors to the same campaign', () => {
  assert.match(ui, /data-add-another="true"/);
  assert.match(ui, /Save \+ add another/);
  assert.match(ui, /Add the next Creator or Community/);
});

test('campaign team layout remains usable on mobile', () => {
  assert.match(css, /\.campaign-team-stats\s*\{[\s\S]*grid-template-columns: repeat\(4/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.campaign-team-stats \{ grid-template-columns: repeat\(2/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.campaign-member-list \{ display: grid/);
});
