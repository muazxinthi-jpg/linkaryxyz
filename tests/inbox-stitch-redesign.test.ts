import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const inbox = readFileSync(new URL('frontend/src/InboxExperience.tsx', root), 'utf8').replace(/\s+/g, '');
const shell = readFileSync(new URL('frontend/src/ProductWorkspace.tsx', root), 'utf8');
const css = readFileSync(new URL('frontend/src/inbox-redesign.css', root), 'utf8').replace(/\s+/g, '');

test('Inbox redesign uses the established full-width shared workspace shell', () => {
  assert.match(shell, /currentPath === '\/dashboard\/inbox' \? ' inbox-workspace-page'/);
  assert.equal(css.includes('.ops-shell.ops-page.inbox-workspace-page{box-sizing:border-box;width:100%;max-width:none'), true);
  assert.match(css, /@media\(max-width:560px\)/);
  assert.match(css, /@media\(max-width:360px\)/);
});

test('Inbox decisions offer local filters and search over real loaded action types', () => {
  assert.match(inbox, /typeActionFilter='all'\|Action\['kind'\]/);
  assert.match(inbox, /constvisibleActions=useMemo\(/);
  assert.match(inbox, /Projectaccess/);
  assert.match(inbox, /Campaignapplications/);
  assert.match(inbox, /Collaboration/);
  assert.match(inbox, /Searchpeople,projects,campaigns/);
  assert.match(inbox, /visibleActions\.map\(renderAction\)/);
});

test('Redesigned Inbox retains notifications, access updates and sent inquiry surfaces', () => {
  for (const content of ['markAllNotifications()', 'markNotification(item.id)', 'showAllNotifications', 'Project access updates', 'Collaboration inquiries you sent', 'Open Evidence', 'Refresh workspaces']) {
    assert.equal(inbox.includes(content.replace(/\s+/g, '')), true, `${content} remains available`);
  }
});

test('Inbox decision type icons are drawn as accessible inline SVG, not placeholder letters', () => {
  assert.match(inbox, /functionInboxActionIcon\(/);
  assert.equal(inbox.includes('<svgviewBox="002424"'), true);
  assert.doesNotMatch(inbox, /className="inbox-icon">[PCI]</);
});

test('Inbox redesign keeps the explicit activation and evidence safeguards', () => {
  for (const content of ['This opens the collaboration for discussion only.', 'No tracking links or outcomes are created automatically.', 'The exact Community, not only its manager, will own the campaign evidence.', 'Activities assigned to a different partner are hidden to prevent accidental replacement.', 'Tracking and proof remain evidence-driven.']) {
    assert.equal(inbox.includes(content.replace(/\s+/g, '')), true, `${content} safeguard remains`);
  }
});
