from pathlib import Path

path = Path('src/routes/projectAccess.ts')
source = path.read_text()

old = """  const members = await db.all<{ user_id: string; role: MemberRole; billing_manager: number; created_at: string; display_name: string; username: string | null }>(
    `SELECT m.user_id, m.role, m.billing_manager, m.created_at, u.display_name,
            (SELECT p.username FROM profiles p WHERE p.owner_user_id = u.id AND p.profile_type = 'creator' ORDER BY p.created_at ASC LIMIT 1) AS username
       FROM organization_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ? AND m.status = 'active'
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.created_at ASC`,
    [organizationId],
  );
"""

new = """  // Project registration needs an internal owner/controller for authorization and billing,
  // but that bootstrap controller is not an explicitly added Project team member.
  const members = await db.all<{ user_id: string; role: MemberRole; billing_manager: number; created_at: string; display_name: string; username: string | null }>(
    `SELECT m.user_id, m.role, m.billing_manager, m.created_at, u.display_name,
            (SELECT p.username FROM profiles p WHERE p.owner_user_id = u.id AND p.profile_type = 'creator' ORDER BY p.created_at ASC LIMIT 1) AS username
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       JOIN organizations o ON o.id = m.organization_id
      WHERE m.organization_id = ? AND m.status = 'active'
        AND NOT (m.user_id = o.created_by_user_id AND m.role = 'owner')
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.created_at ASC`,
    [organizationId],
  );
"""

count = source.count(old)
if count != 1:
    raise SystemExit(f'expected exactly one Project members query anchor, found {count}')

path.write_text(source.replace(old, new, 1))
