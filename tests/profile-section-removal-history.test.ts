import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const profiles = readFileSync('src/routes/profiles.ts', 'utf8');
const editor = readFileSync('frontend/src/ProfileExperienceBeta.tsx', 'utf8');
const engagementMigration = readFileSync('migrations/0010_profile_engagement.sql', 'utf8');

test('profile section removal preserves click-attribution history', () => {
  assert.match(engagementMigration, /block_id TEXT REFERENCES profile_blocks\(id\)/);
  assert.match(profiles, /archived:\s*true/);
  assert.match(profiles, /UPDATE profile_blocks SET enabled = 0, config_json = \?, updated_at = \?/);
  assert.doesNotMatch(profiles, /DELETE FROM profile_blocks WHERE id = \? AND profile_id = \?/);
});

test('archived profile sections disappear from editor and public output', () => {
  assert.match(profiles, /isArchivedProfileBlock/);
  assert.match(profiles, /filter\(\(block\) => !isArchivedProfileBlock\(block\)\)/);
  assert.match(profiles, /activeBlocks/);
});

test('reordering works after a section has been removed', () => {
  assert.match(profiles, /const activeCurrent = current\.filter\(\(row\) => !isArchivedProfileBlock\(row\)\)/);
  assert.match(profiles, /activeCurrent\.length !== body\.blockIds\.length/);
});

test('profile editor reports removal state and updates immediately', () => {
  assert.match(editor, /setBusy\(`remove:\$\{block\.id\}`\)/);
  assert.match(editor, /setBlocks\(\(current\) => current\.filter\(\(item\) => item\.id !== block\.id\)\)/);
  assert.match(editor, /removed from profile\./);
  assert.match(editor, /Removing\.\.\./);
});
