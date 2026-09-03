import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json } from '../http';
import { requireAuth } from '../auth/session';
import { organizationMembership } from './organizations';
import { publicProfileUrl } from '../urls';

type DiscoveryType = 'creator' | 'community_manager';

function positiveInt(value: string | null): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new HttpError(400, 'Choose a valid filter value', 'invalid_filter');
  return Math.floor(parsed);
}

export async function listPartnerDiscovery(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim();
  if (!organizationId) throw new HttpError(400, 'organizationId is required', 'organization_required');

  const db = new Db(requireDb(env));
  if (!(await organizationMembership(db, auth.user.id, organizationId))) {
    throw new HttpError(403, 'Project access denied', 'forbidden');
  }

  const type = (url.searchParams.get('type') || 'creator') as DiscoveryType;
  if (!['creator', 'community_manager'].includes(type)) {
    throw new HttpError(400, 'Choose a valid discovery type', 'invalid_partner_type');
  }

  const search = url.searchParams.get('search')?.trim().toLowerCase() || '';
  const verifiedOnly = url.searchParams.get('verified') === '1';
  const openOnly = url.searchParams.get('open') === '1';
  const minAudience = positiveInt(url.searchParams.get('minAudience'));
  const minCommunities = positiveInt(url.searchParams.get('minCommunities'));

  if (type === 'creator') {
    const clauses = ["p.profile_type = 'creator'", "p.visibility = 'published'"];
    const params: unknown[] = [];
    if (verifiedOnly) clauses.push("p.verification_status = 'verified_x'");
    if (openOnly) clauses.push("EXISTS (SELECT 1 FROM profile_blocks wb WHERE wb.profile_id = p.id AND wb.enabled = 1 AND wb.block_type = 'work_with_me')");
    if (search) {
      const term = `%${search}%`;
      clauses.push("(lower(p.display_name) LIKE ? OR lower(p.username) LIKE ? OR lower(p.bio) LIKE ? OR lower(COALESCE(pi.current_handle,'')) LIKE ?)");
      params.push(term, term, term, term);
    }

    const rows = await db.all<{
      profile_id: string;
      username: string;
      display_name: string;
      bio: string;
      avatar_url: string | null;
      verification_status: string;
      x_handle: string | null;
      open_to_collaborations: number;
      accepted_campaigns: number;
    }>(
      `SELECT p.id AS profile_id,
              p.username,
              p.display_name,
              p.bio,
              p.avatar_url,
              p.verification_status,
              pi.current_handle AS x_handle,
              CASE WHEN EXISTS (
                SELECT 1 FROM profile_blocks wb
                 WHERE wb.profile_id = p.id AND wb.enabled = 1 AND wb.block_type = 'work_with_me'
              ) THEN 1 ELSE 0 END AS open_to_collaborations,
              COALESCE((
                SELECT COUNT(*) FROM campaign_opportunity_applications app
                 WHERE app.applicant_profile_id = p.id AND app.status = 'accepted'
              ), 0) AS accepted_campaigns
         FROM profiles p
         LEFT JOIN platform_identities pi ON pi.id = p.primary_platform_identity_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY open_to_collaborations DESC,
                 p.verification_status = 'verified_x' DESC,
                 p.published_at DESC,
                 p.display_name ASC
        LIMIT 250`,
      params,
    );

    return json({
      type,
      partners: rows.map((row) => ({
        kind: 'creator' as const,
        id: row.profile_id,
        profile_id: row.profile_id,
        username: row.username,
        display_name: row.display_name,
        bio: row.bio,
        avatar_url: row.avatar_url,
        x_handle: row.x_handle,
        verified: row.verification_status === 'verified_x',
        open_to_collaborations: Boolean(row.open_to_collaborations),
        accepted_campaigns: Number(row.accepted_campaigns || 0),
        public_url: publicProfileUrl(request, env, row.username),
      })),
    });
  }

  const where = ["m.manager_type = 'community_manager'", "m.visibility = 'public'"];
  const whereParams: unknown[] = [];
  if (openOnly) where.push('m.open_to_campaigns = 1');
  if (verifiedOnly) {
    where.push("EXISTS (SELECT 1 FROM partner_manager_assets va WHERE va.manager_id = m.id AND va.asset_type = 'telegram_community' AND va.verification_status = 'verified')");
  }
  if (search) {
    const term = `%${search}%`;
    where.push("(lower(m.display_name) LIKE ? OR lower(m.headline) LIKE ? OR lower(m.bio) LIKE ? OR lower(p.username) LIKE ? OR EXISTS (SELECT 1 FROM partner_manager_assets sa WHERE sa.manager_id = m.id AND (lower(sa.name) LIKE ? OR lower(COALESCE(sa.handle,'')) LIKE ?)))");
    whereParams.push(term, term, term, term, term, term);
  }

  const having: string[] = [];
  const havingParams: unknown[] = [];
  if (minAudience !== null) { having.push('COALESCE(SUM(a.audience_size), 0) >= ?'); havingParams.push(minAudience); }
  if (minCommunities !== null) { having.push('COUNT(a.id) >= ?'); havingParams.push(minCommunities); }

  const rows = await db.all<{
    manager_id: string;
    profile_id: string;
    username: string;
    avatar_url: string | null;
    display_name: string;
    headline: string;
    bio: string;
    manager_verification_status: string;
    open_to_campaigns: number;
    telegram_verified: number;
    community_count: number;
    verified_communities: number;
    combined_audience: number;
  }>(
    `SELECT m.id AS manager_id,
            m.profile_id,
            p.username,
            p.avatar_url,
            m.display_name,
            m.headline,
            m.bio,
            m.verification_status AS manager_verification_status,
            m.open_to_campaigns,
            CASE WHEN EXISTS (
              SELECT 1
                FROM platform_identity_links pil
                JOIN platform_identities tpi ON tpi.id = pil.platform_identity_id
               WHERE pil.user_id = p.owner_user_id
                 AND pil.link_type = 'owns'
                 AND pil.ended_at IS NULL
                 AND tpi.platform = 'telegram'
                 AND tpi.provider_object_type = 'person'
                 AND tpi.status = 'active'
                 AND tpi.ownership_verified_at IS NOT NULL
            ) THEN 1 ELSE 0 END AS telegram_verified,
            COUNT(a.id) AS community_count,
            COALESCE(SUM(CASE WHEN a.verification_status = 'verified' THEN 1 ELSE 0 END), 0) AS verified_communities,
            COALESCE(SUM(a.audience_size), 0) AS combined_audience
       FROM partner_managers m
       JOIN profiles p ON p.id = m.profile_id AND p.profile_type = 'creator'
       LEFT JOIN partner_manager_assets a ON a.manager_id = m.id AND a.asset_type = 'telegram_community'
      WHERE ${where.join(' AND ')}
      GROUP BY m.id
      ${having.length ? `HAVING ${having.join(' AND ')}` : ''}
      ORDER BY m.open_to_campaigns DESC,
               verified_communities DESC,
               combined_audience DESC,
               m.updated_at DESC
      LIMIT 250`,
    [...whereParams, ...havingParams],
  );

  return json({
    type,
    partners: rows.map((row) => ({
      kind: 'community_manager' as const,
      id: row.manager_id,
      manager_id: row.manager_id,
      profile_id: row.profile_id,
      username: row.username,
      avatar_url: row.avatar_url,
      display_name: row.display_name,
      headline: row.headline,
      bio: row.bio,
      telegram_verified: Boolean(row.telegram_verified),
      manager_verification_status: row.manager_verification_status,
      open_to_campaigns: Boolean(row.open_to_campaigns),
      community_count: Number(row.community_count || 0),
      verified_communities: Number(row.verified_communities || 0),
      combined_audience: Number(row.combined_audience || 0),
      public_url: publicProfileUrl(request, env, row.username),
    })),
  });
}
