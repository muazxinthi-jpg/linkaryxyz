import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const projectCss = readFileSync(new URL('../frontend/src/project-beta.css', import.meta.url), 'utf8');
const projectView = readFileSync(new URL('../frontend/src/ProjectExperienceBeta.tsx', import.meta.url), 'utf8');

function squash(value: string) {
  return value.replace(/\s+/g, '');
}

const css = squash(projectCss);
const view = squash(projectView);

test('Project Control tabs and actions keep practical phone targets', () => {
  assert.equal(css.includes('.project-beta-tabs{min-width:0;overflow-x:auto;'), true);
  assert.equal(css.includes('.project-beta-tabsbutton{flex:00auto;min-height:44px;'), true);
  assert.equal(css.includes('.project-beta-review-actionsbutton'), true);
  assert.equal(css.includes('.project-beta-member-actionsbutton{min-height:44px;'), true);
  assert.equal(css.includes('.project-beta-transfer-controls.ops-button'), true);
});

test('long Project, member, request and partner identities fail safe', () => {
  for (const selector of [
    '.project-beta.ops-project-toolbarstrong',
    '.project-beta-request-liststrong',
    '.project-beta-member-copystrong',
    '.project-beta-partnersstrong',
    '.project-beta-register-notespan',
  ]) {
    assert.equal(css.includes(selector), true, `${selector} should be covered`);
  }
  assert.equal(css.includes('overflow-wrap:anywhere;word-break:break-word;'), true);
  assert.equal(css.includes('.project-beta-state,.project-beta-request-status,.project-beta-owner{max-width:100%;white-space:normal;'), true);
});

test('Project search, role management and shortlist controls stack at 430px', () => {
  assert.equal(css.includes('@media(max-width:430px)'), true);
  assert.equal(css.includes('.project-beta-review-actions,.project-beta-member-actions,.project-beta-partnersarticle>div:last-child,.project-beta-transfer-controls,.project-beta-search,.project-beta-member-search,.project-beta-modal.ops-form-actions{display:grid;grid-template-columns:minmax(0,1fr);width:100%;'), true);
  assert.equal(css.includes('.project-beta-member-actionsselect,.project-beta-member-actionsbutton'), true);
  assert.equal(css.includes('.project-beta-partnersselect,.project-beta-partners.ops-button'), true);
  assert.equal(css.includes('.project-beta-searchinput,.project-beta-search.ops-button'), true);
});

test('Project access modal stays inside phone viewport with accessible actions', () => {
  assert.equal(css.includes('.project-beta-modal{width:calc(100vw-16px);max-height:calc(100dvh-16px);padding:16px;border-radius:16px16px00;'), true);
  assert.equal(css.includes('.project-beta.ops-modal-backdrop{align-items:end;padding:8px;'), true);
  assert.equal(css.includes('.project-beta-modal.ops-modal-headbutton{width:44px;height:44px;flex-basis:44px;'), true);
  assert.equal(css.includes('@media(max-width:340px)'), true);
});

test('Project role and ownership boundaries remain explicit after responsive hardening', () => {
  assert.equal(view.includes("typeRole='owner'|'admin'|'marketing_manager'|'analyst'|'viewer';"), true);
  assert.equal(view.includes("constcanAdmin=Boolean(project&&['owner','admin'].includes(project.role));"), true);
  assert.equal(view.includes("constcanManagePartners=Boolean(project&&['owner','admin','marketing_manager'].includes(project.role));"), true);
  assert.equal(view.includes("project.role==='owner'&&<optionvalue=\"admin\">ProjectAdmin</option>"), true);
  assert.equal(view.includes("project.role==='admin'&&request.requested_role==='admin'"), true);
  assert.equal(view.includes('TransferProjectownership'), true);
  assert.equal(view.includes('Projectownershipmustbetransferredinsteadofremoved.'), true);
});
