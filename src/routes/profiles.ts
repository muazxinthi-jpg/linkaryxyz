import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import type { ProfileBlockRow, ProfileRow } from '../db/models';
import { HttpError, html, json, readJson } from '../http';
import { getLinkaryUrls, publicProfileUrl } from '../urls';
import { requireAuth, verifyCsrf } from '../auth/session';
import { resolveFeaturedMedia, resolveFeaturedPreview, resolveNftArtworkPreview, safeHttpsUrl } from '../profileMedia';
import { organizationMembership } from './organizations';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char] || char);
}

function safeJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return {}; }
}

function safePublicImageUrl(value: string | null): string | null {
  return safeHttpsUrl(value);
}

function safeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.max(0, value || 0));
}

function compactUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(Math.max(0, value || 0));
}

type PublicMetric = { label: string; value: string };
type PublicProof = {
  kind: 'creator' | 'project';
  heading: string;
  metrics: PublicMetric[];
  evidenceNote: string;
  relationships?: Array<{ projectName: string; campaignName: string }>;
};

type PublicOpportunity = {
  id: string;
  title: string;
  brief: string;
  compensation: string;
  deliverables: string;
  deadline: string | null;
  campaignName: string;
};

async function loadProjectProof(db: Db, organizationId: string): Promise<PublicProof | null> {
  try {
    const [campaigns, clicks, outcomes, partners] = await Promise.all([
      db.first<{ total: number }>(
        `SELECT COUNT(DISTINCT c.id) AS total
           FROM campaigns c
          WHERE c.organization_id = ?
            AND (EXISTS (SELECT 1 FROM tracked_links tl WHERE tl.campaign_id = c.id)
              OR EXISTS (SELECT 1 FROM conversion_events ce WHERE ce.campaign_id = c.id AND ce.source IN ('linkary_tracked','telegram_verified','provider_verified')))`,
        [organizationId],
      ),
      db.first<{ total: number }>(
        `SELECT COUNT(*) AS total
           FROM tracked_link_clicks cl
           JOIN tracked_links tl ON tl.id = cl.tracked_link_id
          WHERE tl.organization_id = ?`,
        [organizationId],
      ),
      db.first<{ total: number; value_usd: number }>(
        `SELECT COUNT(*) AS total, COALESCE(SUM(COALESCE(value_usd, 0)), 0) AS value_usd
           FROM conversion_events
          WHERE organization_id = ?
            AND source IN ('linkary_tracked','telegram_verified','provider_verified')`,
        [organizationId],
      ),
      db.first<{ total: number }>(
        `SELECT COUNT(DISTINCT p.entity_id) AS total
           FROM campaign_activity_participants p
           JOIN campaign_activities a ON a.id = p.activity_id
           JOIN campaigns c ON c.id = a.campaign_id
          WHERE c.organization_id = ?`,
        [organizationId],
      ),
    ]);
    const trackedCampaigns = Number(campaigns?.total || 0);
    const trackedClicks = Number(clicks?.total || 0);
    const verifiedOutcomes = Number(outcomes?.total || 0);
    const attributedValue = Number(outcomes?.value_usd || 0);
    const evidencePartners = Number(partners?.total || 0);
    if (!trackedCampaigns && !trackedClicks && !verifiedOutcomes && !attributedValue && !evidencePartners) return null;
    return {
      kind: 'project',
      heading: 'Growth proof',
      metrics: [
        { label: 'Tracked campaigns', value: compactNumber(trackedCampaigns) },
        { label: 'Tracked clicks', value: compactNumber(trackedClicks) },
        { label: 'Verified outcomes', value: compactNumber(verifiedOutcomes) },
        { label: 'Attributed value', value: compactUsd(attributedValue) },
        { label: 'Evidence partners', value: compactNumber(evidencePartners) },
      ],
      evidenceNote: 'Clicks are Linkary tracked. Public outcomes and attributed value include Linkary, Telegram, or provider verified events only.',
    };
  } catch {
    return null;
  }
}

async function loadCreatorProof(db: Db, profileId: string): Promise<PublicProof | null> {
  try {
    const [relationships, performance] = await Promise.all([
      db.all<{ project_name: string; campaign_name: string }>(
        `SELECT DISTINCT org.name AS project_name, c.name AS campaign_name
           FROM campaign_opportunity_applications a
           JOIN campaign_opportunities o ON o.id = a.opportunity_id
           JOIN organizations org ON org.id = o.organization_id
           JOIN campaigns c ON c.id = o.campaign_id
          WHERE a.applicant_profile_id = ? AND a.status = 'accepted'
          ORDER BY a.updated_at DESC LIMIT 8`,
        [profileId],
      ),
      db.first<{ collaborations: number; projects: number; tracked_clicks: number; outcomes: number; attributed_value_usd: number }>(
        `SELECT COUNT(*) AS collaborations,
                COUNT(DISTINCT c.organization_id) AS projects,
                COALESCE(SUM(c.tracked_clicks), 0) AS tracked_clicks,
                COALESCE(SUM(c.outcomes), 0) AS outcomes,
                COALESCE(SUM(c.attributed_value_usd), 0) AS attributed_value_usd
           FROM partner_manager_collaborations c
           JOIN partner_managers m ON m.id = c.manager_id
          WHERE m.profile_id = ? AND c.evidence_source IN ('tracked','verified')`,
        [profileId],
      ),
    ]);
    const acceptedCampaigns = relationships.length;
    const acceptedProjects = new Set(relationships.map((item) => item.project_name)).size;
    const trackedCollaborations = Number(performance?.collaborations || 0);
    const trackedClicks = Number(performance?.tracked_clicks || 0);
    const outcomes = Number(performance?.outcomes || 0);
    const value = Number(performance?.attributed_value_usd || 0);
    if (!acceptedCampaigns && !trackedCollaborations && !trackedClicks && !outcomes && !value) return null;
    return {
      kind: 'creator',
      heading: 'Campaign proof',
      metrics: [
        { label: 'Accepted campaigns', value: compactNumber(acceptedCampaigns) },
        { label: 'Projects', value: compactNumber(Math.max(acceptedProjects, Number(performance?.projects || 0))) },
        { label: 'Tracked clicks', value: compactNumber(trackedClicks) },
        { label: 'Verified outcomes', value: compactNumber(outcomes) },
        { label: 'Attributed value', value: compactUsd(value) },
      ],
      evidenceNote: 'Campaign relationships come from accepted Linkary opportunities. Performance numbers appear only from tracked or verified evidence records.',
      relationships: relationships.slice(0, 4).map((item) => ({ projectName: item.project_name, campaignName: item.campaign_name })),
    };
  } catch {
    return null;
  }
}

async function loadPublicProof(db: Db, profile: ProfileRow): Promise<PublicProof | null> {
  if (profile.profile_type === 'project' && profile.organization_id) return loadProjectProof(db, profile.organization_id);
  if (profile.profile_type === 'creator') return loadCreatorProof(db, profile.id);
  return null;
}

async function loadPublicOpportunities(db: Db, profile: ProfileRow): Promise<PublicOpportunity[]> {
  if (profile.profile_type !== 'project' || !profile.organization_id) return [];
  try {
    const rows = await db.all<{
      id: string; title: string; brief: string; compensation_text: string; deliverables_text: string; application_deadline: string | null; campaign_name: string;
    }>(
      `SELECT o.id, o.title, o.brief, o.compensation_text, o.deliverables_text, o.application_deadline, c.name AS campaign_name
         FROM campaign_opportunities o
         JOIN campaigns c ON c.id = o.campaign_id
        WHERE o.organization_id = ? AND o.status = 'open'
          AND (o.application_deadline IS NULL OR o.application_deadline >= ?)
        ORDER BY o.created_at DESC LIMIT 6`,
      [profile.organization_id, new Date().toISOString()],
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      brief: row.brief,
      compensation: row.compensation_text,
      deliverables: row.deliverables_text,
      deadline: row.application_deadline,
      campaignName: row.campaign_name,
    }));
  } catch {
    return [];
  }
}

export async function getPublishedProfile(username: string, env: Env): Promise<{ profile: ProfileRow; blocks: ProfileBlockRow[] }> {
  const db = new Db(requireDb(env));
  const profile = await db.first<ProfileRow>(`SELECT * FROM profiles WHERE username = ? AND visibility = 'published' LIMIT 1`, [username.toLowerCase()]);
  if (!profile) throw new HttpError(404, 'Profile not found', 'profile_not_found');
  const blocks = await db.all<ProfileBlockRow>(`SELECT * FROM profile_blocks WHERE profile_id = ? AND enabled = 1 ORDER BY position ASC`, [profile.id]);
  return { profile, blocks };
}

export async function publicProfileJson(username: string, env: Env): Promise<Response> {
  const { profile, blocks } = await getPublishedProfile(username, env);
  const db = new Db(requireDb(env));
  const [proof, opportunities] = await Promise.all([loadPublicProof(db, profile), loadPublicOpportunities(db, profile)]);
  const [audience, creators, communities, projects, value] = await Promise.all([
    db.first<{ total: number }>('SELECT COALESCE(SUM(a.audience_size), 0) AS total FROM partner_manager_assets a JOIN partner_managers m ON m.id = a.manager_id WHERE m.profile_id = ?', [profile.id]).catch(() => null),
    db.first<{ total: number }>("SELECT COUNT(*) AS total FROM profiles WHERE profile_type = 'creator' AND visibility = 'published'").catch(() => null),
    db.first<{ total: number }>("SELECT COUNT(DISTINCT entity_id) AS total FROM project_network_entities WHERE entity_type = 'community'").catch(() => null),
    db.first<{ total: number }>("SELECT COUNT(*) AS total FROM organizations WHERE status = 'active'").catch(() => null),
    db.first<{ total: number }>("SELECT COALESCE(SUM(COALESCE(value_usd, 0)), 0) AS total FROM conversion_events WHERE source IN ('linkary_tracked','telegram_verified','provider_verified')").catch(() => null),
  ]);
  return json({
    profile: {
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      type: profile.profile_type,
      bio: profile.bio,
      avatarUrl: profile.avatar_url,
      verificationStatus: profile.verification_status,
    },
    proof,
    opportunities,
    blocks: blocks.map((block) => {
      const raw = safeJson(block.config_json) as { mediaUrl?: unknown; chain?: unknown; role?: unknown; avatarUrl?: unknown; socialPlatform?: unknown; sectionTitle?: unknown };
      const config = Object.fromEntries(Object.entries({ mediaUrl: raw.mediaUrl, chain: raw.chain, role: raw.role, avatarUrl: raw.avatarUrl, socialPlatform: raw.socialPlatform, sectionTitle: raw.sectionTitle }).filter(([, value]) => typeof value === 'string' && value.trim()));
      return { id: block.id, type: block.block_type, title: block.title, url: block.url, config };
    }),
  }, { headers: { 'cache-control': 'public, max-age=60, s-maxage=300' } });
}

export async function profileAnalytics(request: Request, env: Env, profileId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  await requireEditableProfile(db, auth.user.id, profileId);
  const row = await db.first<{ link_clicks: number }>('SELECT COUNT(*) AS link_clicks FROM profile_engagement_events WHERE profile_id = ?', [profileId]);
  return json({ linkClicks: row?.link_clicks || 0 });
}

export async function redirectPublicProfileBlock(_request: Request, env: Env, username: string, blockId: string): Promise<Response> {
  const { profile } = await getPublishedProfile(username, env);
  const db = new Db(requireDb(env));
  const block = await db.first<ProfileBlockRow>('SELECT * FROM profile_blocks WHERE id = ? AND profile_id = ? AND enabled = 1 LIMIT 1', [blockId, profile.id]);
  if (!block?.url) throw new HttpError(404, 'Profile link not found', 'profile_link_not_found');
  try {
    await db.run("INSERT INTO profile_engagement_events (id, profile_id, block_id, event_type, created_at) VALUES (?, ?, ?, 'link_click', ?)", [`pge_${crypto.randomUUID().replace(/-/g, '')}`, profile.id, block.id, new Date().toISOString()]);
  } catch {
    /* Public redirects remain live if engagement storage is temporarily unavailable. */
  }
  return Response.redirect(block.url, 302);
}

function socialName(block: ProfileBlockRow): string {
  const config = safeJson(block.config_json) as { socialPlatform?: unknown };
  const saved = typeof config.socialPlatform === 'string' ? config.socialPlatform.toLowerCase().trim() : '';
  if (saved) return saved;
  const key = `${block.block_type} ${block.title || ''} ${block.url || ''}`.toLowerCase();
  if (key.includes('t.me/') || key.includes('telegram')) return 'telegram';
  if (key.includes('youtube') || key.includes('youtu.be')) return 'youtube';
  if (key.includes('linkedin')) return 'linkedin';
  if (key.includes('instagram')) return 'instagram';
  if (key.includes('tiktok')) return 'tiktok';
  if (key.includes('facebook')) return 'facebook';
  if (key.includes('reddit')) return 'reddit';
  if (key.includes('discord')) return 'discord';
  if (key.includes('github')) return 'github';
  if (key.includes('x.com') || key.includes('twitter')) return 'x';
  return '';
}

function publicIcon(block: ProfileBlockRow): string {
  const key = `${block.block_type} ${block.title || ''} ${block.url || ''}`.toLowerCase();
  if (block.block_type === 'work_with_me') return '✦';
  if (block.block_type === 'media_kit') return '▣';
  if (block.block_type === 'project_card') return '◫';
  if (block.block_type === 'community_card') return '◎';
  const social = socialName(block);
  const icons: Record<string, string> = {
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2.7h3.7l-8.1 9.2 9.5 9.4h-7.4l-5.8-5.7-5 5.7H1.9l8.7-9.9-9.1-8.8h7.6l5.2 5.2 4.6-5.2Zm-1.3 16.5h2L8.1 4.4H6L17.6 19.2Z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 3.6 2.8 10.8c-1.3.5-1.3 1.2-.2 1.6l4.8 1.5 1.8 5.6c.2.6.1.9.8.9.5 0 .7-.2 1-.5l2.3-2.2 4.9 3.6c.9.5 1.6.3 1.8-.8l3.2-15.1c.4-1.3-.5-1.9-1.8-1.8Zm-3 4.2-8.1 7.3-.3 3.2-1.6-5.1 9.7-6.1c.4-.3.8-.1.3.3Z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 12s0-3.2-.4-4.7a3.1 3.1 0 0 0-2.2-2.2C18.9 4.7 12 4.7 12 4.7s-6.9 0-8.4.4a3.1 3.1 0 0 0-2.2 2.2C1 8.8 1 12 1 12s0 3.2.4 4.7a3.1 3.1 0 0 0 2.2 2.2c1.5.4 8.4.4 8.4.4s6.9 0 8.4-.4a3.1 3.1 0 0 0 2.2-2.2C23 15.2 23 12 23 12Zm-13.8 3.6V8.4l6.2 3.6-6.2 3.6Z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 3.5A2.2 2.2 0 1 1 5.1 8a2.2 2.2 0 0 1 .1-4.5ZM3.3 9.8h3.8v10.7H3.3V9.8Zm6.2 0h3.6v1.5h.1c.5-.9 1.7-1.9 3.6-1.9 3.9 0 4.6 2.5 4.6 5.8v5.3h-3.8v-4.7c0-1.1 0-2.6-1.6-2.6s-1.9 1.2-1.9 2.5v4.8H9.5V9.8Z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.1 21v-8h2.7l.4-3.1h-3.1V8c0-.9.3-1.5 1.6-1.5h1.7V3.7c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.2v2H8.2V13H11v8h3.1Z"/></svg>',
    reddit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.8 4.1 16 7.4c1.5.1 2.9.6 4.1 1.4.5-.4 1.1-.7 1.8-.7a2.1 2.1 0 1 1-1.3 3.8c.1.4.1.8.1 1.2 0 3.5-3.9 6.3-8.7 6.3S3.3 16.6 3.3 13.1c0-.4 0-.8.1-1.2A2.1 2.1 0 1 1 2.1 8c.7 0 1.3.3 1.8.7 1.4-1 3-1.5 4.8-1.5l1.5-4.2 4.6 1.1Zm-5.3 8.4a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Zm5 0a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Zm-5.1 2.4c.8.7 2.1 1 2.6 1s1.8-.3 2.6-1c.2-.2.5-.2.7 0 .2.2.2.5 0 .7-.9.9-2.5 1.4-3.3 1.4s-2.4-.5-3.3-1.4c-.2-.2-.2-.5 0-.7.2-.2.5-.2.7 0Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5Zm0 2A2.5 2.5 0 1 0 14.5 12 2.5 2.5 0 0 0 12 9.5Zm5.2-3.3a1.1 1.1 0 1 1-1.1 1.1 1.1 1.1 0 0 1 1.1-1.1Z"/></svg>',
    tiktok: '<span class="letter-icon">♪</span>', discord: '<span class="letter-icon">◉</span>', github: '<span class="letter-icon">◌</span>', website: '<span class="letter-icon">↗</span>'
  };
  if (icons[social]) return icons[social];
  return '↗';
}

function isSocialBlock(block: ProfileBlockRow): boolean {
  const identity = `${block.block_type} ${block.title || ''} ${block.url || ''}`.toLowerCase();
  return ['telegram','youtube','tiktok','instagram','facebook','reddit','linkedin','social_link'].includes(block.block_type)
    || ['x.com/','twitter.com/','t.me/','linkedin.com/','instagram.com/','tiktok.com/','youtube.com/','youtu.be/','discord.gg/','discord.com/'].some((value) => identity.includes(value));
}

function proofHtml(proof: PublicProof | null): string {
  if (!proof) return '';
  const metrics = proof.metrics.map((metric) => `<div class="proof-metric"><strong>${escapeHtml(metric.value)}</strong><span>${escapeHtml(metric.label)}</span></div>`).join('');
  const relationships = proof.relationships?.length
    ? `<div class="proof-relationships">${proof.relationships.map((item) => `<span><b>${escapeHtml(item.projectName)}</b><small>${escapeHtml(item.campaignName)}</small></span>`).join('')}</div>`
    : '';
  return `<section class="section proof-section"><div class="section-title"><span>LINKARY VERIFIED</span><h2>${escapeHtml(proof.heading)}</h2></div><div class="proof-card"><div class="proof-grid">${metrics}</div>${relationships}<p>${escapeHtml(proof.evidenceNote)}</p></div></section>`;
}

function opportunitiesHtml(opportunities: PublicOpportunity[], appBase: string): string {
  if (!opportunities.length) return '';
  const cards = opportunities.map((opportunity) => {
    const deadline = opportunity.deadline ? new Date(opportunity.deadline) : null;
    const deadlineLabel = deadline && !Number.isNaN(deadline.getTime()) ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(deadline) : null;
    return `<article class="opportunity-card"><div><small>${escapeHtml(opportunity.campaignName)}</small><strong>${escapeHtml(opportunity.title)}</strong></div>${opportunity.brief ? `<p>${escapeHtml(opportunity.brief)}</p>` : ''}<div class="opportunity-meta">${opportunity.compensation ? `<span><b>Compensation</b>${escapeHtml(opportunity.compensation)}</span>` : ''}${opportunity.deliverables ? `<span><b>Deliverables</b>${escapeHtml(opportunity.deliverables)}</span>` : ''}${deadlineLabel ? `<span><b>Apply by</b>${escapeHtml(deadlineLabel)}</span>` : ''}</div></article>`;
  }).join('');
  return `<section class="section opportunities-section"><div class="section-title"><span>OPEN ON LINKARY</span><h2>Campaign opportunities</h2></div><div class="opportunity-grid">${cards}</div><a class="opportunity-cta" href="${escapeHtml(`${appBase}/campaigns`)}">View and apply on Linkary ↗</a></section>`;
}

async function renderPublicProfileV2(request: Request, env: Env, username: string): Promise<Response> {
  const { profile, blocks } = await getPublishedProfile(username, env);
  const db = new Db(requireDb(env));
  const [proof, opportunities] = await Promise.all([loadPublicProof(db, profile), loadPublicOpportunities(db, profile)]);
  const canonical = publicProfileUrl(request, env, profile.username);
  const urls = getLinkaryUrls(request, env);
  const title = profile.seo_title || `${profile.display_name} | Linkary`;
  const description = profile.seo_description || profile.bio || `Verified ${profile.profile_type} profile on Linkary.`;
  const avatarUrl = safePublicImageUrl(profile.avatar_url);
  const go = (block: ProfileBlockRow) => `${canonical}/go/${encodeURIComponent(block.id)}`;
  const socials = blocks.filter((block) => isSocialBlock(block) && block.url);
  const featured = blocks.filter((block) => ['featured_video', 'featured_article'].includes(block.block_type) && block.url).slice(0, 2);
  const images = blocks.filter((block) => block.block_type === 'featured_image' && block.url).slice(0, 6);
  const nfts = blocks.filter((block) => block.block_type === 'nft_item' && block.url).slice(0, 8);
  const products = profile.profile_type === 'project' ? blocks.filter((block) => block.block_type === 'product_feature' && block.url).slice(0, 4) : [];
  const ctas = blocks.filter((block) => ['work_with_me', 'media_kit'].includes(block.block_type) && block.url).slice(0, 2);
  const excluded = new Set(['featured_video','featured_article','featured_image','product_feature','nft_item','team_member','work_with_me','media_kit','project_card','community_card']);
  const links = blocks.filter((block) => !isSocialBlock(block) && !excluded.has(block.block_type) && block.url).slice(0, 12);
  const rainWords = [profile.username.toUpperCase(), 'LINKARY', profile.profile_type === 'project' ? 'PROJECT' : 'CREATOR', profile.verification_status === 'verified' ? 'VERIFIED' : 'PROFILE', 'PROOF', 'GROWTH', 'ATTRIBUTION', 'IDENTITY'];
  const rain = Array.from({ length: 32 }, (_, index) => {
    const word = rainWords[index % rainWords.length];
    const glyphs = 'ｱｲｳｴｵｶｷｸｹｺ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const stream = Array.from({ length: 30 }, (_item, row) => row % 7 === 0 ? word[(row + index) % word.length] : glyphs[(index * 19 + row * 11) % glyphs.length]).join('');
    return `<i style="--x:${(index * 29) % 100};--d:${15 + (index % 9) * 2}s;--l:-${(index % 12) * 1.4}s">${escapeHtml(stream)}</i>`;
  }).join('');
  const avatar = avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="" referrerpolicy="no-referrer">` : escapeHtml(profile.display_name.slice(0, 1).toUpperCase());
  const socialHtml = socials.map((block) => `<a href="${escapeHtml(go(block))}" aria-label="${escapeHtml(block.title || 'Social link')}">${publicIcon(block)}</a>`).join('');
  const sectionTitle = (items: ProfileBlockRow[], fallback: string) => {
    const configured = items.map((item) => safeJson(item.config_json) as { sectionTitle?: unknown }).find((config) => typeof config.sectionTitle === 'string' && config.sectionTitle.trim());
    return configured && typeof configured.sectionTitle === 'string' ? configured.sectionTitle.trim() : fallback;
  };
  const mediaCard = async (block: ProfileBlockRow, kind: string) => {
    const config = safeJson(block.config_json) as { mediaUrl?: string };
    const media = await resolveFeaturedPreview(config.mediaUrl, block.url, block.block_type);
    const fallback = '<span class="feature-placeholder" aria-hidden="true">▶</span>';
    const visual = media?.kind === 'video' ? `<video src="${escapeHtml(media.src)}" muted playsinline loop autoplay preload="metadata" onerror="this.hidden=true"></video>${fallback}` : media?.kind === 'image' ? `<img src="${escapeHtml(media.src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true">${fallback}` : fallback;
    return `<a class="feature" href="${escapeHtml(go(block))}">${visual}<span><small>${escapeHtml(sectionTitle([block], kind))}</small><strong>${escapeHtml(block.title || 'Featured work')}</strong><em>Explore ↗</em></span></a>`;
  };
  const gallery = async (items: ProfileBlockRow[], label: string, className = '') => {
    if (!items.length) return '';
    const cards = await Promise.all(items.map(async (block) => {
      const config = safeJson(block.config_json) as { mediaUrl?: string; chain?: string; nftContract?: string; nftTokenId?: string };
      const media = className === 'nfts'
        ? await resolveNftArtworkPreview(env, config.mediaUrl, config.chain, config.nftContract, config.nftTokenId)
        : await resolveFeaturedPreview(config.mediaUrl, block.url, 'featured_image');
      const image = media?.kind === 'image' ? media.src : '';
      return `<a href="${escapeHtml(go(block))}">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true">` : '<b class="gallery-placeholder">✦</b>'}<span>${escapeHtml(block.title || label)}</span></a>`;
    }));
    return `<section class="gallery ${className} count-${items.length}"><h2>${escapeHtml(sectionTitle(items, label))}</h2><div>${cards.join('')}</div></section>`;
  };
  const linkHtml = links.length ? `<section class="links"><h2>${profile.profile_type === 'project' ? 'Official links' : 'Links & work'}</h2>${links.map((block) => `<a href="${escapeHtml(go(block))}"><span>${publicIcon(block)}</span>${escapeHtml(block.title || 'Open link')}<b>↗</b></a>`).join('')}</section>` : '';
  const ctaHtml = ctas.length ? `<section class="public-ctas">${ctas.map((block) => `<a href="${escapeHtml(go(block))}"><span>${publicIcon(block)}</span><strong>${escapeHtml(block.title || (block.block_type === 'media_kit' ? 'View media kit' : 'Book a call'))}</strong><i>↗</i></a>`).join('')}</section>` : '';
  let css = `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#100d0b;color:#fff}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(700px 500px at 50% -10%,#ff4b1f55,transparent 70%),radial-gradient(560px 430px at 0 90%,#ff4b1f33,transparent 72%),#100d0b}.rain{position:fixed;inset:0;z-index:3;pointer-events:none;overflow:hidden;mix-blend-mode:screen}.rain i{position:absolute;left:calc(var(--x)*1%);top:-36vh;display:block;width:15px;word-break:break-all;color:#ff7048;font:700 11px/1.34 ui-monospace,monospace;text-shadow:0 0 12px #ff4b1f;opacity:.62;animation:fall var(--d) linear var(--l) infinite}@keyframes fall{to{transform:translateY(185vh)}}.shell{position:relative;z-index:2;width:min(720px,calc(100% - 28px));margin:30px auto;padding:18px 18px 44px;border:1px solid #ff704866;border-radius:28px;background:linear-gradient(180deg,#1d100ddd,#100d0bee 45%);box-shadow:0 30px 100px #000b}.top{display:flex;justify-content:space-between;align-items:center}.brand{color:#fff;text-decoration:none;font-weight:850}.brand:before{content:'≡';display:inline-grid;place-items:center;width:25px;height:25px;margin-right:7px;border-radius:7px;background:#ff4b1f;color:#100d0b}.share{border:1px solid #ffffff33;border-radius:999px;padding:8px 13px;background:#ffffff0d;color:#fff;font:700 12px inherit}.hero{text-align:center;padding:50px 10px 30px}.avatar{width:88px;height:88px;margin:auto;display:grid;place-items:center;overflow:hidden;border:2px solid #ff8d6b;border-radius:28px;background:#ff4b1f;font-size:30px;font-weight:900}.avatar img{width:100%;height:100%;object-fit:cover}.eyebrow{margin-top:15px;color:#ff9f85;font:700 10px ui-monospace,monospace;letter-spacing:.15em}.hero h1{margin:9px 0 4px;font-size:clamp(38px,8vw,62px);letter-spacing:-.07em;line-height:.95}.handle{color:#ffbba9;font-size:13px}.bio{max-width:560px;margin:17px auto 0;color:#fff3ee;line-height:1.55}.socials{display:flex;justify-content:center;gap:10px;margin-top:22px}.socials a{width:42px;height:42px;display:grid;place-items:center;border:1px solid #ff7048;border-radius:14px;background:#ff4b1f;color:#160c09;text-decoration:none;font-weight:850;box-shadow:0 7px 20px #ff4b1f38}.socials svg{width:19px;height:19px;fill:currentColor}.socials .letter-icon{font-weight:950}.features{display:grid;gap:12px}.feature{position:relative;min-height:230px;overflow:hidden;border:1px solid #ff7048;border-radius:22px;background:linear-gradient(135deg,#38170f,#ff4b1f);color:#fff;text-decoration:none}.feature img,.feature video{position:absolute;width:100%;height:100%;object-fit:cover;opacity:.8}.feature-placeholder{position:absolute;inset:0;display:grid;place-items:center;color:#ffe0d6!important;font-size:48px!important;opacity:.42}.feature:after{content:'';position:absolute;inset:0;background:linear-gradient(0deg,#100d0bf2,transparent 70%)}.feature>span:not(.feature-placeholder){position:absolute;z-index:1;left:20px;bottom:18px;display:grid;gap:6px}.feature small,.gallery h2,.links h2{color:#ffb29e;font:700 10px ui-monospace,monospace;letter-spacing:.14em}.feature strong{font-size:28px;letter-spacing:-.05em}.feature em{font-size:12px;font-style:normal}.gallery,.links{margin-top:28px}.gallery h2,.links h2{text-align:center;margin:0 0 11px}.gallery>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.gallery.count-1>div{grid-template-columns:1fr}.gallery.count-2>div{grid-template-columns:repeat(2,minmax(0,1fr))}.gallery.nfts>div{grid-template-columns:repeat(4,minmax(0,1fr))}.gallery a{position:relative;aspect-ratio:1.35/1;overflow:hidden;border:1px solid #ffb09a66;border-radius:18px;background:#26130f;color:#fff;text-decoration:none}.gallery.nfts a{aspect-ratio:1/1}.gallery img{width:100%;height:100%;object-fit:cover}.gallery-placeholder{position:absolute;inset:0;display:grid;place-items:center;color:#ff704855;font-size:42px}.gallery span{position:absolute;left:10px;right:10px;bottom:9px;font-size:12px;font-weight:800;text-shadow:0 1px 5px #000}.links{display:grid;gap:9px}.links h2{margin-bottom:2px}.links a{display:grid;grid-template-columns:34px 1fr 20px;align-items:center;gap:10px;padding:13px 14px;border-radius:16px;background:#fff;color:#1b100d;text-decoration:none;font-weight:800}.links a span{color:#ff4b1f}.links a b{color:#a84b35}@media(max-width:620px){.shell{width:100%;margin:0;border-radius:0;min-height:100vh}.hero{padding-top:42px}.gallery>div,.gallery.count-2>div{grid-template-columns:repeat(2,minmax(0,1fr))}.gallery.count-1>div{grid-template-columns:1fr}.gallery.nfts>div{grid-template-columns:repeat(2,minmax(0,1fr))}.rain i:nth-child(2n){display:none}}@media(prefers-reduced-motion:reduce){.rain i{animation:none;top:calc((var(--x)%20)*5vh)}}`;
  css += `.public-ctas{display:grid;gap:10px;margin-top:20px}.public-ctas a{display:grid;grid-template-columns:34px 1fr 18px;align-items:center;gap:10px;min-height:58px;padding:12px 15px;border-radius:17px;background:#ff4b1f;color:#160c09;text-decoration:none;box-shadow:0 10px 26px #ff4b1f33}.public-ctas span{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:#ffffff99}.public-ctas strong{font-size:14px}.public-ctas i{font-style:normal}`;
  css += `body{background:radial-gradient(720px 440px at 50% -10%,#ff4b1f20,transparent 68%),#faf9f7;color:#17110e}.shell{background:#fffffff2;border-color:#eaded9;box-shadow:0 26px 74px #2c160d18;color:#17110e}.brand{color:#17110e}.share{color:#17110e;background:#fff;border-color:#d9cbc5}.eyebrow{color:#d94320}.handle{color:#8b5a4c}.bio{color:#493a35}.socials a{background:#ff4b1f;color:#fff;border-color:#ff4b1f}.feature{background:#fff;border-color:#ead5cd;box-shadow:0 15px 35px #2c160d16}.feature:after{background:linear-gradient(0deg,#160d0bd9,transparent 74%)}.gallery a{background:#fff;border-color:#ead5cd;box-shadow:0 12px 26px #2c160d12}.links a{border:1px solid #eaded9;box-shadow:0 10px 24px #2c160d0d}.gallery h2,.links h2{color:#bb3e22}.rain{opacity:.48}`;
  const [featureCards, imageGallery, productGallery, nftGallery] = await Promise.all([
    Promise.all(featured.map((block) => mediaCard(block, block.block_type.replace('_', ' ').toUpperCase()))).then((cards) => cards.join('')),
    gallery(images, 'FEATURED IMAGES'),
    gallery(products, 'PRODUCT FEATURES'),
    gallery(nfts, 'NFT COLLECTION', 'nfts'),
  ]);
  const body = `<div class="rain" aria-hidden="true">${rain}</div><main class="shell"><header class="top"><a class="brand" href="${escapeHtml(urls.publicSite)}">Linkary</a><button class="share" data-share>Share</button></header><section class="hero"><div class="avatar">${avatar}</div><div class="eyebrow">${profile.profile_type === 'project' ? 'VERIFIED PROJECT' : 'CREATOR IDENTITY'}</div><h1>${escapeHtml(profile.display_name)}</h1><div class="handle">@${escapeHtml(profile.username)}</div>${profile.bio ? `<p class="bio">${escapeHtml(profile.bio)}</p>` : ''}<nav class="socials">${socialHtml}</nav></section>${ctaHtml}${featureCards ? `<section class="features">${featureCards}</section>` : ''}${imageGallery}${productGallery}${nftGallery}${linkHtml}${proofHtml(proof)}${opportunitiesHtml(opportunities, urls.app)}</main><script>(function(){var b=document.querySelector('[data-share]');if(!b)return;b.addEventListener('click',function(){navigator.clipboard&&navigator.clipboard.writeText('${escapeHtml(canonical)}');b.textContent='Copied';setTimeout(function(){b.textContent='Share'},1200)})})();</script>`;
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="profile"><meta property="og:site_name" content="Linkary"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><style>${css}</style></head><body>${body}</body></html>`, { headers: { 'cache-control': 'public, max-age=60, s-maxage=300' } });
}

export async function renderPublicProfile(request: Request, env: Env, username: string): Promise<Response> {
  const { profile, blocks } = await getPublishedProfile(username, env);
  const db = new Db(requireDb(env));
  const [proof, opportunities] = await Promise.all([loadPublicProof(db, profile), loadPublicOpportunities(db, profile)]);
  const canonical = publicProfileUrl(request, env, profile.username);
  const urls = getLinkaryUrls(request, env);
  const title = profile.seo_title || `${profile.display_name} | Linkary`;
  const description = profile.seo_description || profile.bio || `Verified ${profile.profile_type} profile on Linkary.`;
  const avatarUrl = safePublicImageUrl(profile.avatar_url);
  const blockUrl = (block: ProfileBlockRow) => `${canonical}/go/${encodeURIComponent(block.id)}`;

  const features = blocks.filter((block) => ['featured_video','featured_article'].includes(block.block_type) && block.url);
  const featuredImages = blocks.filter((block) => block.block_type === 'featured_image' && block.url).slice(0, 4);
  const nftItems = blocks.filter((block) => block.block_type === 'nft_item' && block.url).slice(0, 8);
  const productFeatures = profile.profile_type === 'project' ? blocks.filter((block) => block.block_type === 'product_feature' && block.url).slice(0, 4) : [];
  const socials = blocks.filter((block) => isSocialBlock(block) && block.url && !['featured_video','featured_article','featured_image','team_member'].includes(block.block_type));
  const ctas = blocks.filter((block) => ['work_with_me','media_kit'].includes(block.block_type) && block.url);
  const relationshipCards = blocks.filter((block) => ['project_card','community_card'].includes(block.block_type) && block.url);
  const teams = blocks.filter((block) => block.block_type === 'team_member' && block.url);
  const excluded = new Set(['featured_video','featured_article','featured_image','product_feature','nft_item','team_member','work_with_me','media_kit','project_card','community_card']);
  const regular = blocks.filter((block) => !isSocialBlock(block) && !excluded.has(block.block_type) && (block.block_type === 'heading' || block.url));
  const headingTitleBefore = (item: ProfileBlockRow, fallback: string): string => {
    const index = blocks.findIndex((candidate) => candidate.id === item.id);
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = blocks[cursor];
      if (candidate.block_type !== 'heading') continue;
      return candidate.title?.trim() || fallback;
    }
    return fallback;
  };
  const galleryLabel = (items: ProfileBlockRow[], fallback: string): string => {
    if (!items.length) return fallback;
    const configured = items
      .map((item) => safeJson(item.config_json) as { sectionTitle?: unknown })
      .find((config) => typeof config.sectionTitle === 'string' && config.sectionTitle.trim());
    if (configured && typeof configured.sectionTitle === 'string') return configured.sectionTitle.trim();
    return headingTitleBefore(items[0], fallback);
  };

  const firstFeatureImage = features.map((block) => {
    const config = safeJson(block.config_json) as { mediaUrl?: string };
    const media = resolveFeaturedMedia(config.mediaUrl, block.url, block.block_type);
    return media?.kind === 'image' ? media.src : null;
  }).find((value): value is string => Boolean(value));
  const previewImage = firstFeatureImage || avatarUrl || new URL('/assets/brand/linkary-banner.jpeg', canonical).toString();

  const avatar = avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="" referrerpolicy="no-referrer">` : escapeHtml((profile.display_name || profile.username).slice(0, 1).toUpperCase());
  const socialHtml = socials.map((block) => `<a class="social" href="${escapeHtml(blockUrl(block))}" aria-label="${escapeHtml(block.title || 'Social link')}">${publicIcon(block)}</a>`).join('');
  const featureCards = (await Promise.all(features.map(async (block, index) => {
    const config = safeJson(block.config_json) as { mediaUrl?: string };
    const resolved = await resolveFeaturedPreview(config.mediaUrl, block.url, block.block_type);
    const fallback = '<span class="feature-art">◆</span>';
    const media = resolved?.kind === 'video'
      ? `<video src="${escapeHtml(resolved.src)}" muted playsinline loop autoplay preload="metadata" onerror="this.hidden=true;var f=this.nextElementSibling;if(f)f.hidden=false"></video><span class="feature-art" hidden>◆</span>`
      : resolved?.kind === 'image'
        ? `<img src="${escapeHtml(resolved.src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;var f=this.nextElementSibling;if(f)f.hidden=false"><span class="feature-art" hidden>◆</span>${resolved.youtube ? '<span class="feature-play">▶</span>' : ''}`
        : fallback;
    return `<a class="feature ${index === 0 ? 'hero-feature' : ''}" href="${escapeHtml(blockUrl(block))}">${media}<span class="feature-shade"></span><span class="feature-copy"><small>${escapeHtml(block.block_type.replace('featured_', 'FEATURED ').toUpperCase())}</small><strong>${escapeHtml(block.title || 'Open featured work')}</strong><i>Explore ↗</i></span></a>`;
  }))).join('');
  const galleryStyle = `<style>.showcase{margin-top:22px}.showcase-title{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;margin:0 4px 10px;color:#ffc4b4;font:700 11px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.14em}.showcase-title span:first-child{grid-column:2;text-align:center}.showcase-title span:last-child{grid-column:3;justify-self:end;font-size:9px}.showcase-grid,.product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.showcase-item,.product-item{position:relative;min-height:180px;overflow:hidden;border:1px solid #ffffff28;border-radius:20px;background:#2a1713;color:#fff;text-decoration:none;box-shadow:0 14px 32px #0005}.showcase-item img,.product-item img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.84}.showcase-item:after,.product-item:after{content:'';position:absolute;inset:0;background:linear-gradient(0deg,#100b09e8,transparent 65%)}.showcase-item span,.product-item span{position:absolute;z-index:1;left:14px;right:14px;bottom:13px;display:grid;gap:4px}.showcase-item strong,.product-item strong{font-size:14px;line-height:1.15}.showcase-item small{color:#ffc4b4;font:700 9px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.12em}.product-item i{font-size:12px;font-style:normal;color:#ffe0d6}.showcase-art{position:absolute;inset:0;display:grid;place-items:center;font-size:64px;color:#ff654833}@media(min-width:680px){.nft-showcase .showcase-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.nft-showcase .showcase-item{min-height:132px}}@media(max-width:650px){.showcase-item{min-height:142px;border-radius:15px}.nft-showcase .showcase-item{min-height:108px}.showcase-item strong{font-size:12px}.product-item{min-height:135px}}</style>`;
  const galleryRefinement = `<style>.image-showcase .showcase-item{min-height:230px;background:#eee9e5;border-color:#ffffff3b}.image-showcase .showcase-item img{object-fit:contain;opacity:1;padding:14px}.image-showcase .showcase-item:after{background:linear-gradient(0deg,#100b09dd,transparent 52%)}.nft-showcase .showcase-item{background:#f8f6f3}.nft-showcase .showcase-item img{object-fit:contain;opacity:1;padding:8px;background:#f8f6f3}.nft-showcase .showcase-item:after{background:linear-gradient(0deg,#100b09d9,transparent 55%)}</style>`;
  const gallery = async (items: ProfileBlockRow[], className: string, label: string) => {
    if (!items.length) return '';
    const cards = await Promise.all(items.map(async (block) => {
      const config = safeJson(block.config_json) as { mediaUrl?: string; chain?: string; nftContract?: string; nftTokenId?: string };
      const media = className === 'nft-showcase'
        ? await resolveNftArtworkPreview(env, config.mediaUrl, config.chain, config.nftContract, config.nftTokenId)
        : await resolveFeaturedPreview(config.mediaUrl, block.url, 'featured_image');
      const image = media?.kind === 'image' ? `<img src="${escapeHtml(media.src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<b class="showcase-art">◇</b>';
      return `<a class="showcase-item" href="${escapeHtml(blockUrl(block))}">${image}<span><strong>${escapeHtml(block.title || 'Featured item')}</strong>${config.chain ? `<small>${escapeHtml(config.chain)}</small>` : ''}</span></a>`;
    }));
    return `<section class="showcase ${className}"><div class="showcase-title"><span>${label}</span><span>${items.length}</span></div><div class="showcase-grid">${cards.join('')}</div></section>`;
  };
  const productGallery = async () => {
    if (!productFeatures.length) return '';
    const cards = await Promise.all(productFeatures.map(async (block) => {
      const config = safeJson(block.config_json) as { mediaUrl?: string };
      const media = await resolveFeaturedPreview(config.mediaUrl, block.url, 'featured_image');
      const image = media?.kind === 'image' ? `<img src="${escapeHtml(media.src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<b class="showcase-art">◆</b>';
      return `<a class="product-item" href="${escapeHtml(blockUrl(block))}">${image}<span><strong>${escapeHtml(block.title || 'Product feature')}</strong><i>Explore ↗</i></span></a>`;
    }));
    return `<section class="showcase product-showcase"><div class="showcase-title"><span>${escapeHtml(galleryLabel(productFeatures, 'PRODUCT FEATURES'))}</span><span>${productFeatures.length}</span></div><div class="product-grid">${cards.join('')}</div></section>`;
  };
  const [productHtml, imageHtml, nftHtml] = await Promise.all([
    productGallery(),
    gallery(featuredImages, 'image-showcase', escapeHtml(galleryLabel(featuredImages, 'FEATURED IMAGES'))),
    gallery(nftItems, 'nft-showcase', escapeHtml(galleryLabel(nftItems, 'COLLECTED IDENTITY'))),
  ]);
  const featureHtml = featureCards + (productHtml || featuredImages.length || nftItems.length ? `${galleryStyle}${galleryRefinement}${productHtml}${imageHtml}${nftHtml}` : '');

  const ctaHtml = ctas.length ? `<section class="cta-grid">${ctas.map((block) => `<a class="cta-card ${block.block_type}" href="${escapeHtml(blockUrl(block))}"><span>${publicIcon(block)}</span><div><small>${block.block_type === 'media_kit' ? 'MEDIA KIT' : profile.profile_type === 'project' ? 'COLLABORATE' : 'AVAILABLE FOR WORK'}</small><strong>${escapeHtml(block.title || (block.block_type === 'media_kit' ? 'View media kit' : 'Work with me'))}</strong></div><i>↗</i></a>`).join('')}</section>` : '';
  const relationshipHtml = relationshipCards.length ? `<section class="section"><div class="section-title"><span>RELATIONSHIPS</span><h2>${profile.profile_type === 'project' ? 'Community' : 'Projects & communities'}</h2></div><div class="relationship-grid">${relationshipCards.map((block) => `<a class="relationship-card" href="${escapeHtml(blockUrl(block))}"><b>${publicIcon(block)}</b><span><small>${block.block_type === 'project_card' ? 'PROJECT' : 'COMMUNITY'}</small><strong>${escapeHtml(block.title || 'Open')}</strong></span><i>↗</i></a>`).join('')}</div></section>` : '';
  const teamHtml = teams.map((block) => {
    const config = safeJson(block.config_json) as { role?: string; avatarUrl?: string };
    const teamAvatar = safePublicImageUrl(config.avatarUrl || null);
    const image = teamAvatar ? `<img src="${escapeHtml(teamAvatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : escapeHtml((block.title || '?').slice(0, 1).toUpperCase());
    return `<a class="team-card" href="${escapeHtml(blockUrl(block))}"><b>${image}</b><span><strong>${escapeHtml(block.title || 'Team member')}</strong><small>${escapeHtml(String(config.role || 'Team member'))}</small></span><i>↗</i></a>`;
  }).join('');
  const teamSection = teamHtml ? `<section class="section"><div class="section-title"><span>THE PEOPLE</span><h2>Team</h2></div><div class="team-grid">${teamHtml}</div></section>` : '';
  const regularGroups: Array<{ title: string | null; items: ProfileBlockRow[] }> = [];
  let currentRegularTitle: string | null = null;
  let currentRegularItems: ProfileBlockRow[] = [];
  const flushRegularGroup = () => {
    if (!currentRegularItems.length) return;
    regularGroups.push({ title: currentRegularTitle, items: currentRegularItems });
    currentRegularItems = [];
  };
  for (const block of regular) {
    if (block.block_type === 'heading') {
      flushRegularGroup();
      currentRegularTitle = block.title?.trim() || null;
      continue;
    }
    currentRegularItems.push(block);
  }
  flushRegularGroup();
  const regularSection = regularGroups.map((group) => {
    const heading = group.title || (profile.profile_type === 'project' ? 'Official links' : 'Links & work');
    const kicker = group.title ? 'PROFILE SECTION' : 'LINKARY PROFILE';
    const cards = group.items.map((block) => `<a class="link-card" href="${escapeHtml(blockUrl(block))}"><b>${publicIcon(block)}</b><span>${escapeHtml(block.title || block.url || 'Open link')}</span><i>↗</i></a>`).join('');
    return `<section class="section"><div class="section-title"><span>${kicker}</span><h2>${escapeHtml(heading)}</h2></div><div class="links">${cards}</div></section>`;
  }).join('');

  const structuredData = safeScriptJson({ '@context': 'https://schema.org', '@type': profile.profile_type === 'project' ? 'Organization' : 'Person', name: profile.display_name, url: canonical, description, ...(avatarUrl ? { image: avatarUrl } : {}) });
  const shareData = safeScriptJson({ title, text: description, url: canonical });
  const typeLabel = profile.profile_type === 'project' ? 'PROJECT IDENTITY' : 'CREATOR IDENTITY';
  let networkTokens = ['LINKARY', 'IDENTITY', 'PROOF', 'GROWTH', 'ATTRIBUTION'];
  try {
    const [users, creators, projects, communities, value] = await Promise.all([
      db.first<{ total: number }>('SELECT COUNT(*) AS total FROM users'),
      db.first<{ total: number }>(`SELECT COUNT(*) AS total FROM profiles WHERE profile_type = 'creator' AND visibility = 'published'`),
      db.first<{ total: number }>(`SELECT COUNT(*) AS total FROM organizations WHERE status = 'active'`),
      db.first<{ total: number }>(`SELECT COUNT(DISTINCT entity_id) AS total FROM project_network_entities WHERE entity_type = 'community'`),
      db.first<{ total: number }>(`SELECT COALESCE(SUM(COALESCE(value_usd, 0)), 0) AS total FROM conversion_events WHERE source IN ('linkary_tracked','telegram_verified','provider_verified')`),
    ]);
    networkTokens = [`USERS ${compactNumber(Number(users?.total || 0))}`, `CREATORS ${compactNumber(Number(creators?.total || 0))}`, `PROJECTS ${compactNumber(Number(projects?.total || 0))}`, `COMMUNITIES ${compactNumber(Number(communities?.total || 0))}`, `VALUE ${compactUsd(Number(value?.total || 0))}`, ...networkTokens];
  } catch {
    // Public profile rendering must remain available when an optional aggregate is unavailable.
  }
  const rainTokens = Array.from(new Set([profile.display_name, `@${profile.username}`, ...networkTokens, profile.profile_type === 'project' ? 'PROJECT' : 'CREATOR'])).slice(0, 18);
  const matrix = Array.from({ length: 38 }, (_, index) => {
    const token = rainTokens[index % rainTokens.length];
    const x = 1 + ((index * 29) % 97);
    const delay = -((index * 1.37) % 17).toFixed(2);
    const duration = (18 + ((index * 5) % 12)).toFixed(2);
    const glyphs = 'ｱｲｳｴｵｶｷｸｹｺ01ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const tokenChars = Array.from(`${token}${String(index + 1).padStart(2, '0')}LINKARY`.toUpperCase());
    const stream = Array.from({ length: 42 }, (_, glyphIndex) => {
      const useToken = index % 4 === 0 && glyphIndex % 5 === 0;
      return useToken ? tokenChars[(glyphIndex / 5 + index) % tokenChars.length] : glyphs[(index * 13 + glyphIndex * 17) % glyphs.length];
    }).join('\n');
    return `<span style="--x:${x};--delay:${delay}s;--duration:${duration}s">${escapeHtml(stream)}</span>`;
  }).join('');
  const rainConfig = safeScriptJson(rainTokens);

  let css = `:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f6f2ec;background:#100d0b}*{box-sizing:border-box}body{min-height:100vh;margin:0;background:radial-gradient(900px 560px at 50% -12%,#ff633f 0,transparent 58%),radial-gradient(700px 550px at 0 75%,#3e1712 0,transparent 62%),#100d0b}.matrix{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;opacity:.65}.matrix span{position:absolute;top:-58vh;left:calc(var(--x)*1%);white-space:pre;color:#ff6847;font:700 10px/1.24 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em;text-shadow:0 0 18px #ff593788;animation:rain var(--duration) linear var(--delay) infinite;opacity:.68}@keyframes rain{to{transform:translateY(210vh)}}.page{position:relative;z-index:1;width:min(780px,100%);margin:auto;padding:24px 20px 54px}.top{display:flex;justify-content:space-between;align-items:center}.brand{color:#fff;text-decoration:none;font-size:15px;font-weight:850;letter-spacing:-.04em}.brand:before{content:'≡';display:inline-grid;place-items:center;width:27px;height:27px;margin-right:7px;border-radius:7px;background:#ff5a36;color:#111;font-size:20px;vertical-align:middle}.share{border:1px solid #ffffff2c;border-radius:999px;padding:10px 14px;background:#ffffff12;color:#fff;font:700 12px/1 inherit;cursor:pointer}.hero{margin:56px 0 26px;text-align:center}.avatar{width:96px;height:96px;margin:auto;border:3px solid #ffffff66;border-radius:32px;display:grid;place-items:center;overflow:hidden;background:linear-gradient(145deg,#ff5a36,#26100d);box-shadow:0 18px 50px #0008;color:#fff;font-size:34px;font-weight:900}.avatar img,.team-card b img{width:100%;height:100%;object-fit:cover}.eyebrow{margin-top:17px;color:#ffc4b4;font:700 10px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.15em}.hero h1{margin:9px 0 5px;font-size:clamp(38px,9vw,60px);letter-spacing:-.075em;line-height:.94}.handle{color:#d6c8c0;font-size:14px}.bio{max-width:610px;margin:18px auto 0;color:#efe4dc;font-size:16px;line-height:1.58}.socials{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin:23px 0 30px}.social{width:44px;height:44px;display:grid;place-items:center;border:1px solid #ffffff2e;border-radius:14px;background:#ffffff10;color:#fff;text-decoration:none;font-weight:850;transition:transform .18s ease,background .18s ease}.social:hover{transform:translateY(-3px);background:#ff5a36;color:#15100e}.cta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 18px}.cta-card{display:grid;grid-template-columns:42px 1fr 20px;align-items:center;gap:11px;min-height:78px;padding:12px 14px;border-radius:19px;background:#ff6543;color:#17110e;text-decoration:none;box-shadow:0 12px 30px #0004}.cta-card.media_kit{background:#f5eee9}.cta-card>span{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;background:#ffffff90;font-weight:900}.cta-card>div{display:grid;gap:4px}.cta-card small{font:800 9px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em}.cta-card strong{font-size:15px}.cta-card i{font-style:normal}.features{display:grid;gap:14px}.feature{position:relative;min-height:220px;overflow:hidden;border:1px solid #ffffff24;border-radius:24px;background:linear-gradient(130deg,#2c1510,#c74327);color:#fff;text-decoration:none;box-shadow:0 18px 44px #0005}.feature img,.feature video{position:absolute;width:100%;height:100%;object-fit:cover;opacity:.78}.feature-art{position:absolute;right:8%;top:13%;font-size:120px;color:#ffffff18}.feature-play{position:absolute;inset:50% auto auto 50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:58px;height:58px;border-radius:999px;background:#0009;border:1px solid #ffffff55}.feature-shade{position:absolute;inset:0;background:linear-gradient(0deg,#100b09 0%,#100b0970 48%,transparent 100%)}.feature-copy{position:absolute;inset:auto 22px 20px;display:grid;gap:7px}.feature-copy small,.section-title span{font:700 10px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.13em;color:#ffc4b4}.feature-copy strong{font-size:clamp(22px,4vw,31px);letter-spacing:-.05em}.feature-copy i{font-size:13px;font-style:normal;color:#ffe0d6}.section{margin-top:32px}.section-title{display:flex;align-items:baseline;justify-content:space-between;margin:0 4px 12px}.section-title h2{margin:0;font-size:18px;letter-spacing:-.04em}.proof-card{border:1px solid #ff795a55;border-radius:22px;background:linear-gradient(145deg,#321a15,#160f0d);padding:16px;box-shadow:0 18px 40px #0004}.proof-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.proof-metric{min-width:0;border:1px solid #ffffff17;border-radius:15px;background:#ffffff0b;padding:12px 10px}.proof-metric strong{display:block;font-size:20px;letter-spacing:-.05em}.proof-metric span{display:block;margin-top:5px;color:#cabbb4;font-size:10px;line-height:1.25}.proof-card>p{margin:12px 2px 0;color:#a99a93;font-size:11px;line-height:1.5}.proof-relationships{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.proof-relationships span{display:grid;gap:2px;border-radius:12px;background:#ffffff0b;padding:8px 10px}.proof-relationships b{font-size:11px}.proof-relationships small{color:#b9aaa3;font-size:10px}.opportunity-grid{display:grid;gap:9px}.opportunity-card{border:1px solid #ffffff1f;border-radius:18px;background:#fff;color:#17110e;padding:14px 15px}.opportunity-card>div:first-child{display:grid;gap:4px}.opportunity-card>div:first-child small{color:#a4513e;font:800 9px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em}.opportunity-card strong{font-size:17px;letter-spacing:-.03em}.opportunity-card>p{margin:9px 0;color:#655853;font-size:12px;line-height:1.5}.opportunity-meta{display:flex;flex-wrap:wrap;gap:8px}.opportunity-meta span{display:flex;gap:5px;border-radius:9px;background:#f6efeb;padding:7px 8px;color:#6e5a52;font-size:10px}.opportunity-meta b{color:#a4503d}.opportunity-cta{display:block;margin-top:9px;border-radius:15px;background:#ff6543;padding:12px 14px;text-align:center;color:#17110e;text-decoration:none;font-size:12px;font-weight:850}.relationship-grid,.team-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.relationship-card,.team-card,.link-card{min-height:68px;display:grid;grid-template-columns:42px 1fr 20px;align-items:center;gap:12px;padding:10px 15px;border:1px solid #ffffff1f;border-radius:18px;background:#fff;color:#17110e;text-decoration:none;box-shadow:0 9px 25px #0003}.relationship-card b,.team-card b,.link-card b{width:38px;height:38px;display:grid;place-items:center;overflow:hidden;border-radius:12px;background:#f8e7e1;color:#ec4e2c;font-size:15px}.relationship-card span,.team-card span{display:grid;gap:3px}.relationship-card small,.team-card small{font-size:10px;color:#816e65}.relationship-card i,.team-card i,.link-card i{font-style:normal;color:#9b8177}.links{display:grid;gap:9px}.link-card span{font-size:14px;font-weight:780}.section-break{padding:15px 4px 2px;color:#ffc4b4;font:700 10px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.14em}footer{margin-top:40px;color:#bcaea6;text-align:center;font-size:12px}footer strong{color:#ff6a49}@media(max-width:650px){.page{padding:18px 14px 38px}.hero{margin:44px 0 23px}.avatar{width:82px;height:82px;border-radius:27px}.bio{font-size:15px}.cta-grid,.relationship-grid,.team-grid{grid-template-columns:1fr}.feature{min-height:185px;border-radius:20px}.proof-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.proof-metric:last-child{grid-column:1/3}.matrix span:nth-child(3n){display:none}.matrix{opacity:.46}.matrix span{font-size:9px}}@media(prefers-reduced-motion:reduce){.matrix{display:none}}`;
  css += `@media(min-width:820px){.page{min-height:unset;margin:38px auto;border:1px solid #ff704855;border-radius:30px;overflow:hidden;background:linear-gradient(180deg,#2a130fe6 0%,#100d0be8 32%,#100d0bf0 100%);box-shadow:0 24px 90px #000b}}@media(max-width:819px){.page{background:#160d0be8;border-color:#ff704855}}.matrix{display:block!important;z-index:10!important;opacity:.78!important;mix-blend-mode:screen}.matrix-fallback{position:fixed!important;inset:0!important;overflow:hidden!important;pointer-events:none!important}.matrix-fallback span{display:block!important;z-index:1!important;top:-20vh!important;color:#ff7048!important;opacity:.82!important;text-shadow:0 0 14px #ff4b1f!important}`;

  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="profile"><meta property="og:site_name" content="Linkary"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(previewImage)}"><meta property="og:image:secure_url" content="${escapeHtml(previewImage)}"><meta property="og:image:alt" content="${escapeHtml(`${profile.display_name} on Linkary`)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(previewImage)}"><meta name="twitter:image:alt" content="${escapeHtml(`${profile.display_name} on Linkary`)}"><script type="application/ld+json">${structuredData}</script><style>${css}</style></head><body><canvas class="matrix" aria-hidden="true"></canvas><main class="page"><header class="top"><a class="brand" href="${escapeHtml(urls.publicSite)}">Linkary</a><button class="share" type="button" data-share>Share</button></header><section class="hero"><div class="avatar">${avatar}</div><div class="eyebrow">${typeLabel}</div><h1>${escapeHtml(profile.display_name)}</h1><div class="handle">@${escapeHtml(profile.username)}</div>${profile.bio ? `<p class="bio">${escapeHtml(profile.bio)}</p>` : ''}</section>${socialHtml ? `<nav class="socials" aria-label="Social links">${socialHtml}</nav>` : ''}${ctaHtml}${featureHtml ? `<section class="features">${featureHtml}</section>` : ''}${proofHtml(proof)}${opportunitiesHtml(opportunities, urls.app)}${relationshipHtml}${regularSection}${teamSection}<footer>Built on <strong>Linkary</strong> · Identity that compounds</footer></main><script>(function(){var c=document.querySelector('.matrix');if(!c)return;var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;var ctx=c.getContext('2d'),tokens=${rainConfig},glyphs='ｱｲｳｴｵｶｷｸｹｺ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',size=15,columns=[],width=0,height=0;function resize(){var dpr=Math.min(window.devicePixelRatio||1,2);width=window.innerWidth;height=window.innerHeight;c.width=width*dpr;c.height=height*dpr;c.style.width=width+'px';c.style.height=height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);var count=Math.ceil(width/size);columns=Array.from({length:count},function(_,i){return{y:(i*17)%Math.ceil(height/size),length:8+(i%13),speed:reduced?0:.22+(i%7)*.065,seed:i,token:i%9===0?String(tokens[i%tokens.length]||'LINKARY').toUpperCase():''};});}function draw(){ctx.clearRect(0,0,width,height);ctx.font='700 '+size+'px ui-monospace,SFMono-Regular,monospace';ctx.textAlign='center';columns.forEach(function(col,i){for(var trail=0;trail<col.length;trail++){var y=(col.y-trail)*size;if(y< -size||y>height+size)continue;var alpha=trail===0?1:Math.max(.05,.62-trail*.065);ctx.fillStyle=trail===0?'#ff7048':'rgba(184,58,34,'+alpha+')';var ch=col.token&&trail<col.token.length?col.token[(Math.floor(col.y)+trail)%col.token.length]:glyphs[(col.seed*31+Math.floor(col.y)+trail*17)%glyphs.length];ctx.shadowBlur=trail===0?12:5;ctx.shadowColor=trail===0?'#ff7048':'#b83a22';ctx.fillText(ch,i*size+size/2,y);}col.y+=col.speed;if(col.y-col.length>height/size){col.y=-(i%23)*7-10;col.length=8+((i*7+Math.floor(col.y))%14);}});if(!reduced)requestAnimationFrame(draw);}resize();window.addEventListener('resize',resize,{passive:true});draw();})();</script><script>(function(){var b=document.querySelector('[data-share]');if(!b)return;var d=${shareData};b.addEventListener('click',async function(){try{if(navigator.share){await navigator.share(d);return;}if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(d.url);b.textContent='Copied';setTimeout(function(){b.textContent='Share';},1800);return;}window.prompt('Copy this Linkary profile URL',d.url);}catch(e){if(e&&e.name==='AbortError')return;window.prompt('Copy this Linkary profile URL',d.url);}});})();</script></body></html>`, { headers: { 'cache-control': 'public, max-age=60, s-maxage=300' } });
}
export async function renderSitemap(request: Request, env: Env): Promise<Response> {
  const db = new Db(requireDb(env));
  const rows = await db.all<{ username: string; updated_at: string }>(`SELECT username, updated_at FROM profiles WHERE visibility = 'published' ORDER BY updated_at DESC LIMIT 50000`);
  const urls = rows.map((row) => `<url><loc>${escapeHtml(publicProfileUrl(request, env, row.username))}</loc><lastmod>${escapeHtml(row.updated_at.slice(0, 10))}</lastmod></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } });
}

async function canEditProfile(db: Db, userId: string, profile: ProfileRow): Promise<boolean> {
  if (profile.profile_type === 'creator') return profile.owner_user_id === userId;
  if (!profile.organization_id) return false;
  const membership = await organizationMembership(db, userId, profile.organization_id);
  return Boolean(membership && ['owner','admin','marketing_manager'].includes(membership.role));
}

async function requireEditableProfile(db: Db, userId: string, profileId: string): Promise<ProfileRow> {
  const profile = await db.first<ProfileRow>(`SELECT * FROM profiles WHERE id = ?`, [profileId]);
  if (!profile) throw new HttpError(404, 'Profile not found', 'profile_not_found');
  if (!(await canEditProfile(db, userId, profile))) throw new HttpError(403, 'Profile edit access denied', 'forbidden');
  return profile;
}

export async function getEditableProfile(request: Request, env: Env, profileId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const profile = await requireEditableProfile(db, auth.user.id, profileId);
  return json({ profile: { id: profile.id, displayName: profile.display_name, bio: profile.bio, avatarUrl: profile.avatar_url, seoTitle: profile.seo_title, seoDescription: profile.seo_description, visibility: profile.visibility } });
}

function cleanText(value: unknown, max: number): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Invalid text field', 'invalid_profile_field');
  return value.trim().slice(0, max);
}

function validateDestination(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Invalid URL', 'invalid_url');
  let url: URL;
  try { url = new URL(value); } catch { throw new HttpError(400, 'Invalid URL', 'invalid_url'); }
  if (!['http:','https:'].includes(url.protocol)) throw new HttpError(400, 'Only HTTP(S) links are supported', 'invalid_url');
  return url.toString();
}

function validateProfileImage(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Invalid image URL', 'invalid_url');
  const safe = safeHttpsUrl(value);
  if (!safe) throw new HttpError(400, 'Use a secure HTTPS image URL', 'invalid_url');
  return safe;
}

export async function updateProfile(request: Request, env: Env, profileId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const profile = await requireEditableProfile(db, auth.user.id, profileId);
  const body = await readJson<{ displayName?: string; bio?: string; avatarUrl?: string | null; seoTitle?: string; seoDescription?: string }>(request);
  const avatarProvided = body.avatarUrl !== undefined;
  const avatarValue = avatarProvided ? validateProfileImage(body.avatarUrl) : null;
  await db.run(`UPDATE profiles SET display_name = COALESCE(?, display_name), bio = COALESCE(?, bio), avatar_url = CASE WHEN ? = 1 THEN ? ELSE avatar_url END, seo_title = ?, seo_description = ?, updated_at = ? WHERE id = ?`, [cleanText(body.displayName,80), cleanText(body.bio,500), avatarProvided ? 1 : 0, avatarValue, cleanText(body.seoTitle,70), cleanText(body.seoDescription,180), new Date().toISOString(), profile.id]);
  return json({ ok: true, profileId: profile.id });
}

export async function listProfileBlocks(request: Request, env: Env, profileId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  await requireEditableProfile(db, auth.user.id, profileId);
  const blocks = await db.all<ProfileBlockRow>(`SELECT * FROM profile_blocks WHERE profile_id = ? ORDER BY position ASC`, [profileId]);
  return json({ blocks: blocks.map((block) => ({ id: block.id, type: block.block_type, title: block.title, url: block.url, enabled: Boolean(block.enabled), config: safeJson(block.config_json) })) });
}

const ALLOWED_BLOCK_TYPES = new Set(['link','social_link','telegram','youtube','tiktok','instagram','facebook','reddit','linkedin','website','booking','custom_button','featured_article','featured_video','featured_image','product_feature','nft_item','campaign_proof','media_kit','work_with_me','project_card','community_card','team_member','heading']);

function validateNftDestinationUrl(value: string | null | undefined): string | null {
  return validateDestination(value);
}

export async function addProfileBlock(request: Request, env: Env, profileId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const profile = await requireEditableProfile(db, auth.user.id, profileId);
  const body = await readJson<{ type?: string; title?: string; url?: string; config?: unknown }>(request);
  if (!body.type || !ALLOWED_BLOCK_TYPES.has(body.type)) throw new HttpError(400, 'Unsupported profile block type', 'invalid_block_type');
  if (body.type === 'product_feature' && profile.profile_type !== 'project') throw new HttpError(403, 'Product features are available on Project profiles', 'project_profile_required');
  const positionRow = await db.first<{ next_position: number }>(`SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM profile_blocks WHERE profile_id = ?`, [profileId]);
  const blockId = `blk_${crypto.randomUUID().replace(/-/g, '')}`;
  const timestamp = new Date().toISOString();
  const destination = body.type === 'nft_item' ? validateNftDestinationUrl(body.url) : validateDestination(body.url);
  await db.run(`INSERT INTO profile_blocks (id, profile_id, block_type, position, enabled, title, url, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`, [blockId, profileId, body.type, positionRow?.next_position || 0, cleanText(body.title,120), destination, JSON.stringify(body.config || {}), timestamp, timestamp]);
  return json({ id: blockId }, { status: 201 });
}

export async function updateProfileBlock(request: Request, env: Env, profileId: string, blockId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  await requireEditableProfile(db, auth.user.id, profileId);
  const existing = await db.first<{ id: string; block_type: string }>(`SELECT id, block_type FROM profile_blocks WHERE id = ? AND profile_id = ?`, [blockId, profileId]);
  if (!existing) throw new HttpError(404, 'Block not found', 'block_not_found');
  const body = await readJson<{ title?: string; url?: string | null; enabled?: boolean; config?: unknown }>(request);
  const urlProvided = body.url !== undefined;
  const nextUrl = urlProvided ? existing.block_type === 'nft_item' ? validateNftDestinationUrl(body.url) : validateDestination(body.url) : null;
  await db.run(`UPDATE profile_blocks SET title = COALESCE(?, title), url = CASE WHEN ? = 1 THEN ? ELSE url END, enabled = COALESCE(?, enabled), config_json = COALESCE(?, config_json), updated_at = ? WHERE id = ? AND profile_id = ?`, [cleanText(body.title,120), urlProvided ? 1 : 0, nextUrl, body.enabled === undefined ? null : body.enabled ? 1 : 0, body.config === undefined ? null : JSON.stringify(body.config), new Date().toISOString(), blockId, profileId]);
  return json({ ok: true });
}

export async function reorderProfileBlocks(request: Request, env: Env, profileId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  await requireEditableProfile(db, auth.user.id, profileId);
  const body = await readJson<{ blockIds?: string[] }>(request);
  if (!Array.isArray(body.blockIds) || new Set(body.blockIds).size !== body.blockIds.length || body.blockIds.length > 100) throw new HttpError(400, 'Invalid block order', 'invalid_block_order');
  const current = await db.all<{ id: string }>(`SELECT id FROM profile_blocks WHERE profile_id = ?`, [profileId]);
  if (current.length !== body.blockIds.length || current.some((row) => !body.blockIds!.includes(row.id))) throw new HttpError(400, 'Block order must include every profile block exactly once', 'invalid_block_order');
  const timestamp = new Date().toISOString();
  await db.batch(body.blockIds.map((blockId, position) => db.statement(`UPDATE profile_blocks SET position = ?, updated_at = ? WHERE id = ? AND profile_id = ?`, [position, timestamp, blockId, profileId])));
  return json({ ok: true });
}

export async function deleteProfileBlock(request: Request, env: Env, profileId: string, blockId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  await requireEditableProfile(db, auth.user.id, profileId);
  await db.run(`DELETE FROM profile_blocks WHERE id = ? AND profile_id = ?`, [blockId, profileId]);
  return json({ ok: true });
}

export async function publishProfile(request: Request, env: Env, profileId: string, published: boolean): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const profile = await requireEditableProfile(db, auth.user.id, profileId);
  if (profile.verification_status !== 'verified_x') throw new HttpError(409, 'Verified X ownership is required before publishing', 'verification_required');
  const timestamp = new Date().toISOString();
  await db.run(`UPDATE profiles SET visibility = ?, published_at = ?, updated_at = ? WHERE id = ?`, [published ? 'published' : 'private', published ? timestamp : null, timestamp, profileId]);
  return json({ ok: true, visibility: published ? 'published' : 'private' });
}
