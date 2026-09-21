import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const discoveryUi = readFileSync(new URL('../frontend/src/PartnerDiscoveryExperience.tsx', import.meta.url), 'utf8');
const discoveryCss = readFileSync(new URL('../frontend/src/partner-discovery-stitch.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../frontend/src/main.tsx', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../frontend/src/ProductWorkspace.tsx', import.meta.url), 'utf8');

test('Partners redesign keeps the existing real-data fields and actions', () => {
  for (const field of ['accepted_campaigns', 'x_handle', 'community_count', 'verified_communities', 'combined_audience', 'tracked_clicks', 'verified_outcomes', 'attributed_value_usd']) {
    assert.equal(discoveryUi.includes(field), true, `expected existing backend field: ${field}`);
  }
  for (const action of ['View relationship', 'Why this match?', 'Shortlist', 'Work again', 'Start inquiry', 'View Communities']) {
    assert.equal(discoveryUi.includes(action), true, `expected existing partner action: ${action}`);
  }
  assert.equal(discoveryUi.includes('partner-filter-chip'), true, 'selected filters should be visible and removable');
  assert.equal(discoveryUi.includes('partner-save-button'), true, 'cards should have the Stitch-style save shortcut');
  assert.equal(discoveryUi.includes('aria-label="Partner type"'), true);
  assert.equal(discoveryUi.includes('aria-label={type === \'creator\' ? \'Search creators by name, handle, or bio\''), true);
});

test('Partners redesign is scoped to the page and covers desktop, tablet, and narrow mobile layouts', () => {
  assert.equal(main.includes("import './partner-discovery-stitch.css';"), true);
  assert.equal(workspace.includes("currentPath === '/partners' ? ' partners-workspace-page'"), true);
  assert.equal(discoveryCss.includes('.partner-discovery-v1'), true);
  assert.equal(discoveryCss.includes('--pd-canvas: #f8f9ff;'), true);
  assert.equal(discoveryCss.includes('.ops-page.partners-workspace-page'), true);
  assert.equal(discoveryCss.includes('max-width: none;'), true);
  assert.equal(discoveryCss.includes('grid-template-columns: repeat(auto-fit, minmax(min(100%, 410px), 1fr))'), true);
  assert.equal(discoveryCss.includes('@media (max-width: 900px)'), true);
  assert.equal(discoveryCss.includes('@media (max-width: 430px)'), true);
  assert.equal(discoveryCss.includes('@media (max-width: 360px)'), true);
  assert.equal(discoveryCss.includes('grid-template-columns: minmax(0, 1fr)'), true);
  assert.equal(discoveryCss.includes('.partner-discovery-v1 .partner-card-foot .network-actions .collab-inquiry-open'), true);
});

