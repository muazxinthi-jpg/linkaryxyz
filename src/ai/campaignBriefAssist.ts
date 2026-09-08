import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership } from '../routes/organizations';
import { executeLinkaryAI } from './runtime';

type CampaignBriefBody = {
  organizationId?: string;
  name?: string;
  objective?: string;
  budgetUsd?: number;
  sourceType?: string;
  executionMode?: string;
  idempotencyKey?: string;
};

type ProjectEvidence = {
  id: string;
  name: string;
  status: string;
  verification_status: string;
  profile_id: string | null;
  display_name: string | null;
  bio: string | null;
  seo_title: string | null;
  seo_description: string | null;
  username: string | null;
};

type CampaignBriefSuggestion = {
  campaignName: string | null;
  objective: string | null;
  audience: string | null;
  keyMessage: string | null;
  deliverables: string[];
  successMetrics: string[];
  trackingPlan: string[];
  missingInputs: string[];
};

const sourceTypes = new Set(['external', 'internal_team', 'agency', 'creator_kol', 'community', 'launchpad', 'linkary', 'other']);
const executionModes = new Set(['tracked_elsewhere', 'run_on_linkary']);

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, max);
  return text || null;
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, 220))
    .filter((item): item is string => Boolean(item))
    .slice(0, 5);
}

function parseSuggestions(text: string): CampaignBriefSuggestion {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value: unknown;
  try { value = JSON.parse(normalized); }
  catch { throw new HttpError(502, 'LinkaryAI returned an invalid campaign brief draft. Please try again.', 'ai_output_invalid'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(502, 'LinkaryAI returned an invalid campaign brief draft. Please try again.', 'ai_output_invalid');
  }
  const row = value as Record<string, unknown>;
  return {
    campaignName: cleanText(row.campaignName, 120),
    objective: cleanText(row.objective, 500),
    audience: cleanText(row.audience, 240),
    keyMessage: cleanText(row.keyMessage, 300),
    deliverables: cleanList(row.deliverables),
    successMetrics: cleanList(row.successMetrics),
    trackingPlan: cleanList(row.trackingPlan),
    missingInputs: cleanList(row.missingInputs),
  };
}

export async function assistCampaignBrief(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<CampaignBriefBody>(request);
  const organizationId = body.organizationId?.trim() || '';
  if (!organizationId) throw new HttpError(400, 'Project is required', 'organization_required');

  const name = cleanText(body.name, 120);
  const objective = cleanText(body.objective, 500);
  if (!name && !objective) throw new HttpError(400, 'Add a campaign name or rough objective before asking LinkaryAI for a brief.', 'campaign_context_required');

  const db = new Db(requireDb(env));
  const membership = await organizationMembership(db, auth.user.id, organizationId);
  if (!membership || !['owner', 'admin', 'marketing_manager'].includes(membership.role)) {
    throw new HttpError(403, 'Campaign Brief Assistant requires Project Owner, Admin or Marketing Manager access', 'forbidden');
  }

  const project = await db.first<ProjectEvidence>(
    `SELECT o.id, o.name, o.status, o.verification_status,
            p.id AS profile_id, p.display_name, p.bio, p.seo_title, p.seo_description, p.username
       FROM organizations o
       LEFT JOIN profiles p ON p.organization_id = o.id AND p.profile_type = 'project'
      WHERE o.id = ?
      LIMIT 1`,
    [organizationId],
  );
  if (!project || project.status !== 'active' || project.verification_status !== 'verified_x') {
    throw new HttpError(409, 'Verify the Project with its official X identity before using campaign assistance', 'project_verification_required');
  }

  const sourceType = sourceTypes.has(body.sourceType || '') ? body.sourceType! : 'external';
  const executionMode = executionModes.has(body.executionMode || '') ? body.executionMode! : 'tracked_elsewhere';
  const budgetUsd = typeof body.budgetUsd === 'number' && Number.isFinite(body.budgetUsd) && body.budgetUsd >= 0 ? body.budgetUsd : null;
  const evidence = {
    project: {
      name: project.name,
      displayName: project.display_name,
      username: project.username,
      bio: project.bio,
      seoTitle: project.seo_title,
      seoDescription: project.seo_description,
      verificationStatus: project.verification_status,
    },
    campaignDraft: {
      name,
      objective,
      sourceType,
      executionMode,
      budgetUsd,
    },
  };

  const idempotencyKey = cleanText(body.idempotencyKey, 160) || `campaign-brief:${organizationId}:${crypto.randomUUID()}`;
  const result = await executeLinkaryAI(env, {
    actorUserId: auth.user.id,
    ownerType: 'organization',
    ownerId: organizationId,
    profileId: project.profile_id || undefined,
    organizationId,
    taskKey: 'campaign_brief_assist',
    input: JSON.stringify(evidence),
    evidenceRefs: [
      `organization:${organizationId}`,
      project.profile_id ? `profile:${project.profile_id}` : 'profile:none',
      'campaign_draft:user_supplied',
    ],
    idempotencyKey,
  });

  return json({
    suggestions: parseSuggestions(result.text),
    ai: {
      eventId: result.eventId,
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      usageCredits: result.usageCredits,
      latencyMs: result.latencyMs,
    },
  });
}
