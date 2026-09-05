import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(new URL('../frontend/src/ProductWorkspace.tsx', import.meta.url), 'utf8');

test('Project navigation exposes the private Network workspace', () => {
  assert.match(workspace, /\['\/creators', 'Network'\]/);
});
