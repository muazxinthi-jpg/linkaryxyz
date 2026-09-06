PRAGMA foreign_keys = ON;

-- Canonical Linkary Superadmin owner.
-- Reuse an existing xinthi@gmail.com Linkary user when present; otherwise
-- create a normal users row with the same usr_<hex> identifier shape used by the app.
INSERT INTO users (id, email, display_name, status, created_at, updated_at)
SELECT
  'usr_' || lower(hex(randomblob(16))),
  'xinthi@gmail.com',
  'Muaz Xinthi',
  'active',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE lower(email) = lower('xinthi@gmail.com')
);

UPDATE users
SET status = 'active',
    display_name = CASE WHEN trim(display_name) = '' THEN 'Muaz Xinthi' ELSE display_name END,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE lower(email) = lower('xinthi@gmail.com');

-- Keep exactly one active Superadmin owner under the current single-owner model.
UPDATE admin_grants
SET status = 'revoked',
    revoked_at = COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
WHERE role = 'superadmin'
  AND status = 'active'
  AND user_id <> (
    SELECT id FROM users WHERE lower(email) = lower('xinthi@gmail.com') LIMIT 1
  );

INSERT INTO admin_grants (id, user_id, role, status, granted_at, revoked_at)
SELECT
  'adm_' || lower(hex(randomblob(16))),
  u.id,
  'superadmin',
  'active',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  NULL
FROM users u
WHERE lower(u.email) = lower('xinthi@gmail.com')
  AND NOT EXISTS (
    SELECT 1 FROM admin_grants g WHERE g.user_id = u.id AND g.role = 'superadmin'
  );

UPDATE admin_grants
SET status = 'active', revoked_at = NULL
WHERE role = 'superadmin'
  AND user_id = (
    SELECT id FROM users WHERE lower(email) = lower('xinthi@gmail.com') LIMIT 1
  );

INSERT INTO audit_logs (
  id,
  actor_user_id,
  actor_kind,
  action,
  resource_type,
  resource_id,
  organization_id,
  metadata_json,
  created_at
)
SELECT
  'aud_' || lower(hex(randomblob(16))),
  u.id,
  'system',
  'superadmin.owner.canonicalized',
  'user',
  u.id,
  NULL,
  '{"email":"xinthi@gmail.com","source":"migration_0035"}',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM users u
WHERE lower(u.email) = lower('xinthi@gmail.com');
