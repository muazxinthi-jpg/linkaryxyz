import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { requireAuth, verifyCsrf } from '../auth/session';
import { HttpError, json, readJson } from '../http';
import { loadProjectPartnerRelationship, type RelationshipKind } from '../partnerRelationshipMemory';
import { organizationMembership } from '../routes/organizations';
import { executeLinkaryAI } from './runtime';

type MatchExplanationBody = {
  organizationId?: string;
  partnerKind?: RelationshipKind;
  partnerId?: string;
  idempotencyKey?: string;
};

export type MatchExplanation = {
  headline: string;
  whyRelevant: string[];
  evidence: string[];
  cautions: string[];
  nextQuestions: string[];
};

type ProjectRow = { id: string; name: string; status: string; verification_status: string };
type CreatorRow = {
  profile_id: string;
  username: string;
  display_name: string;
  bio: string;
  verification_status: string;
  x_handle: string | null;
  open_to_collaborations: number;
  accepted_campaigns: number;
};
type ManagerRow = {
  manager_id: string;
  profile_id: string;
  username: string;
  display_name: string;
  headline: string;
  bio: string;
  manager_verification_status: string;
  open_to_campaigns: number;
  telegram_verified: number;
};
type CommunityRow = {
  id: string;
  name: string;
  handle: string | null;
  audience_size: number;
  verification_status: string;
};
type OutcomeSourceRow = { source: string; outcomes: number; value_usd: number };

const OUTPUT_KEYS = ['headline', 'whyRelevant', 'evidence', 'cautions', 'nextQuestions'] as const;

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error('invalid_text');
  return value.trim();
}

function list(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 6) throw new Error('invalid_list');
  return value.map((item) => text(item, 240));
}

export function parseMatchExplanation(value: string): MatchExplanation {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_object');
    const row = parsed as Record<string, unknown>;
    if (Object.keys(row).some((key) => !OUTPUT_KEYS.includes(key as typeof OUTPUT_KEYS[number])) || OUTPUT_KEYS.some((key) => !(key in row))) throw new Error('invalid_shape');
    return {
      headline: text(row.headline, 140),
      whyRelevant: list(row.whyRelevant),
      evidence: list(row.evidence),
      cautions: list(row.cautions),
      nextQuestions: list(row.nextQuestions),
    };
  } catch {
    throw new HttpError(502, 'LinkaryAI returned an invalid match explanation. Please try again.', 'ai_output_invalid');
  }
}

function clean(value: unknown, max = 160): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function explainPartnerMatch(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<MatchExplanationBody>(request);
  const organizationId = clean(body.organizationId);
  const partnerId = clean(body.partnerId);
  const partnerKind = body.partnerKind;
  if (!organizationId || !partnerId || !partnerKind) throw new HttpError(400, 'Project and partner are required', 'match_context_required');
  if (!['creator', 'community_manager'].includes(partnerKind)) throw new HttpError(400, 'Choose a valid partner type', 'invalid_partner_type');

  const db = new Db(requireDb(env));
  const membership = await organizationMembership(db, auth.user.id, organizationId);
  if (!membership || !['owner', 'admin', 'marketing_manager'].includes(membership.role)) {
    throw new HttpError(403, 'Partner Match Explanation requires Project Owner, Admin or Marketing Manager access', 'forbidden');
  }
  const project = await db.first<ProjectRow>('SELECT id, name, status, verification_status FROM organizations WHERE id = ? LIMIT 1', [organizationId]);
  if (!project || project.status !== 'active' || project.verification_status !== 'verified_x') {
    throw new HttpError(409, 'Verify the Project before using Partner Match Explanation', 'project_verification_required');
  }

  let partner: Record<string, unknown>;
  let profileId: string;
  let communities: CommunityRow[] = [];
  if (partnerKind === 'creator') {
    const creator = await db.first<CreatorRow>(
      `SELECT p.id AS profile_id, p.username, p.display_name, p.bio, p.verification_status,
              pi.current_handle AS x_handle,
              CASE WHEN EXISTS (SELECT 1 FROM profile_blocks b WHERE b.profile_id = p.id AND b.enabled = 1 AND b.block_type = 'work_with_me') THEN 1 ELSE 0 END AS open_to_collaborations,
              COALESCE((SELECT COUNT(*) FROM campaign_opportunity_applications a WHERE a.applicant_profile_id = p.id AND a.status = 'accepted'), 0) AS accepted_campaigns
         FROM profiles p
         LEFT JOIN platform_identities pi ON pi.id = p.primary_platform_identity_id
        WHERE p.id = ? AND p.profile_type = 'creator' AND p.visibility = 'published'
        LIMIT 1`,
      [partnerId],
    );
    if (!creator) throw new HttpError(404, 'This Creator is not available in Partner Discovery', 'partner_not_found');
    profileId = creator.profile_id;
    partner = {
      kind: 'creator', profileId: creator.profile_id, username: creator.username, displayName: creator.display_name,
      bio: creator.bio || null, xHandle: creator.x_handle, verificationState: creator.verification_status,
      openToCollaboration: Boolean(creator.open_to_collaborations), acceptedLinkaryCampaigns: Number(creator.accepted_campaigns || 0),
    };
  } else {
    const manager = await db.first<ManagerRow>(
      `SELECT m.id AS manager_id, m.profile_id, p.username, m.display_name, m.headline, m.bio,
              m.verification_status AS manager_verification_status, m.open_to_campaigns,
              CASE WHEN EXISTS (
                SELECT 1 FROM platform_identity_links pil
                JOIN platform_identities pi ON pi.id = pil.platform_identity_id
                JOIN profiles owner_profile ON owner_profile.owner_user_id = pil.user_id
               WHERE owner_profile.id = m.profile_id AND pil.link_type = 'owns' AND pil.ended_at IS NULL
                 AND pi.platform = 'telegram' AND pi.provider_object_type = 'person'
                 AND pi.status = 'active' AND pi.ownership_verified_at IS NOT NULL
              ) THEN 1 ELSE 0 END AS telegram_verified
         FROM partner_managers m
         JOIN profiles p ON p.id = m.profile_id AND p.profile_type = 'creator'
        WHERE m.id = ? AND m.manager_type = 'community_manager' AND m.visibility = 'public'
        LIMIT 1`,
      [partnerId],
    );
    if (!manager) throw new HttpError(404, 'This Community Manager is not available in Partner Discovery', 'partner_not_found');
    profileId = manager.profile_id;
    communities = await db.all<CommunityRow>(
      `SELECT id, name, handle, audience_size, verification_status
         FROM partner_manager_assets
        WHERE manager_id = ? AND asset_type = 'telegram_community'
        ORDER BY verification_status = 'verified' DESC, updated_at DESC
        LIMIT 50`,
      [partnerId],
    );
    partner = {
      kind: 'community_manager', managerId: manager.manager_id, profileId: manager.profile_id,
      username: manager.username, displayName: manager.display_name, headline: manager.headline || null,
      bio: manager.bio || null, managerVerificationState: manager.manager_verification_status,
      personalTelegramVerified: Boolean(manager.telegram_verified), openToCampaigns: Boolean(manager.open_to_campaigns),
      representedTelegramCommunities: communities.map((item) => ({
        id: item.id, name: item.name, handle: item.handle, audienceSizeEstimate: Number(item.audience_size || 0), verificationState: item.verification_status,
      })),
    };
  }

  const relationship = await loadProjectPartnerRelationship(db, organizationId, partnerKind, partnerId);
  const assignmentClause = partnerKind === 'creator'
    ? "la.assignment_kind = 'creator' AND la.creator_profile_id = ?"
    : "la.assignment_kind = 'community' AND la.partner_manager_id = ?";
  const outcomeEvidenceBySource = await db.all<OutcomeSourceRow>(
    `SELECT ce.source, COUNT(*) AS outcomes, COALESCE(SUM(COALESCE(ce.value_usd, 0)), 0) AS value_usd
       FROM campaign_activity_linkary_assignments la
       JOIN campaign_activities a ON a.id = la.activity_id
       JOIN campaigns c ON c.id = a.campaign_id
       JOIN conversion_events ce ON ce.activity_id = a.id
      WHERE c.organization_id = ? AND ${assignmentClause}
      GROUP BY ce.source
      ORDER BY ce.source ASC`,
    [organizationId, partnerId],
  );
  const relationshipEvidence = {
    summary: relationship.summary,
    activities: relationship.activities.slice(0, 12),
    inquiries: relationship.inquiries.slice(0, 10),
    communities: relationship.communities.slice(0, 12),
    evidenceNote: relationship.evidence_note,
    includedRows: {
      activities: { included: Math.min(12, relationship.activities.length), total: relationship.activities.length },
      inquiries: { included: Math.min(10, relationship.inquiries.length), total: relationship.inquiries.length },
      communities: { included: Math.min(12, relationship.communities.length), total: relationship.communities.length },
    },
  };
  const evidence = {
    project: { id: project.id, name: project.name, verificationState: project.verification_status },
    partner,
    relationship: relationshipEvidence,
    outcomeEvidenceBySource: outcomeEvidenceBySource.map((item) => ({ source: item.source, outcomes: Number(item.outcomes || 0), valueUsd: Number(item.value_usd || 0) })),
    evidenceRules: {
      trackedClicks: 'Linkary-tracked evidence',
      outcomeConfidence: 'Only provider_verified and telegram_verified may be called verified. linkary_tracked must be called Linkary-tracked. Use outcomeEvidenceBySource for exact wording.',
      manualEvidence: 'Manual; never describe as verified',
      noHistory: relationship.summary.state === 'new' ? 'No recorded previous Project relationship' : null,
    },
  };

  const result = await executeLinkaryAI(env, {
    actorUserId: auth.user.id,
    ownerType: 'organization',
    ownerId: organizationId,
    profileId,
    organizationId,
    taskKey: 'match_explanation',
    input: JSON.stringify(evidence),
    evidenceRefs: [
      `organization:${organizationId}`,
      partnerKind === 'creator' ? `creator_profile:${partnerId}` : `community_manager:${partnerId}`,
      `relationship_activities:${relationship.activities.length}`,
      `relationship_inquiries:${relationship.inquiries.length}`,
      ...communities.slice(0, 20).map((item) => `community:${item.id}`),
    ],
    validateOutput: (text) => { parseMatchExplanation(text); },
    idempotencyKey: clean(body.idempotencyKey) || `match-explanation:${organizationId}:${partnerKind}:${partnerId}:${crypto.randomUUID()}`,
  });

  return json({
    explanation: parseMatchExplanation(result.text),
    ai: { eventId: result.eventId, promptVersion: result.promptVersion, usageCredits: result.usageCredits },
  });
}
