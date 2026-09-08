import type { Env } from '../env';
import { Db } from '../db/client';
import { HttpError } from '../http';
import { executeLinkaryAI } from './runtime';

type ProjectSuggestion = {
  bio: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  positioningTip: string | null;
  completenessTips: string[];
  socialTips: string[];
};

type ProjectEvidence = {
  display_name: string;
  bio: string;
  seo_title: string | null;
  seo_description: string | null;
  profile_type: string;
  username: string;
  verification_status: string;
  organization_id: string | null;
};

type BlockEvidence = {
  block_type: string;
  title: string | null;
  config_json: string;
};

type ProjectRole = 'owner' | 'admin' | 'marketing_manager' | 'analyst' | 'viewer';

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, max);
  return text || null;
}

function cleanTips(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, 180))
    .filter((item): item is string => Boolean(item))
    .slice(0, 5);
}

function parseSuggestions(text: string): ProjectSuggestion {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value: unknown;
  try { value = JSON.parse(normalized); }
  catch { throw new HttpError(502, 'LinkaryAI returned an invalid Project profile draft. Please try again.', 'ai_output_invalid'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(502, 'LinkaryAI returned an invalid Project profile draft. Please try again.', 'ai_output_invalid');
  }
  const row = value as Record<string, unknown>;
  return {
    bio: cleanText(row.bio, 500),
    seoTitle: cleanText(row.seoTitle, 70),
    seoDescription: cleanText(row.seoDescription, 180),
    positioningTip: cleanText(row.positioningTip, 180),
    completenessTips: cleanTips(row.completenessTips),
    socialTips: cleanTips(row.socialTips),
  };
}

function normalizedBlocks(rows: BlockEvidence[]) {
  return rows.map((row) => {
    let config: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(row.config_json || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed as Record<string, unknown>;
    } catch { /* Invalid legacy config is ignored for AI evidence. */ }
    return {
      type: row.block_type,
      title: row.title || null,
      socialPlatform: typeof config.socialPlatform === 'string' ? config.socialPlatform : null,
      sectionTitle: typeof config.sectionTitle === 'string' ? config.sectionTitle : null,
      role: typeof config.role === 'string' ? config.role : null,
    };
  });
}

export async function improveProjectProfileWithAI(
  env: Env,
  db: Db,
  actorUserId: string,
  profileId: string,
  idempotencyKey: string,
) {
  const profile = await db.first<ProjectEvidence>(
    `SELECT display_name, bio, seo_title, seo_description, profile_type, username,
            verification_status, organization_id
       FROM profiles
      WHERE id = ? AND profile_type = 'project'
      LIMIT 1`,
    [profileId],
  );
  if (!profile?.organization_id) throw new HttpError(403, 'Project profile edit access denied', 'forbidden');

  const membership = await db.first<{ role: ProjectRole }>(
    `SELECT role
       FROM organization_memberships
      WHERE user_id = ? AND organization_id = ? AND status = 'active'
      LIMIT 1`,
    [actorUserId, profile.organization_id],
  );
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw new HttpError(403, 'Project Profile Copilot requires Project Owner or Admin access', 'forbidden');
  }

  const blocks = await db.all<BlockEvidence>(
    `SELECT block_type, title, config_json
       FROM profile_blocks
      WHERE profile_id = ? AND enabled = 1
      ORDER BY position ASC
      LIMIT 40`,
    [profileId],
  );

  const evidence = {
    profile: {
      displayName: profile.display_name,
      bio: profile.bio,
      seoTitle: profile.seo_title,
      seoDescription: profile.seo_description,
      profileType: profile.profile_type,
      username: profile.username,
      verificationStatus: profile.verification_status,
    },
    enabledProfileSections: normalizedBlocks(blocks),
  };

  const result = await executeLinkaryAI(env, {
    actorUserId,
    ownerType: 'organization',
    ownerId: profile.organization_id,
    profileId,
    organizationId: profile.organization_id,
    taskKey: 'project_profile_improve',
    input: JSON.stringify(evidence),
    evidenceRefs: [`profile:${profileId}`, `organization:${profile.organization_id}`, `profile_blocks:${blocks.length}`],
    idempotencyKey,
  });

  return {
    suggestions: parseSuggestions(result.text),
    ai: {
      eventId: result.eventId,
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      usageCredits: result.usageCredits,
      latencyMs: result.latencyMs,
    },
  };
}
