import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const invites = readFileSync(new URL('../src/routes/invites.ts', import.meta.url), 'utf8');
const compact = invites.replace(/\s+/g, ' ');

test('invite recipient Telegram status uses the active Personal Profile identity model', () => {
  assert.equal(compact.includes("LEFT JOIN auth_identities ai ON ai.user_id = r.user_id"), false);
  assert.equal(compact.includes("ai.provider = 'telegram'"), false);
  assert.match(compact, /FROM platform_identity_links tpl JOIN platform_identities tp ON tp\.id = tpl\.platform_identity_id/);
  assert.match(compact, /tpl\.user_id = r\.user_id/);
  assert.match(compact, /tpl\.link_type = 'owns'/);
  assert.match(compact, /tpl\.ended_at IS NULL/);
  assert.match(compact, /tp\.platform = 'telegram'/);
  assert.match(compact, /tp\.provider_object_type = 'person'/);
  assert.match(compact, /tp\.status = 'active'/);
});

test('invite recipient Telegram lookup remains a correlated existence check and does not join identity rows into invite aggregation', () => {
  assert.match(compact, /MAX\(CASE WHEN EXISTS \( SELECT 1 FROM platform_identity_links tpl/);
  assert.equal(compact.includes('LEFT JOIN platform_identity_links tpl'), false);
  assert.equal(compact.includes('LEFT JOIN platform_identities tp'), false);
});
