import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { requireAuth, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';

type ContactType = 'x' | 'telegram' | 'email' | 'website';
const CONTACT_COLUMNS: Record<ContactType, string> = { x: 'x_handle', telegram: 'telegram_contact', email: 'email', website: 'website_url' };

function periodStart(date = new Date()): string {
  return `${date.toISOString().slice(0, 7)}-01T00:00:00.000Z`;
}

function mask(value: string): string {
  if (value.includes('@') && !value.startsWith('@')) {
    const [local, domain] = value.split('@');
    return `${local.slice(0, 1)}***@${domain}`;
  }
  return value.length > 4 ? `${value.slice(0, 2)}•••${value.slice(-2)}` : '••••';
}

export async function revealPartnerContact(request: Request, env: Env, managerId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ profileId?: string; contactType?: ContactType }>(request);
  if (!body.profileId || !body.contactType || !Object.prototype.hasOwnProperty.call(CONTACT_COLUMNS, body.contactType)) {
    throw new HttpError(400, 'Profile and contact type are required', 'contact_reveal_invalid');
  }

  const db = new Db(requireDb(env));
  const profile = await db.first<{ id: string; profile_type: 'creator' | 'project'; owner_user_id: string | null; organization_id: string | null }>(
    `SELECT id, profile_type, owner_user_id, organization_id FROM profiles WHERE id = ? AND visibility <> 'archived'`,
    [body.profileId],
  );
  if (!profile) throw new HttpError(404, 'Profile not found', 'profile_not_found');

  let ownerType: 'user' | 'organization';
  let ownerId: string;
  if (profile.profile_type === 'creator') {
    if (profile.owner_user_id !== auth.user.id) throw new HttpError(403, 'Profile access unavailable', 'forbidden');
    ownerType = 'user'; ownerId = auth.user.id;
  } else {
    if (!profile.organization_id) throw new HttpError(409, 'Project profile is missing its organization', 'billing_project_invalid');
    const membership = await db.first<{ id: string }>(`SELECT id FROM organization_memberships WHERE organization_id = ? AND user_id = ? AND status = 'active'`, [profile.organization_id, auth.user.id]);
    if (!membership) throw new HttpError(403, 'Project access unavailable', 'forbidden');
    ownerType = 'organization'; ownerId = profile.organization_id;
  }

  const column = CONTACT_COLUMNS[body.contactType];
  const manager = await db.first<Record<string, string | null>>(`SELECT id, ${column} AS contact_value FROM partner_managers WHERE id = ? AND visibility = 'public'`, [managerId]);
  if (!manager || !manager.contact_value) throw new HttpError(404, 'This contact is not available for reveal', 'contact_unavailable');

  const period = periodStart();
  const existing = await db.first<{ revealed_value: string }>(
    `SELECT revealed_value FROM contact_reveal_events WHERE owner_type = ? AND owner_id = ? AND manager_id = ? AND contact_type = ? AND period_start = ?`,
    [ownerType, ownerId, managerId, body.contactType, period],
  );
  if (existing) return json({ contactType: body.contactType, value: existing.revealed_value, alreadyRevealed: true, remaining: null });

  let planCode = 'free';
  try {
    const active = ownerType === 'user'
      ? await db.first<{ code: string }>(`SELECT bp.code FROM billing_entitlement_grants beg JOIN billing_plans bp ON bp.id = beg.plan_id WHERE beg.user_id = ? AND beg.status = 'active' AND beg.starts_at <= ? AND (beg.ends_at IS NULL OR beg.ends_at > ?) ORDER BY beg.created_at DESC LIMIT 1`, [ownerId, new Date().toISOString(), new Date().toISOString()])
      : await db.first<{ code: string }>(`SELECT bp.code FROM billing_entitlement_grants beg JOIN billing_plans bp ON bp.id = beg.plan_id WHERE beg.organization_id = ? AND beg.status = 'active' AND beg.starts_at <= ? AND (beg.ends_at IS NULL OR beg.ends_at > ?) ORDER BY beg.created_at DESC LIMIT 1`, [ownerId, new Date().toISOString(), new Date().toISOString()]);
    if (active?.code) planCode = active.code;
    else {
      const subscription = await db.first<{ code: string }>(`SELECT bp.code FROM billing_subscription_periods bsp JOIN billing_plans bp ON bp.id = bsp.plan_id WHERE bsp.owner_type = ? AND bsp.owner_id = ? AND bsp.status = 'active' AND bsp.period_start <= ? AND bsp.period_end > ? ORDER BY bsp.period_end DESC LIMIT 1`, [ownerType, ownerId, new Date().toISOString(), new Date().toISOString()]);
      if (subscription?.code) planCode = subscription.code;
    }
  } catch { /* The free fallback remains safe when payment tables are unavailable. */ }

  let plan: { monthly_contact_reveals: number } | null = null;
  try {
    plan = await db.first<{ monthly_contact_reveals: number }>('SELECT monthly_contact_reveals FROM billing_plans WHERE code = ? AND is_active = 1', [planCode]);
  } catch {
    throw new HttpError(503, 'Contact reveals are being prepared. Please try again after the billing update is complete.', 'contact_reveal_not_ready');
  }
  const allowance = Number(plan?.monthly_contact_reveals || 0);
  const used = await db.first<{ count: number }>('SELECT COUNT(*) AS count FROM contact_reveal_events WHERE owner_type = ? AND owner_id = ? AND period_start = ?', [ownerType, ownerId, period]);
  const usedCount = Number(used?.count || 0);
  if (usedCount >= allowance) throw new HttpError(402, 'Your plan has no contact reveals remaining this month', 'contact_reveal_limit');

  const eventId = `crev_${crypto.randomUUID().replace(/-/g, '')}`;
  await db.run(
    `INSERT INTO contact_reveal_events (id, owner_type, owner_id, profile_id, manager_id, contact_type, revealed_value, period_start, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_type, owner_id, manager_id, contact_type, period_start) DO NOTHING`,
    [eventId, ownerType, ownerId, profile.id, managerId, body.contactType, manager.contact_value, period, new Date().toISOString()],
  );
  const saved = await db.first<{ revealed_value: string }>('SELECT revealed_value FROM contact_reveal_events WHERE owner_type = ? AND owner_id = ? AND manager_id = ? AND contact_type = ? AND period_start = ?', [ownerType, ownerId, managerId, body.contactType, period]);
  if (!saved) throw new HttpError(409, 'Contact reveal could not be completed. Please retry.', 'contact_reveal_conflict');
  return json({ contactType: body.contactType, value: saved.revealed_value, alreadyRevealed: false, used: usedCount + 1, allowance, remaining: Math.max(0, allowance - usedCount - 1), masked: mask(saved.revealed_value) });
}
