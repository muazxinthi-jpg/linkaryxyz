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
let networkTablesKnownReady = false;

async function profileIdentityColumnsReady(db: Db): Promise<boolean> {
  if (identityColumnsKnownReady) return true;
  const columns = await db.all<{ name: string }>('PRAGMA table_info(profiles)');
  const names = new Set(columns.map((column) => column.name));
  const ready = names.has('public_role') && names.has('professional_headline');
  if (ready) identityColumnsKnownReady = true;
  return ready;
}

async function personalNetworkTablesReady(db: Db): Promise<boolean> {
  if (networkTablesKnownReady) return true;
  const rows = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('network_referral_edges', 'network_referral_paths')",
  );
  const names = new Set(rows.map((row) => row.name));
  const ready = names.has('network_referral_edges') && names.has('network_referral_paths');
  if (ready) networkTablesKnownReady = true;
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

function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

type NetworkSummaryRow = {
  total_network: number | string | null;
  direct_invites: number | string | null;
  creators: number | string | null;
  projects: number | string | null;
};

type NetworkGenerationRow = {
  depth: number | string;
  members: number | string;
};

type NetworkMemberRow = {
  depth: number | string;
  chosen_account_type: 'creator' | 'project' | null;
  public_display_name: string | null;
  public_username: string | null;
  public_avatar_url: string | null;
  public_profile_type: 'creator' | 'project' | null;
  public_verification_state: string | null;
  joined_at: string;
};

async function personalNetworkPayload(db: Db, userId: string, request: Request) {
  if (!(await personalNetworkTablesReady(db))) {
    return {
      available: false,
      summary: { directInvites: 0, totalNetwork: 0, creators: 0, projects: 0 },
      generations: Array.from({ length: 7 }, (_, index) => ({ depth: index + 1, members: 0 })),
      selectedGeneration: 1,
      members: [],
      pagination: { offset: 0, limit: 20, total: 0, hasMore: false },
    };
  }

  const url = new URL(request.url);
  const selectedGeneration = boundedInteger(url.searchParams.get('networkDepth'), 1, 1, 7);
  const limit = boundedInteger(url.searchParams.get('networkLimit'), 20, 1, 50);
  const offset = boundedInteger(url.searchParams.get('networkOffset'), 0, 0, 1000000);

  const summary = await db.first<NetworkSummaryRow>(
    `SELECT
       COUNT(*) AS total_network,
       SUM(CASE WHEN p.depth = 1 THEN 1 ELSE 0 END) AS direct_invites,
       SUM(CASE WHEN e.chosen_account_type = 'creator' THEN 1 ELSE 0 END) AS creators,
       SUM(CASE WHEN e.chosen_account_type = 'project' THEN 1 ELSE 0 END) AS projects
     FROM network_referral_paths p
     JOIN network_referral_edges e
       ON e.invitee_user_id = p.descendant_user_id
      AND e.status = 'active'
     WHERE p.ancestor_user_id = ?`,
    [userId],
  );

  const generationRows = await db.all<NetworkGenerationRow>(
    `SELECT depth, COUNT(*) AS members
       FROM network_referral_paths
      WHERE ancestor_user_id = ?
      GROUP BY depth
      ORDER BY depth ASC`,
    [userId],
  );
  const generationMap = new Map(generationRows.map((row) => [Number(row.depth), Number(row.members || 0)]));
  const generations = Array.from({ length: 7 }, (_, index) => ({ depth: index + 1, members: generationMap.get(index + 1) || 0 }));
  const selectedTotal = generationMap.get(selectedGeneration) || 0;

  const members = await db.all<NetworkMemberRow>(
    `SELECT
       p.depth,
       e.chosen_account_type,
       COALESCE(cp.display_name, pp.display_name) AS public_display_name,
       COALESCE(cp.username, pp.username) AS public_username,
       COALESCE(cp.avatar_url, pp.avatar_url) AS public_avatar_url,
       CASE WHEN cp.id IS NOT NULL THEN 'creator' WHEN pp.id IS NOT NULL THEN 'project' ELSE NULL END AS public_profile_type,
       COALESCE(cp.verification_status, pp.verification_status) AS public_verification_state,
       e.created_at AS joined_at
     FROM network_referral_paths p
     JOIN network_referral_edges e
       ON e.invitee_user_id = p.descendant_user_id
      AND e.status = 'active'
     LEFT JOIN profiles cp
       ON cp.owner_user_id = e.invitee_user_id
      AND cp.profile_type = 'creator'
      AND cp.visibility = 'published'
     LEFT JOIN invite_redemptions r
       ON r.invite_id = e.source_invite_id
      AND r.user_id = e.invitee_user_id
     LEFT JOIN profiles pp
       ON pp.organization_id = r.organization_id
      AND pp.profile_type = 'project'
      AND pp.visibility = 'published'
     WHERE p.ancestor_user_id = ?
       AND p.depth = ?
     ORDER BY e.created_at ASC, e.invitee_user_id ASC
     LIMIT ? OFFSET ?`,
    [userId, selectedGeneration, limit, offset],
  );

  return {
    available: true,
    summary: {
      directInvites: Number(summary?.direct_invites || 0),
      totalNetwork: Number(summary?.total_network || 0),
      creators: Number(summary?.creators || 0),
      projects: Number(summary?.projects || 0),
    },
    generations,
    selectedGeneration,
    members: members.map((member) => ({
      depth: Number(member.depth),
      accountType: member.chosen_account_type,
      displayName: member.public_display_name || 'Linkary member',
      username: member.public_username,
      avatarUrl: member.public_avatar_url,
      profileType: member.public_profile_type,
      verified: member.public_verification_state === 'verified_x',
      joinedAt: member.joined_at,
    })),
    pagination: {
      offset,
      limit,
      total: selectedTotal,
      hasMore: offset + members.length < selectedTotal,
    },
  };
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
      network: await personalNetworkPayload(db, auth.user.id, request),
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
      network: await personalNetworkPayload(db, auth.user.id, request),
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
