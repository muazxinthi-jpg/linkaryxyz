import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../src/worker.ts', import.meta.url), 'utf8');
const identity = readFileSync(new URL('../src/routes/publicProfileIdentity.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../frontend/src/profile-identity-v1.css', import.meta.url), 'utf8').replace(/\s+/g, '');
const editor = readFileSync(new URL('../frontend/src/ProfileExperienceIdentityV1.tsx', import.meta.url), 'utf8');

test('production worker keeps the Personal Profile identity wrapper on public username routes', () => {
  assert.match(worker, /renderPublicProfileWithIdentity/);
  assert.equal(worker.includes("import { renderPublicProfileEnhanced }"), false);
  assert.match(identity, /publicIdentityLabel/);
  assert.match(identity, /professional-headline/);
});

test('saving Personal Profile identity still cache-busts the exact public iframe', () => {
  assert.match(editor, /editorPreview/);
  assert.match(editor, /Date\.now\(\)/);
  assert.match(editor, /iframe\.src = preview\.toString\(\)/);
});

test('wallet NFT actions and public identity card span the full Identity editor width', () => {
  assert.equal(css.includes('.profile-beta-identity-grid>.wide{grid-column:1/-1;min-width:0;width:100%;box-sizing:border-box}'), true);
  assert.match(editor, /className="wide profile-identity-v1"/);
});
