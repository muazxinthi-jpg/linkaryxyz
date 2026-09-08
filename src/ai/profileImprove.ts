import type { Env } from '../env';
import { Db } from '../db/client';
import { HttpError } from '../http';
import { executeLinkaryAI } from './runtime';

type Suggestion = {
  professionalHeadline: string | null;
  bio: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  profileTips: string[];
};

type ProfileEvidence = {
  display_name: string;
  bio: string;
  seo_title: string | null;
  seo_description: string | null;
  public_role: string | null;
  professional_headline: string | null;
  profile_type: string;
  username: string;
  verification_status: string;
};

type BlockEvidence = {
  block_type: string;
  title: string | null;
  config_json: string;
};

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

function parseSuggestions(text: string): Suggestion {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value: unknown;
  try { value = JSON.parse(normalized); }
  catch { throw new HttpError(502, 'LinkaryAI returned an invalid profile draft. Please try again.', 'ai_output_invalid'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(502, 'LinkaryAI returned an invalid profile draft. Please try again.', 'ai_output_invalid');
  }
  const row = value as Record<string, unknown>;
  return {
    professionalHeadline: cleanText(row.professionalHeadline, 140),
    bio: cleanText(row.bio, 500),
    seoTitle: cleanText(row.seoTitle, 70),
    seoDescription: cleanText(row.seoDescription, 180),
    profileTips: cleanTips(row.profileTips),
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

export async function improvePersonalProfileWithAI(
  env: Env,
  db: Db,
  actorUserId: string,
  profileId: string,
  idempotencyKey: string,
) {
  const profile = await db.first<ProfileEvidence>(
    `SELECT display_name, bio, seo_title, seo_description, public_role, professional_headline,
            profile_type, username, verification_status
       FROM profiles
      WHERE id = ? AND owner_user_id = ? AND profile_type = 'creator'
      LIMIT 1`,
    [profileId, actorUserId],
  );
  if (!profile) throw new HttpError(403, 'Personal profile edit access denied', 'forbidden');

  const blocks = await db.all<BlockEvidence>(
    `SELECT block_type, title, config_json
       FROM profile_blocks
      WHERE profile_id = ? AND enabled = 1
      ORDER BY position ASC
      LIMIT 30`,
    [profileId],
  );

  const evidence = {
    profile: {
      displayName: profile.display_name,
      publicRole: profile.public_role,
      professionalHeadline: profile.professional_headline,
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
    ownerType: 'user',
    ownerId: actorUserId,
    profileId,
    organizationId: null,
    taskKey: 'profile_improve',
    input: JSON.stringify(evidence),
    evidenceRefs: [`profile:${profileId}`, `profile_blocks:${blocks.length}`],
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
