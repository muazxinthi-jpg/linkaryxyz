import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import type { ProfileBlockRow, ProfileRow } from '../db/models';
import { HttpError, html, json, readJson } from '../http';
import { getLinkaryUrls, publicProfileUrl } from '../urls';
import { requireAuth, verifyCsrf } from '../auth/session';
import { resolveFeaturedMedia, safeHttpsUrl } from '../profileMedia';
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
      const raw = safeJson(block.config_json) as { mediaUrl?: unknown; chain?: unknown; role?: unknown; avatarUrl?: unknown };
      const config = Object.fromEntries(Object.entries({ mediaUrl: raw.mediaUrl, chain: raw.chain, role: raw.role, avatarUrl: raw.avatarUrl }).filter(([, value]) => typeof value === 'string' && value.trim()));
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

function publicIcon(block: ProfileBlockRow): string {
  const key = `${block.block_type} ${block.title || ''} ${block.url || ''}`.toLowerCase();
  if (block.block_type === 'work_with_me') return '✦';
  if (block.block_type === 'media_kit') return '▣';
  if (block.block_type === 'project_card') return '◫';
  if (block.block_type === 'community_card') return '◎';
  if (key.includes('telegram')) return 'T';
  if (key.includes('youtube')) return '▶';
  if (key.includes('linkedin')) return 'in';
  if (key.includes('instagram')) return '◎';
  if (key.includes('tiktok')) return '♪';
  if (key.includes('discord')) return '◉';
  if (key.includes('x.com') || key.includes('twitter') || key.trim() === 'x') return '𝕏';
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

  const firstFeatureImage = features.map((block) => {
    const config = safeJson(block.config_json) as { mediaUrl?: string };
    const media = resolveFeaturedMedia(config.mediaUrl, block.url, block.block_type);
    return media?.kind === 'image' ? media.src : null;
  }).find((value): value is string => Boolean(value));
  const previewImage = firstFeatureImage || avatarUrl || new URL('/assets/brand/linkary-banner.jpeg', canonical).toString();

  const avatar = avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="" referrerpolicy="no-referrer">` : escapeHtml((profile.display_name || profile.username).slice(0, 1).toUpperCase());
  const socialHtml = socials.map((block) => `<a class="social" href="${escapeHtml(blockUrl(block))}" aria-label="${escapeHtml(block.title || 'Social link')}">${publicIcon(block)}</a>`).join('');
  const featureCards = features.map((block, index) => {
    const config = safeJson(block.config_json) as { mediaUrl?: string };
    const resolved = resolveFeaturedMedia(config.mediaUrl, block.url, block.block_type);
    const fallback = '<span class="feature-art">◆</span>';
    const media = resolved?.kind === 'video'
      ? `<video src="${escapeHtml(resolved.src)}" muted playsinline loop autoplay preload="metadata" onerror="this.hidden=true;var f=this.nextElementSibling;if(f)f.hidden=false"></video><span class="feature-art" hidden>◆</span>`
      : resolved?.kind === 'image'
        ? `<img src="${escapeHtml(resolved.src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;var f=this.nextElementSibling;if(f)f.hidden=false"><span class="feature-art" hidden>◆</span>${resolved.youtube ? '<span class="feature-play">▶</span>' : ''}`
        : fallback;
    return `<a class="feature ${index === 0 ? 'hero-feature' : ''}" href="${escapeHtml(blockUrl(block))}">${media}<span class="feature-shade"></span><span class="feature-copy"><small>${escapeHtml(block.block_type.replace('featured_', 'FEATURED ').toUpperCase())}</small><strong>${escapeHtml(block.title || 'Open featured work')}</strong><i>Explore ↗</i></span></a>`;
  }).join('');
  const galleryStyle = `<style>.showcase{margin-top:22px}.showcase-title{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;margin:0 4px 10px;color:#ffc4b4;font:700 11px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.14em}.showcase-title span:first-child{grid-column:2;text-align:center}.showcase-title span:last-child{grid-column:3;justify-self:end;font-size:9px}.showcase-grid,.product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.showcase-item,.product-item{position:relative;min-height:180px;overflow:hidden;border:1px solid #ffffff28;border-radius:20px;background:#2a1713;color:#fff;text-decoration:none;box-shadow:0 14px 32px #0005}.showcase-item img,.product-item img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.84}.showcase-item:after,.product-item:after{content:'';position:absolute;inset:0;background:linear-gradient(0deg,#100b09e8,transparent 65%)}.showcase-item span,.product-item span{position:absolute;z-index:1;left:14px;right:14px;bottom:13px;display:grid;gap:4px}.showcase-item strong,.product-item strong{font-size:14px;line-height:1.15}.showcase-item small{color:#ffc4b4;font:700 9px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.12em}.product-item i{font-size:12px;font-style:normal;color:#ffe0d6}.showcase-art{position:absolute;inset:0;display:grid;place-items:center;font-size:64px;color:#ff654833}@media(min-width:680px){.nft-showcase .showcase-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.nft-showcase .showcase-item{min-height:132px}}@media(max-width:650px){.showcase-item{min-height:142px;border-radius:15px}.nft-showcase .showcase-item{min-height:108px}.showcase-item strong{font-size:12px}.product-item{min-height:135px}}</style>`;
  const galleryRefinement = `<style>.image-showcase .showcase-item{min-height:230px;background:#eee9e5;border-color:#ffffff3b}.image-showcase .showcase-item img{object-fit:contain;opacity:1;padding:14px}.image-showcase .showcase-item:after{background:linear-gradient(0deg,#100b09dd,transparent 52%)}.nft-showcase .showcase-item img{object-fit:cover;opacity:1}.nft-showcase .showcase-item:after{background:linear-gradient(0deg,#100b09d9,transparent 55%)}</style>`;
  const gallery = (items: ProfileBlockRow[], className: string, label: string) => !items.length ? '' : `<section class="showcase ${className}"><div class="showcase-title"><span>${label}</span><span>${items.length}</span></div><div class="showcase-grid">${items.map((block) => { const config = safeJson(block.config_json) as { mediaUrl?: string; chain?: string }; const media = resolveFeaturedMedia(config.mediaUrl, block.url, 'featured_image'); const image = media?.kind === 'image' ? `<img src="${escapeHtml(media.src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<b class="showcase-art">◇</b>'; return `<a class="showcase-item" href="${escapeHtml(blockUrl(block))}">${image}<span><strong>${escapeHtml(block.title || 'Featured item')}</strong>${config.chain ? `<small>${escapeHtml(config.chain)}</small>` : ''}</span></a>`; }).join('')}</div></section>`;
  const productGallery = !productFeatures.length ? '' : `<section class="showcase product-showcase"><div class="showcase-title"><span>PRODUCT FEATURES</span><span>${productFeatures.length}</span></div><div class="product-grid">${productFeatures.map((block) => { const config = safeJson(block.config_json) as { mediaUrl?: string }; const media = resolveFeaturedMedia(config.mediaUrl, block.url, 'featured_image'); const image = media?.kind === 'image' ? `<img src="${escapeHtml(media.src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<b class="showcase-art">◆</b>'; return `<a class="product-item" href="${escapeHtml(blockUrl(block))}">${image}<span><strong>${escapeHtml(block.title || 'Product feature')}</strong><i>Explore ↗</i></span></a>`; }).join('')}</div></section>`;
  const featureHtml = featureCards + (productGallery || featuredImages.length || nftItems.length ? `${galleryStyle}${galleryRefinement}${productGallery}${gallery(featuredImages, 'image-showcase', 'FEATURED IMAGES')}${gallery(nftItems, 'nft-showcase', 'COLLECTED IDENTITY')}` : '');

  const ctaHtml = ctas.length ? `<section class="cta-grid">${ctas.map((block) => `<a class="cta-card ${block.block_type}" href="${escapeHtml(blockUrl(block))}"><span>${publicIcon(block)}</span><div><small>${block.block_type === 'media_kit' ? 'MEDIA KIT' : profile.profile_type === 'project' ? 'COLLABORATE' : 'AVAILABLE FOR WORK'}</small><strong>${escapeHtml(block.title || (block.block_type === 'media_kit' ? 'View media kit' : 'Work with me'))}</strong></div><i>↗</i></a>`).join('')}</section>` : '';
  const relationshipHtml = relationshipCards.length ? `<section class="section"><div class="section-title"><span>RELATIONSHIPS</span><h2>${profile.profile_type === 'project' ? 'Community' : 'Projects & communities'}</h2></div><div class="relationship-grid">${relationshipCards.map((block) => `<a class="relationship-card" href="${escapeHtml(blockUrl(block))}"><b>${publicIcon(block)}</b><span><small>${block.block_type === 'project_card' ? 'PROJECT' : 'COMMUNITY'}</small><strong>${escapeHtml(block.title || 'Open')}</strong></span><i>↗</i></a>`).join('')}</div></section>` : '';
  const teamHtml = teams.map((block) => {
    const config = safeJson(block.config_json) as { role?: string; avatarUrl?: string };
    const teamAvatar = safePublicImageUrl(config.avatarUrl || null);
    const image = teamAvatar ? `<img src="${escapeHtml(teamAvatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : escapeHtml((block.title || '?').slice(0, 1).toUpperCase());
    return `<a class="team-card" href="${escapeHtml(blockUrl(block))}"><b>${image}</b><span><strong>${escapeHtml(block.title || 'Team member')}</strong><small>${escapeHtml(String(config.role || 'Team member'))}</small></span><i>↗</i></a>`;
  }).join('');
  const teamSection = teamHtml ? `<section class="section"><div class="section-title"><span>THE PEOPLE</span><h2>Team</h2></div><div class="team-grid">${teamHtml}</div></section>` : '';
  const regularHtml = regular.map((block) => block.block_type === 'heading'
    ? `<div class="section-break">${escapeHtml(block.title || 'More')}</div>`
    : `<a class="link-card" href="${escapeHtml(blockUrl(block))}"><b>${publicIcon(block)}</b><span>${escapeHtml(block.title || block.url || 'Open link')}</span><i>↗</i></a>`).join('');
  const regularSection = regularHtml ? `<section class="section"><div class="section-title"><span>LINKARY PROFILE</span><h2>${profile.profile_type === 'project' ? 'Official links' : 'Links & work'}</h2></div><div class="links">${regularHtml}</div></section>` : '';

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
    const duration = (11 + ((index * 5) % 10)).toFixed(2);
    const glyphs = 'ｱｲｳｴｵｶｷｸｹｺ01ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const glyphStream = Array.from({ length: 24 }, (_, glyphIndex) => glyphs[(index * 13 + glyphIndex * 17) % glyphs.length]).join('\n');
    const stream = index % 3 === 0
      ? Array.from(`${token}${String(index + 1).padStart(2, '0')}LINKARY${token}`.toUpperCase()).join('\n')
      : glyphStream;
    return `<span style="--x:${x};--delay:${delay}s;--duration:${duration}s">${escapeHtml(stream)}</span>`;
  }).join('');
  const rainConfig = safeScriptJson(rainTokens);

  let css = `:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f6f2ec;background:#100d0b}*{box-sizing:border-box}body{min-height:100vh;margin:0;background:radial-gradient(900px 560px at 50% -12%,#ff633f 0,transparent 58%),radial-gradient(700px 550px at 0 75%,#3e1712 0,transparent 62%),#100d0b}.matrix{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;opacity:.65}.matrix span{position:absolute;top:-58vh;left:calc(var(--x)*1%);white-space:pre;color:#ff6847;font:700 10px/1.24 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em;text-shadow:0 0 18px #ff593788;animation:rain var(--duration) linear var(--delay) infinite;opacity:.68}@keyframes rain{to{transform:translateY(210vh)}}.page{position:relative;z-index:1;width:min(780px,100%);margin:auto;padding:24px 20px 54px}.top{display:flex;justify-content:space-between;align-items:center}.brand{color:#fff;text-decoration:none;font-size:15px;font-weight:850;letter-spacing:-.04em}.brand:before{content:'≡';display:inline-grid;place-items:center;width:27px;height:27px;margin-right:7px;border-radius:7px;background:#ff5a36;color:#111;font-size:20px;vertical-align:middle}.share{border:1px solid #ffffff2c;border-radius:999px;padding:10px 14px;background:#ffffff12;color:#fff;font:700 12px/1 inherit;cursor:pointer}.hero{margin:56px 0 26px;text-align:center}.avatar{width:96px;height:96px;margin:auto;border:3px solid #ffffff66;border-radius:32px;display:grid;place-items:center;overflow:hidden;background:linear-gradient(145deg,#ff5a36,#26100d);box-shadow:0 18px 50px #0008;color:#fff;font-size:34px;font-weight:900}.avatar img,.team-card b img{width:100%;height:100%;object-fit:cover}.eyebrow{margin-top:17px;color:#ffc4b4;font:700 10px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.15em}.hero h1{margin:9px 0 5px;font-size:clamp(38px,9vw,60px);letter-spacing:-.075em;line-height:.94}.handle{color:#d6c8c0;font-size:14px}.bio{max-width:610px;margin:18px auto 0;color:#efe4dc;font-size:16px;line-height:1.58}.socials{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin:23px 0 30px}.social{width:44px;height:44px;display:grid;place-items:center;border:1px solid #ffffff2e;border-radius:14px;background:#ffffff10;color:#fff;text-decoration:none;font-weight:850;transition:transform .18s ease,background .18s ease}.social:hover{transform:translateY(-3px);background:#ff5a36;color:#15100e}.cta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 18px}.cta-card{display:grid;grid-template-columns:42px 1fr 20px;align-items:center;gap:11px;min-height:78px;padding:12px 14px;border-radius:19px;background:#ff6543;color:#17110e;text-decoration:none;box-shadow:0 12px 30px #0004}.cta-card.media_kit{background:#f5eee9}.cta-card>span{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;background:#ffffff90;font-weight:900}.cta-card>div{display:grid;gap:4px}.cta-card small{font:800 9px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em}.cta-card strong{font-size:15px}.cta-card i{font-style:normal}.features{display:grid;gap:14px}.feature{position:relative;min-height:220px;overflow:hidden;border:1px solid #ffffff24;border-radius:24px;background:linear-gradient(130deg,#2c1510,#c74327);color:#fff;text-decoration:none;box-shadow:0 18px 44px #0005}.feature img,.feature video{position:absolute;width:100%;height:100%;object-fit:cover;opacity:.78}.feature-art{position:absolute;right:8%;top:13%;font-size:120px;color:#ffffff18}.feature-play{position:absolute;inset:50% auto auto 50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:58px;height:58px;border-radius:999px;background:#0009;border:1px solid #ffffff55}.feature-shade{position:absolute;inset:0;background:linear-gradient(0deg,#100b09 0%,#100b0970 48%,transparent 100%)}.feature-copy{position:absolute;inset:auto 22px 20px;display:grid;gap:7px}.feature-copy small,.section-title span{font:700 10px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.13em;color:#ffc4b4}.feature-copy strong{font-size:clamp(22px,4vw,31px);letter-spacing:-.05em}.feature-copy i{font-size:13px;font-style:normal;color:#ffe0d6}.section{margin-top:32px}.section-title{display:flex;align-items:baseline;justify-content:space-between;margin:0 4px 12px}.section-title h2{margin:0;font-size:18px;letter-spacing:-.04em}.proof-card{border:1px solid #ff795a55;border-radius:22px;background:linear-gradient(145deg,#321a15,#160f0d);padding:16px;box-shadow:0 18px 40px #0004}.proof-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.proof-metric{min-width:0;border:1px solid #ffffff17;border-radius:15px;background:#ffffff0b;padding:12px 10px}.proof-metric strong{display:block;font-size:20px;letter-spacing:-.05em}.proof-metric span{display:block;margin-top:5px;color:#cabbb4;font-size:10px;line-height:1.25}.proof-card>p{margin:12px 2px 0;color:#a99a93;font-size:11px;line-height:1.5}.proof-relationships{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.proof-relationships span{display:grid;gap:2px;border-radius:12px;background:#ffffff0b;padding:8px 10px}.proof-relationships b{font-size:11px}.proof-relationships small{color:#b9aaa3;font-size:10px}.opportunity-grid{display:grid;gap:9px}.opportunity-card{border:1px solid #ffffff1f;border-radius:18px;background:#fff;color:#17110e;padding:14px 15px}.opportunity-card>div:first-child{display:grid;gap:4px}.opportunity-card>div:first-child small{color:#a4513e;font:800 9px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em}.opportunity-card strong{font-size:17px;letter-spacing:-.03em}.opportunity-card>p{margin:9px 0;color:#655853;font-size:12px;line-height:1.5}.opportunity-meta{display:flex;flex-wrap:wrap;gap:8px}.opportunity-meta span{display:flex;gap:5px;border-radius:9px;background:#f6efeb;padding:7px 8px;color:#6e5a52;font-size:10px}.opportunity-meta b{color:#a4503d}.opportunity-cta{display:block;margin-top:9px;border-radius:15px;background:#ff6543;padding:12px 14px;text-align:center;color:#17110e;text-decoration:none;font-size:12px;font-weight:850}.relationship-grid,.team-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.relationship-card,.team-card,.link-card{min-height:68px;display:grid;grid-template-columns:42px 1fr 20px;align-items:center;gap:12px;padding:10px 15px;border:1px solid #ffffff1f;border-radius:18px;background:#fff;color:#17110e;text-decoration:none;box-shadow:0 9px 25px #0003}.relationship-card b,.team-card b,.link-card b{width:38px;height:38px;display:grid;place-items:center;overflow:hidden;border-radius:12px;background:#f8e7e1;color:#ec4e2c;font-size:15px}.relationship-card span,.team-card span{display:grid;gap:3px}.relationship-card small,.team-card small{font-size:10px;color:#816e65}.relationship-card i,.team-card i,.link-card i{font-style:normal;color:#9b8177}.links{display:grid;gap:9px}.link-card span{font-size:14px;font-weight:780}.section-break{padding:15px 4px 2px;color:#ffc4b4;font:700 10px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.14em}footer{margin-top:40px;color:#bcaea6;text-align:center;font-size:12px}footer strong{color:#ff6a49}@media(max-width:650px){.page{padding:18px 14px 38px}.hero{margin:44px 0 23px}.avatar{width:82px;height:82px;border-radius:27px}.bio{font-size:15px}.cta-grid,.relationship-grid,.team-grid{grid-template-columns:1fr}.feature{min-height:185px;border-radius:20px}.proof-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.proof-metric:last-child{grid-column:1/3}.matrix span:nth-child(3n){display:none}.matrix{opacity:.46}.matrix span{font-size:9px}}@media(prefers-reduced-motion:reduce){.matrix{display:none}}`;
  css += `@media(min-width:820px){.page{min-height:unset;margin:38px auto;border:1px solid #ffffff1f;border-radius:30px;overflow:hidden;background:linear-gradient(180deg,#ffffff08,transparent 25%),#100d0be8;box-shadow:0 24px 90px #0009}}@media(max-width:819px){.page{background:#100d0bba}}.matrix{z-index:10!important;opacity:.58!important;mix-blend-mode:screen}.matrix span{display:none!important}`;

  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="profile"><meta property="og:site_name" content="Linkary"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(previewImage)}"><meta property="og:image:secure_url" content="${escapeHtml(previewImage)}"><meta property="og:image:alt" content="${escapeHtml(`${profile.display_name} on Linkary`)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(previewImage)}"><meta name="twitter:image:alt" content="${escapeHtml(`${profile.display_name} on Linkary`)}"><script type="application/ld+json">${structuredData}</script><style>${css}</style></head><body><canvas class="matrix" aria-hidden="true"></canvas><main class="page"><header class="top"><a class="brand" href="${escapeHtml(urls.publicSite)}">Linkary</a><button class="share" type="button" data-share>Share</button></header><section class="hero"><div class="avatar">${avatar}</div><div class="eyebrow">${typeLabel}</div><h1>${escapeHtml(profile.display_name)}</h1><div class="handle">@${escapeHtml(profile.username)}</div>${profile.bio ? `<p class="bio">${escapeHtml(profile.bio)}</p>` : ''}</section>${socialHtml ? `<nav class="socials" aria-label="Social links">${socialHtml}</nav>` : ''}${ctaHtml}${featureHtml ? `<section class="features">${featureHtml}</section>` : ''}${proofHtml(proof)}${opportunitiesHtml(opportunities, urls.app)}${relationshipHtml}${regularSection}${teamSection}<footer>Built on <strong>Linkary</strong> · Identity that compounds</footer></main><script>(function(){var c=document.querySelector('.matrix');if(!c)return;var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;if(reduced)return;var ctx=c.getContext('2d'),tokens=${rainConfig},glyphs='ｱｲｳｴｵｶｷｸｹｺ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',size=15,columns=[],width=0,height=0;function resize(){var dpr=Math.min(window.devicePixelRatio||1,2);width=window.innerWidth;height=window.innerHeight;c.width=width*dpr;c.height=height*dpr;c.style.width=width+'px';c.style.height=height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);var count=Math.ceil(width/size);columns=Array.from({length:count},function(_,i){return{y:(i*17)%Math.ceil(height/size),length:8+(i%13),speed:.45+(i%7)*.13,seed:i,token:i%9===0?String(tokens[i%tokens.length]||'LINKARY').toUpperCase():''};});}function draw(){ctx.clearRect(0,0,width,height);ctx.font='700 '+size+'px ui-monospace,SFMono-Regular,monospace';ctx.textAlign='center';columns.forEach(function(col,i){for(var trail=0;trail<col.length;trail++){var y=(col.y-trail)*size;if(y< -size||y>height+size)continue;var alpha=trail===0?1:Math.max(.05,.62-trail*.065);ctx.fillStyle=trail===0?'#ff7048':'rgba(184,58,34,'+alpha+')';var ch=col.token&&trail<col.token.length?col.token[(Math.floor(col.y)+trail)%col.token.length]:glyphs[(col.seed*31+Math.floor(col.y)+trail*17)%glyphs.length];ctx.shadowBlur=trail===0?12:5;ctx.shadowColor=trail===0?'#ff7048':'#b83a22';ctx.fillText(ch,i*size+size/2,y);}col.y+=col.speed;if(col.y-col.length>height/size){col.y=-(i%23)*7-10;col.length=8+((i*7+Math.floor(col.y))%14);}}requestAnimationFrame(draw);}resize();window.addEventListener('resize',resize,{passive:true});draw();})();</script><script>(function(){var b=document.querySelector('[data-share]');if(!b)return;var d=${shareData};b.addEventListener('click',async function(){try{if(navigator.share){await navigator.share(d);return;}if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(d.url);b.textContent='Copied';setTimeout(function(){b.textContent='Share';},1800);return;}window.prompt('Copy this Linkary profile URL',d.url);}catch(e){if(e&&e.name==='AbortError')return;window.prompt('Copy this Linkary profile URL',d.url);}});})();</script></body></html>`, { headers: { 'cache-control': 'public, max-age=60, s-maxage=300' } });
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
  await db.run(`INSERT INTO profile_blocks (id, profile_id, block_type, position, enabled, title, url, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`, [blockId, profileId, body.type, positionRow?.next_position || 0, cleanText(body.title,120), validateDestination(body.url), JSON.stringify(body.config || {}), timestamp, timestamp]);
  return json({ id: blockId }, { status: 201 });
}

export async function updateProfileBlock(request: Request, env: Env, profileId: string, blockId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  await requireEditableProfile(db, auth.user.id, profileId);
  if (!(await db.first<{ id: string }>(`SELECT id FROM profile_blocks WHERE id = ? AND profile_id = ?`, [blockId, profileId]))) throw new HttpError(404, 'Block not found', 'block_not_found');
  const body = await readJson<{ title?: string; url?: string | null; enabled?: boolean; config?: unknown }>(request);
  const urlProvided = body.url !== undefined;
  const nextUrl = urlProvided ? validateDestination(body.url) : null;
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
