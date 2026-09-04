import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const projectCss = readFileSync(new URL('../frontend/src/project-beta.css', import.meta.url), 'utf8');
const projectView = readFileSync(new URL('../frontend/src/ProjectExperienceBeta.tsx', import.meta.url), 'utf8');

function squash(value: string) {
  return value.replace(/\s+/g, '');
}

function mediaBlock(start: string, end?: string): string {
  const startIndex = projectCss.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} should exist`);
  const endIndex = end ? projectCss.indexOf(end, startIndex + start.length) : -1;
  return projectCss.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

const css = squash(projectCss);
const view = squash(projectView);

test('Project Control tabs and actions keep practical phone targets', () => {
  assert.match(projectCss, /\.project-beta-tabs\{[^}]*overflow-x:auto[^}]*\}/);
  assert.match(projectCss, /\.project-beta-tabs button\{[^}]*min-height:44px/);
  assert.match(projectCss, /\.project-beta-review-actions button[^{}]*\{[^}]*min-height:44px/);
  assert.match(projectCss, /\.project-beta-member-actions button\{[^}]*min-height:44px/);
  assert.match(projectCss, /\.project-beta-transfer-controls \.ops-button[^{}]*\{[^}]*min-height:44px/);
});

test('long Project, member, request and partner identities fail safe', () => {
  for (const selector of [
    '.project-beta .ops-project-toolbar strong',
    '.project-beta-request-list strong',
    '.project-beta-member-copy strong',
    '.project-beta-partners strong',
    '.project-beta-register-note span',
  ]) {
    assert.equal(projectCss.includes(selector), true, `${selector} should be covered`);
  }
  assert.equal(projectCss.includes('overflow-wrap:anywhere;word-break:break-word'), true);
  assert.match(projectCss, /\.project-beta-state,\.project-beta-request-status,\.project-beta-owner\{[^}]*max-width:100%[^}]*white-space:normal/);
});

test('Project search, role management and shortlist controls stack at 430px', () => {
  const phone = mediaBlock('@media(max-width:430px)', '@media(max-width:340px)');
  for (const selector of [
    '.project-beta-review-actions',
    '.project-beta-member-actions',
    '.project-beta-partners article>div:last-child',
    '.project-beta-transfer-controls',
    '.project-beta-search',
    '.project-beta-member-search',
    '.project-beta-modal .ops-form-actions',
  ]) {
    assert.equal(phone.includes(selector), true, `${selector} should stack at 430px`);
  }
  assert.equal(phone.includes('display:grid;grid-template-columns:minmax(0,1fr);width:100%'), true);
  for (const selector of [
    '.project-beta-member-actions select',
    '.project-beta-member-actions button',
    '.project-beta-partners select',
    '.project-beta-partners .ops-button',
    '.project-beta-search input',
    '.project-beta-search .ops-button',
  ]) {
    assert.equal(phone.includes(selector), true, `${selector} should become phone safe`);
  }
  assert.equal(phone.includes('min-height:44px'), true);
});

test('Project access modal stays inside phone viewport with accessible actions', () => {
  const phone = mediaBlock('@media(max-width:430px)', '@media(max-width:340px)');
  const narrow = mediaBlock('@media(max-width:340px)');
  assert.match(phone, /\.project-beta-modal\{[^}]*width:calc\(100vw - 16px\)[^}]*max-height:calc\(100dvh - 16px\)/);
  assert.match(phone, /\.project-beta \.ops-modal-backdrop\{[^}]*align-items:end[^}]*padding:8px/);
  assert.match(phone, /\.project-beta-modal \.ops-modal-head button\{[^}]*width:44px[^}]*height:44px/);
  assert.match(narrow, /\.project-beta-modal\{[^}]*width:calc\(100vw - 8px\)[^}]*max-height:calc\(100dvh - 8px\)/);
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
