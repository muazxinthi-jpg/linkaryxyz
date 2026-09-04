import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';

export const PERSONAL_PUBLIC_ROLES = [
  'founder',
  'co_founder',
  'creator',
  'kol',
  'community_manager',
  'kol_manager',
  'growth_bd',
  'marketer',
  'advisor',
  'investor',
  'developer_builder',
  'researcher',
  'contributor',
  'trader',
  'professional',
] as const;

export type PersonalPublicRole = typeof PERSONAL_PUBLIC_ROLES[number];

export const PERSONAL_PUBLIC_ROLE_LABELS: Record<PersonalPublicRole, string> = {
  founder: 'Founder',
  co_founder: 'Co-Founder',
  creator: 'Creator',
  kol: 'KOL',
  community_manager: 'Community Manager',
  kol_manager: 'KOL Manager',
  growth_bd: 'Growth / BD',
  marketer: 'Marketer',
  advisor: 'Advisor',
  investor: 'Investor',
  developer_builder: 'Developer / Builder',
  researcher: 'Researcher',
  contributor: 'Contributor',
  trader: 'Trader',
  professional: 'Professional',
};

const ROLE_SET = new Set<string>(PERSONAL_PUBLIC_ROLES);
let identityColumnsKnownReady = false;

async function profileIdentityColumnsReady(db: Db): Promise<boolean> {
  if (identityColumnsKnownReady) return true;
  const columns = await db.all<{ name: string }>('PRAGMA table_info(profiles)');
  const names = new Set(columns.map((column) => column.name));
  const ready = names.has('public_role') && names.has('professional_headline');
  if (ready) identityColumnsKnownReady = true;
  return ready;
}

async function requireOwnedPersonalProfile(db: Db, userId: string, profileId: string): Promise<{ id: string; profile_type: string }> {
  const profile = await db.first<{ id: string; profile_type: string }>(
    'SELECT id, profile_type FROM profiles WHERE id = ? AND owner_user_id = ? LIMIT 1',
    [profileId, userId],
  );
  if (!profile) throw new HttpError(403, 'Personal profile edit access denied', 'forbidden');
  if (profile.profile_type !== 'creator') {
    throw new HttpError(409, 'Public role selection is available only on personal profiles', 'personal_profile_required');
  }
  return profile;
}

function cleanRole(value: unknown): PersonalPublicRole | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !ROLE_SET.has(value)) {
    throw new HttpError(400, 'Choose a supported public identity', 'invalid_public_role');
  }
  return value as PersonalPublicRole;
}

function cleanHeadline(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Invalid professional headline', 'invalid_profile_field');
  const headline = value.trim().slice(0, 140);
  return headline || null;
}

export async function personalProfileIdentity(request: Request, env: Env, profileId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  await requireOwnedPersonalProfile(db, auth.user.id, profileId);

  if (!(await profileIdentityColumnsReady(db))) {
    return json({
      available: false,
      publicRole: null,
      publicRoleLabel: null,
      professionalHeadline: null,
      roles: PERSONAL_PUBLIC_ROLES.map((value) => ({ value, label: PERSONAL_PUBLIC_ROLE_LABELS[value] })),
    });
  }

  if (request.method === 'GET') {
    const row = await db.first<{ public_role: string | null; professional_headline: string | null }>(
      'SELECT public_role, professional_headline FROM profiles WHERE id = ? LIMIT 1',
      [profileId],
    );
    const role = row?.public_role && ROLE_SET.has(row.public_role) ? row.public_role as PersonalPublicRole : null;
    return json({
      available: true,
      publicRole: role,
      publicRoleLabel: role ? PERSONAL_PUBLIC_ROLE_LABELS[role] : null,
      professionalHeadline: row?.professional_headline || null,
      roles: PERSONAL_PUBLIC_ROLES.map((value) => ({ value, label: PERSONAL_PUBLIC_ROLE_LABELS[value] })),
    });
  }

  if (request.method !== 'PATCH') throw new HttpError(405, 'Method not allowed', 'method_not_allowed');
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ publicRole?: unknown; professionalHeadline?: unknown }>(request);
  const publicRole = cleanRole(body.publicRole);
  const professionalHeadline = cleanHeadline(body.professionalHeadline);
  const timestamp = new Date().toISOString();
  await db.run(
    'UPDATE profiles SET public_role = ?, professional_headline = ?, updated_at = ? WHERE id = ?',
    [publicRole, professionalHeadline, timestamp, profileId],
  );
  return json({
    ok: true,
    profileId,
    publicRole,
    publicRoleLabel: publicRole ? PERSONAL_PUBLIC_ROLE_LABELS[publicRole] : null,
    professionalHeadline,
  });
}
