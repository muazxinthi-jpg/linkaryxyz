import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import type { ProfileBlockRow } from '../db/models';
import { exactCommunityCampaignProof, type CommunityCampaignProofSummary } from '../communityCampaignProof';
import { getPublishedProfile, renderPublicProfile as renderBasePublicProfile } from './profiles';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char] || char);
}

function safeJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.max(0, value || 0));
}

function compactMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(Math.max(0, value || 0));
}

function socialPlatform(block: ProfileBlockRow): string {
  const config = safeJson(block.config_json);
  const stored = typeof config.socialPlatform === 'string' ? config.socialPlatform.toLowerCase().trim() : '';
  if (stored) return stored;
  const key = `${block.block_type} ${block.title || ''} ${block.url || ''}`.toLowerCase();
  if (key.includes('x.com/') || key.includes('twitter.com/')) return 'x';
  if (key.includes('linkedin.com/')) return 'linkedin';
  if (key.includes('tiktok.com/')) return 'tiktok';
  if (key.includes('facebook.com/')) return 'facebook';
  if (key.includes('instagram.com/')) return 'instagram';
  if (key.includes('youtube.com/') || key.includes('youtu.be/')) return 'youtube';
  if (key.includes('t.me/') || key.includes('telegram')) return 'telegram';
  if (key.includes('wa.me/') || key.includes('whatsapp')) return 'whatsapp';
  if (key.includes('reddit.com/')) return 'reddit';
  if (key.includes('discord.gg/') || key.includes('discord.com/')) return 'discord';
  if (key.includes('github.com/')) return 'github';
  if (key.includes('warpcast.com/') || key.includes('farcaster')) return 'farcaster';
  if (block.block_type === 'social_link') return 'custom';
  return '';
}

function isSocial(block: ProfileBlockRow): boolean {
  // A featured X post can be media, but it must never become a second X profile icon.
  // Only explicit social blocks belong in the compact social navigation.
  if (!block.url) return false;
  if (['featured_video', 'featured_article', 'featured_image', 'product_feature', 'nft_item', 'team_member'].includes(block.block_type)) return false;
  if (block.block_type === 'social_link') return true;
  if (['telegram', 'youtube', 'tiktok', 'instagram', 'facebook', 'reddit', 'linkedin'].includes(block.block_type)) return true;
  // Earlier profiles saved their network choice on a generic link. Honour that
  // explicit metadata, but do not infer a social account from featured content.
  const config = safeJson(block.config_json);
  const configured = typeof config.socialPlatform === 'string' ? config.socialPlatform.toLowerCase().trim() : '';
  const known = ['x', 'linkedin', 'tiktok', 'facebook', 'instagram', 'youtube', 'telegram', 'whatsapp', 'reddit', 'discord', 'github', 'farcaster'];
  if (known.includes(configured)) return true;
  // Legacy profiles used generic "link" blocks for socials. Restrict URL
  // inference to that legacy type so a featured X post is still never a social.
  return block.block_type === 'link' && known.includes(socialPlatform(block));
}

const KNOWN_SOCIALS = new Set(['x', 'linkedin', 'tiktok', 'facebook', 'instagram', 'youtube', 'telegram', 'whatsapp', 'reddit', 'discord', 'github', 'farcaster']);

function icon(platform: string): string {
  if (!KNOWN_SOCIALS.has(platform)) return '<span class="profile-social-custom" aria-hidden="true">↗</span>';
  return `<img class="profile-social-brand" src="/assets/social/${escapeHtml(platform)}.svg" alt="" aria-hidden="true">`;
}

type AutomaticCommunityProof = {
  trackedCampaigns: number;
  trackedClicks: number;
  verifiedOutcomes: number;
  attributedValueUsd: number;
};

type AutomaticCommunity = {
  id: string;
  name: string;
  handle: string | null;
  url: string | null;
  audienceSize: number;
  verificationStatus: string;
  campaignProof: AutomaticCommunityProof | null;
};

type AutomaticCommunityPortfolio = {
  headline: string;
  openToCampaigns: boolean;
  telegramIdentityVerified: boolean;
  telegramHandle: string | null;
  combinedAudience: number;
  campaignProof: CommunityCampaignProofSummary | null;
  communities: AutomaticCommunity[];
};

function safeCommunityUrl(value: string | null, handle: string | null): string | null {
  if (value) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.toString();
    } catch {
      // Fall through to the canonical Telegram handle when available.
    }
  }
  const clean = handle?.trim().replace(/^@/, '');
  return clean ? `https://t.me/${encodeURIComponent(clean)}` : null;
}

async function loadAutomaticCommunityPortfolio(env: Env, profileId: string, profileType: string): Promise<AutomaticCommunityPortfolio | null> {
  if (profileType !== 'creator') return null;
  const db = new Db(requireDb(env));
  try {
    const manager = await db.first<{ id: string; headline: string; open_to_campaigns: number }>(
      `SELECT id, headline, open_to_campaigns
         FROM partner_managers
        WHERE profile_id = ? AND manager_type = 'community_manager' AND visibility = 'public'
        LIMIT 1`,
      [profileId],
    );
    if (!manager) return null;

    const [assets, telegram, proof] = await Promise.all([
      db.all<{ id: string; name: string; handle: string | null; url: string | null; audience_size: number; verification_status: string }>(
        `SELECT id, name, handle, url, audience_size, verification_status
           FROM partner_manager_assets
          WHERE manager_id = ? AND asset_type = 'telegram_community'
          ORDER BY verification_status = 'verified' DESC, audience_size DESC, name ASC
          LIMIT 100`,
        [manager.id],
      ),
      db.first<{ current_handle: string | null }>(
        `SELECT pi.current_handle
           FROM profiles p
           JOIN platform_identity_links pil ON pil.user_id = p.owner_user_id
            AND pil.link_type = 'owns' AND pil.ended_at IS NULL
           JOIN platform_identities pi ON pi.id = pil.platform_identity_id
          WHERE p.id = ?
            AND pi.platform = 'telegram'
            AND pi.provider_object_type = 'person'
            AND pi.status = 'active'
            AND pi.ownership_verified_at IS NOT NULL
          ORDER BY pil.verified_at DESC
          LIMIT 1`,
        [profileId],
      ),
      exactCommunityCampaignProof(db, manager.id).catch(() => null),
    ]);

    if (!assets.length) return null;
    const proofByAsset = new Map((proof?.communities || []).map((item) => [item.asset_id, item]));
    const communities = assets.map((asset) => {
      const assetProof = proofByAsset.get(asset.id);
      return {
        id: asset.id,
        name: asset.name,
        handle: asset.handle,
        url: safeCommunityUrl(asset.url, asset.handle),
        audienceSize: Number(asset.audience_size || 0),
        verificationStatus: asset.verification_status,
        campaignProof: assetProof ? {
          trackedCampaigns: Number(assetProof.tracked_campaigns || 0),
          trackedClicks: Number(assetProof.tracked_clicks || 0),
          verifiedOutcomes: Number(assetProof.verified_outcomes || 0),
          attributedValueUsd: Number(assetProof.attributed_value_usd || 0),
        } : null,
      };
    });
    const proofSummary = proof?.summary;
    const hasProof = Boolean(proofSummary && (proofSummary.tracked_campaigns || proofSummary.tracked_clicks || proofSummary.verified_outcomes || proofSummary.attributed_value_usd));
    return {
      headline: manager.headline?.trim() || 'Telegram Community Manager',
      openToCampaigns: Boolean(manager.open_to_campaigns),
      telegramIdentityVerified: Boolean(telegram),
      telegramHandle: telegram?.current_handle || null,
      combinedAudience: communities.reduce((sum, community) => sum + community.audienceSize, 0),
      campaignProof: hasProof && proofSummary ? proofSummary : null,
      communities,
    };
  } catch {
    // Public profiles must remain available if optional Community Portfolio data is temporarily unavailable.
    return null;
  }
}

function communityVerificationLabel(value: string): string {
  if (value === 'verified') return 'Verified Community';
  if (value === 'submitted') return 'Verification submitted';
  if (value === 'rejected') return 'Needs verification';
  return 'Listed Community';
}

function buildAutomaticCommunityPortfolioHtml(portfolio: AutomaticCommunityPortfolio | null): string {
  if (!portfolio) return '';
  const badges = [
    portfolio.telegramIdentityVerified
      ? `<span class="community-portfolio-badge verified">${portfolio.telegramHandle ? `@${escapeHtml(portfolio.telegramHandle.replace(/^@/, ''))} · ` : ''}Telegram identity verified</span>`
      : '',
    portfolio.openToCampaigns ? '<span class="community-portfolio-badge open">Open to campaigns</span>' : '',
  ].filter(Boolean).join('');

  const proofHtml = portfolio.campaignProof
    ? `<div class="community-portfolio-campaign-proof"><div class="community-portfolio-proof-head"><div><small>LINKARY EVIDENCE</small><strong>Community Campaign Proof</strong></div><span>Exact Community activity only</span></div><div class="community-portfolio-proof-grid"><div><span>TRACKED CAMPAIGNS</span><strong>${escapeHtml(compactNumber(portfolio.campaignProof.tracked_campaigns))}</strong></div><div><span>TRACKED CLICKS</span><strong>${escapeHtml(compactNumber(portfolio.campaignProof.tracked_clicks))}</strong></div><div><span>VERIFIED OUTCOMES</span><strong>${escapeHtml(compactNumber(portfolio.campaignProof.verified_outcomes))}</strong></div><div><span>ATTRIBUTED VALUE</span><strong>${escapeHtml(compactMoney(portfolio.campaignProof.attributed_value_usd))}</strong></div></div><p>Derived only from exact Linkary Community activity assignments. Manual outcomes, audience estimates, shortlists and accepted inquiries do not count as campaign performance.</p></div>`
    : '';

  const cards = portfolio.communities.map((community) => {
    const proofLine = community.campaignProof
      ? `<span class="community-portfolio-proofline"><b>${escapeHtml(compactNumber(community.campaignProof.trackedCampaigns))}</b> tracked campaign${community.campaignProof.trackedCampaigns === 1 ? '' : 's'} · <b>${escapeHtml(compactNumber(community.campaignProof.trackedClicks))}</b> clicks · <b>${escapeHtml(compactNumber(community.campaignProof.verifiedOutcomes))}</b> verified outcomes${community.campaignProof.attributedValueUsd > 0 ? ` · <b>${escapeHtml(compactMoney(community.campaignProof.attributedValueUsd))}</b>` : ''}</span>`
      : '';
    const body = `<b class="community-portfolio-icon"><img src="/assets/social/telegram.svg" alt="" aria-hidden="true"></b><span><small>${escapeHtml(communityVerificationLabel(community.verificationStatus))}</small><strong>${escapeHtml(community.name)}</strong><em>${community.handle ? `@${escapeHtml(community.handle.replace(/^@/, ''))} · ` : ''}${escapeHtml(compactNumber(community.audienceSize))} audience</em>${proofLine}</span><i>↗</i>`;
    return community.url
      ? `<a class="community-portfolio-card" href="${escapeHtml(community.url)}" target="_blank" rel="noopener noreferrer">${body}</a>`
      : `<article class="community-portfolio-card is-static">${body}</article>`;
  }).join('');

  return `<section class="section automatic-community-portfolio" aria-label="Community Portfolio"><div class="section-title"><span>COMMUNITY MANAGER</span><h2>Community Portfolio</h2></div><div class="community-portfolio-summary"><div><small>MANAGER PROFILE</small><strong>${escapeHtml(portfolio.headline)}</strong></div><div class="community-portfolio-stats"><span><b>${portfolio.communities.length}</b> Communities</span><span><b>${escapeHtml(compactNumber(portfolio.combinedAudience))}</b> Combined audience</span></div>${badges ? `<div class="community-portfolio-badges">${badges}</div>` : ''}</div>${proofHtml}<div class="community-portfolio-grid">${cards}</div><p class="community-portfolio-note">Community verification is separate from personal Telegram identity verification and from campaign performance. Verified Community means Linkary reviewed Community-specific public management evidence. Campaign Proof appears only when exact Community activity has tracked or verified evidence.</p></section>`;
}

function removeLegacyCommunityCards(html: string): string {
  let next = html.replace(/<a class="relationship-card"[^>]*><b>[\s\S]*?<\/b><span><small>COMMUNITY<\/small>[\s\S]*?<\/a>/g, '');
  next = next.replace(/<section class="section"><div class="section-title"><span>RELATIONSHIPS<\/span><h2>Projects & communities<\/h2><\/div><div class="relationship-grid">\s*<\/div><\/section>/g, '');
  return next;
}

function extraCss(): string {
  return `
:root,html{background:#fff!important;color:#151210!important}
body{min-height:100vh!important;background:radial-gradient(900px 520px at 12% 4%,rgba(255,90,54,.10),transparent 70%),radial-gradient(850px 560px at 90% 28%,rgba(255,90,54,.07),transparent 72%),#fff!important;color:#151210!important}
body:before,body:after,.page:before,.page:after{display:none!important;content:none!important}
.matrix{display:block!important;z-index:2!important;opacity:.38!important;mix-blend-mode:multiply!important;filter:saturate(1.6) contrast(1.22)!important;pointer-events:none!important}
.page{position:relative!important;z-index:1!important;width:min(1020px,calc(100% - 64px))!important;margin:42px auto!important;padding:34px 46px 76px!important;overflow:hidden!important;background:rgba(255,255,255,.92)!important;background-image:none!important;color:#151210!important;border:1px solid rgba(255,90,54,.22)!important;border-radius:34px!important;box-shadow:0 24px 80px rgba(41,27,20,.12)!important;backdrop-filter:blur(2px)!important}
.page>*{position:relative;z-index:1}
.top{color:#151210!important}
.brand{color:#151210!important}
.brand:before{background:#ff5a36!important;color:#fff!important}
.share{background:#fff!important;color:#151210!important;border:1px solid #e7ddd7!important;box-shadow:0 8px 22px rgba(30,20,15,.08)!important}
.hero{margin:54px 0 28px!important;color:#151210!important}
.avatar{border:2px solid #ff5a36!important;background:#fff!important;box-shadow:0 14px 38px rgba(42,28,20,.13)!important}
.eyebrow{margin-top:15px!important;color:#ff5a36!important}
.hero h1{margin:10px 0 6px!important;color:#111!important;font-size:clamp(34px,3.6vw,52px)!important;line-height:1.02!important;letter-spacing:-.05em!important;text-shadow:none!important}
.handle{color:#70645e!important;font-size:14px!important}
.bio{max-width:780px!important;margin:17px auto 0!important;color:#2b2724!important;font-size:17px!important;line-height:1.62!important;text-shadow:none!important}
.socials{margin:24px 0 32px!important;gap:12px!important}
.socials a,.social{display:grid!important;place-items:center!important;width:48px!important;height:48px!important;border-radius:15px!important;background:#fff!important;border:1.5px solid #ff5a36!important;color:#ff5a36!important;box-shadow:0 10px 25px rgba(255,90,54,.12)!important;transition:transform .18s ease,background .18s ease!important}
.socials a:hover,.social:hover{transform:translateY(-2px)!important;background:#ff5a36!important}
.socials .profile-social-brand{display:block!important;width:22px!important;height:22px!important;object-fit:contain!important;filter:brightness(0) saturate(100%) invert(44%) sepia(96%) saturate(2859%) hue-rotate(339deg) brightness(102%) contrast(102%)!important}
.socials a:hover .profile-social-brand,.social:hover .profile-social-brand{filter:brightness(0) invert(1)!important}
.profile-social-custom{font-size:15px!important;font-weight:900!important;color:#ff5a36!important}
.socials a:hover .profile-social-custom{color:#fff!important}
.cta-grid,.profile-enhanced-ctas{display:grid!important;grid-template-columns:1fr!important;gap:12px!important;margin:8px 0 28px!important}
.cta-card,.profile-enhanced-cta{display:grid!important;grid-template-columns:54px 1fr 26px!important;align-items:center!important;gap:15px!important;min-height:96px!important;padding:17px 20px!important;border-radius:24px!important;background:#ff6543!important;color:#151210!important;text-decoration:none!important;box-shadow:0 14px 34px rgba(255,101,67,.20)!important}
.cta-card>span,.profile-enhanced-cta>b{width:48px!important;height:48px!important;display:grid!important;place-items:center!important;border-radius:14px!important;background:#fff!important;color:#151210!important}
.cta-card>div,.profile-enhanced-cta>span{display:grid!important;align-content:center!important;gap:4px!important;text-align:left!important}
.cta-card small,.profile-enhanced-cta small{color:#5b2b20!important;font-size:10px!important;line-height:1.15!important}
.cta-card strong,.profile-enhanced-cta strong{color:#151210!important;font-size:19px!important;line-height:1.2!important;letter-spacing:-.02em!important}
.cta-card i,.profile-enhanced-cta i{color:#151210!important;font-style:normal!important}
.cta-card.media_kit,.profile-enhanced-cta.media_kit{background:#fff!important;border:1px solid #e8ded8!important}
.features{gap:18px!important}
.feature{min-height:420px!important;padding:14px 14px 96px!important;border:1px solid #e8ded8!important;border-radius:27px!important;background:#fff!important;color:#151210!important;box-shadow:0 17px 42px rgba(38,24,18,.10)!important}
.feature img,.feature video{left:14px!important;top:14px!important;width:calc(100% - 28px)!important;height:calc(100% - 110px)!important;border-radius:19px!important;object-fit:cover!important;opacity:1!important}
.feature-shade,.feature:after{display:none!important}
.feature-copy{left:22px!important;right:22px!important;bottom:18px!important;gap:4px!important}
.feature-copy small{color:#ff5a36!important;font-size:10px!important}
.feature-copy strong{color:#151210!important;font-size:25px!important;text-shadow:none!important}
.feature-copy i{color:#74665f!important;font-size:12px!important;text-shadow:none!important}
.section{margin-top:38px!important}
.section-title h2{color:#151210!important;font-size:22px!important}
.section-title span,.section-break,.showcase-title{color:#ff5a36!important}
.showcase{margin-top:30px!important}
.showcase-title{margin-bottom:13px!important}
.showcase-item,.product-item{min-height:242px!important;padding:10px 10px 58px!important;border:1px solid #e8ded8!important;border-radius:22px!important;background:#fff!important;color:#151210!important;box-shadow:0 14px 34px rgba(38,24,18,.09)!important}
.showcase-item img,.product-item img{inset:10px 10px 58px!important;width:calc(100% - 20px)!important;height:calc(100% - 68px)!important;border-radius:15px!important;object-fit:cover!important;opacity:1!important;padding:0!important}
.image-showcase .showcase-item img{object-fit:contain!important;background:#faf8f6!important;padding:8px!important}
.nft-showcase .showcase-item{background:#f8f6f3!important}
.nft-showcase .showcase-item img{object-fit:contain!important;background:#f8f6f3!important;padding:8px!important}
.showcase-item:after,.product-item:after{display:none!important}
.showcase-item span,.product-item span{left:14px!important;right:14px!important;bottom:13px!important;color:#151210!important;text-shadow:none!important}
.showcase-item strong,.product-item strong{font-size:16px!important;line-height:1.2!important;text-shadow:none!important}
.showcase-item small,.product-item i{color:#9b4b38!important}
.proof-card{background:#fff!important;background-image:none!important;color:#151210!important;border:1px solid #e8ded8!important;box-shadow:0 14px 34px rgba(38,24,18,.09)!important;padding:20px!important}
.proof-metric{background:#faf7f5!important;border:1px solid #eee5df!important;padding:15px 13px!important}
.proof-metric strong{color:#151210!important;font-size:24px!important}
.proof-metric span{color:#74665f!important;font-size:11px!important}
.proof-card>p{color:#74665f!important;font-size:12px!important}
.proof-relationships span{background:#faf7f5!important}
.proof-relationships b{color:#151210!important}
.proof-relationships small{color:#74665f!important}
.relationship-card,.team-card,.link-card,.opportunity-card{border:1px solid #e8ded8!important;background:#fff!important;color:#151210!important;box-shadow:0 12px 28px rgba(38,24,18,.08)!important}
.relationship-card,.team-card,.link-card{min-height:84px!important;padding:14px 18px!important;border-radius:20px!important}
.relationship-card b,.team-card b,.link-card b{background:#fff1ec!important;color:#ff5a36!important}
.relationship-card small,.team-card small,.opportunity-card>p{color:#74665f!important}
.link-card span{font-size:16px!important}
.opportunity-card{padding:18px 19px!important;border-radius:21px!important}
.opportunity-card strong{color:#151210!important;font-size:19px!important}
.opportunity-cta{background:#ff6543!important;color:#151210!important}
.links{gap:12px!important}
.automatic-community-portfolio{margin-top:38px!important}
.community-portfolio-summary{display:grid!important;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)!important;gap:14px!important;padding:18px!important;border:1px solid #e8ded8!important;border-radius:22px!important;background:#fff8f5!important;box-shadow:0 14px 34px rgba(38,24,18,.07)!important}
.community-portfolio-summary>div:first-child{display:grid!important;gap:5px!important}.community-portfolio-summary small{color:#ff5a36!important;font:800 9px/1 ui-monospace,SFMono-Regular,monospace!important;letter-spacing:.12em!important}.community-portfolio-summary strong{font-size:18px!important;color:#151210!important}.community-portfolio-stats{display:flex!important;justify-content:flex-end!important;gap:9px!important;flex-wrap:wrap!important}.community-portfolio-stats span{display:grid!important;gap:3px!important;min-width:110px!important;padding:10px 12px!important;border:1px solid #eee3dd!important;border-radius:14px!important;background:#fff!important;color:#74665f!important;font-size:10px!important}.community-portfolio-stats b{color:#151210!important;font-size:20px!important}.community-portfolio-badges{grid-column:1/-1!important;display:flex!important;gap:8px!important;flex-wrap:wrap!important}.community-portfolio-badge{display:inline-flex!important;align-items:center!important;min-height:30px!important;padding:7px 10px!important;border-radius:999px!important;font-size:10px!important;font-weight:800!important}.community-portfolio-badge.verified{background:#eef9f1!important;color:#27633a!important}.community-portfolio-badge.open{background:#fff0eb!important;color:#b33d22!important}.community-portfolio-campaign-proof{display:grid!important;gap:12px!important;margin-top:12px!important;padding:17px 18px!important;border:1px solid #e8ded8!important;border-radius:22px!important;background:#fff!important;box-shadow:0 12px 28px rgba(38,24,18,.07)!important}.community-portfolio-proof-head{display:flex!important;align-items:flex-end!important;justify-content:space-between!important;gap:14px!important}.community-portfolio-proof-head>div{display:grid!important;gap:4px!important}.community-portfolio-proof-head small{color:#ff5a36!important;font:800 9px/1 ui-monospace,SFMono-Regular,monospace!important;letter-spacing:.12em!important}.community-portfolio-proof-head strong{font-size:18px!important}.community-portfolio-proof-head>span{color:#8a756d!important;font-size:10px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.05em!important}.community-portfolio-proof-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:8px!important}.community-portfolio-proof-grid>div{min-width:0;padding:11px 12px!important;border:1px solid #eee3dd!important;border-radius:14px!important;background:#faf7f5!important}.community-portfolio-proof-grid span{display:block!important;color:#8a756d!important;font-size:9px!important;line-height:1.25!important;letter-spacing:.05em!important}.community-portfolio-proof-grid strong{display:block!important;margin-top:5px!important;color:#151210!important;font-size:21px!important;overflow-wrap:anywhere!important}.community-portfolio-campaign-proof>p{margin:0!important;color:#74665f!important;font-size:10px!important;line-height:1.5!important}.community-portfolio-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;margin-top:12px!important}.community-portfolio-card{display:grid!important;grid-template-columns:46px 1fr 20px!important;align-items:center!important;gap:12px!important;min-height:94px!important;padding:14px 16px!important;border:1px solid #e8ded8!important;border-radius:20px!important;background:#fff!important;color:#151210!important;text-decoration:none!important;box-shadow:0 12px 28px rgba(38,24,18,.08)!important}.community-portfolio-card.is-static{cursor:default!important}.community-portfolio-icon{display:grid!important;place-items:center!important;width:42px!important;height:42px!important;border-radius:13px!important;background:#fff1ec!important}.community-portfolio-icon img{width:21px!important;height:21px!important;filter:brightness(0) saturate(100%) invert(44%) sepia(96%) saturate(2859%) hue-rotate(339deg) brightness(102%) contrast(102%)!important}.community-portfolio-card>span{display:grid!important;gap:4px!important;min-width:0!important}.community-portfolio-card small{color:#ff5a36!important;font-size:9px!important;font-weight:800!important;letter-spacing:.08em!important}.community-portfolio-card strong{font-size:16px!important;line-height:1.2!important;overflow-wrap:anywhere!important}.community-portfolio-card em{color:#74665f!important;font-size:11px!important;font-style:normal!important}.community-portfolio-proofline{display:block!important;margin-top:3px!important;color:#6d5c55!important;font-size:10px!important;line-height:1.45!important;overflow-wrap:anywhere!important}.community-portfolio-proofline b{color:#151210!important}.community-portfolio-card>i{color:#9b8177!important;font-style:normal!important}.community-portfolio-note{margin:10px 2px 0!important;color:#74665f!important;font-size:11px!important;line-height:1.5!important}
footer{color:#74665f!important}
footer strong{color:#ff5a36!important}
@media(min-width:900px){.image-showcase .showcase-grid,.product-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
@media(max-width:899px){.page{width:calc(100% - 24px)!important;margin:18px auto!important;padding:24px 20px 48px!important;border-radius:26px!important}.hero h1{font-size:clamp(34px,6vw,48px)!important}.feature{min-height:320px!important}.showcase-item,.product-item{min-height:195px!important}.matrix{opacity:.32!important}}
@media(max-width:650px){body{background:#fff!important}.page{width:100%!important;margin:0!important;padding:20px 15px 42px!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:rgba(255,255,255,.94)!important}.hero{margin:42px 0 23px!important}.hero h1{font-size:clamp(32px,9vw,42px)!important}.bio{font-size:15px!important}.socials a,.social{width:45px!important;height:45px!important}.cta-card,.profile-enhanced-cta{min-height:86px!important;padding:14px 15px!important}.feature{min-height:270px!important;padding-bottom:86px!important}.feature img,.feature video{height:calc(100% - 100px)!important}.feature-copy strong{font-size:21px!important}.showcase-item,.product-item{min-height:172px!important;border-radius:18px!important}.image-showcase .showcase-grid,.product-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.proof-grid{gap:9px!important}.community-portfolio-summary{grid-template-columns:1fr!important}.community-portfolio-stats{justify-content:flex-start!important}.community-portfolio-badges{grid-column:auto!important}.community-portfolio-proof-head{align-items:flex-start!important;flex-direction:column!important}.community-portfolio-proof-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.community-portfolio-grid{grid-template-columns:1fr!important}.matrix{opacity:.28!important}}
@media(max-width:430px){.community-portfolio-proof-grid{grid-template-columns:1fr!important}.community-portfolio-campaign-proof{padding:14px!important}.community-portfolio-card{grid-template-columns:42px minmax(0,1fr) 16px!important;padding:13px!important}}
`;
}

function trackedUrl(request: Request, username: string, blockId: string): string {
  const url = new URL(request.url);
  url.pathname = `/${encodeURIComponent(username)}/go/${encodeURIComponent(blockId)}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function buildSocialHtml(request: Request, username: string, blocks: ProfileBlockRow[]): string {
  const socials = blocks.filter(isSocial);
  if (!socials.length) return '<nav class="socials" aria-label="Social links"></nav>';
  return `<nav class="socials" aria-label="Social links">${socials.map((block) => {
    const platform = socialPlatform(block);
    return `<a href="${escapeHtml(trackedUrl(request, username, block.id))}" aria-label="${escapeHtml(block.title || platform || 'Social link')}">${icon(platform)}</a>`;
  }).join('')}</nav>`;
}

function buildCtaHtml(request: Request, username: string, blocks: ProfileBlockRow[], profileType: string): string {
  const ctas = blocks.filter((block) => ['work_with_me', 'media_kit'].includes(block.block_type) && block.url);
  if (!ctas.length) return '';
  return `<section class="profile-enhanced-ctas" aria-label="Ways to work together">${ctas.map((block) => {
    const mediaKit = block.block_type === 'media_kit';
    const kicker = mediaKit ? 'MEDIA KIT' : profileType === 'project' ? 'COLLABORATE' : 'AVAILABLE FOR WORK';
    const fallback = mediaKit ? 'View media kit' : profileType === 'project' ? 'Partner with us' : 'Work with me';
    return `<a class="profile-enhanced-cta ${block.block_type}" href="${escapeHtml(trackedUrl(request, username, block.id))}"><b>${mediaKit ? '▣' : '✦'}</b><span><small>${kicker}</small><strong>${escapeHtml(block.title || fallback)}</strong></span><i>↗</i></a>`;
  }).join('')}</section>`;
}

export async function renderPublicProfileEnhanced(request: Request, env: Env, username: string): Promise<Response> {
  const base = await renderBasePublicProfile(request, env, username);
  const contentType = base.headers.get('content-type') || '';
  if (!contentType.includes('text/html') || base.status !== 200) return base;

  const [{ profile, blocks }, source] = await Promise.all([
    getPublishedProfile(username, env),
    base.text(),
  ]);
  const [socialHtml, ctaHtml, communityPortfolio] = await Promise.all([
    Promise.resolve(buildSocialHtml(request, profile.username, blocks)),
    Promise.resolve(buildCtaHtml(request, profile.username, blocks, profile.profile_type)),
    loadAutomaticCommunityPortfolio(env, profile.id, profile.profile_type),
  ]);
  const communityHtml = buildAutomaticCommunityPortfolioHtml(communityPortfolio);
  let html = communityPortfolio ? removeLegacyCommunityCards(source) : source;

  if (/<nav class="socials"[^>]*>[\s\S]*?<\/nav>/.test(html)) {
    html = html.replace(/<nav class="socials"[^>]*>[\s\S]*?<\/nav>/, socialHtml);
  }

  if (ctaHtml && !html.includes('profile-enhanced-ctas') && !html.includes('class="cta-grid"')) {
    const socialAndHeroClose = `${socialHtml}</section>`;
    if (html.includes(socialAndHeroClose)) html = html.replace(socialAndHeroClose, `${socialAndHeroClose}${ctaHtml}`);
    else if (html.includes('</section>')) html = html.replace('</section>', `</section>${ctaHtml}`);
  }

  if (communityHtml && !html.includes('automatic-community-portfolio')) {
    const proofAnchor = '<section class="section proof-section">';
    const opportunityAnchor = '<section class="section opportunities-section">';
    if (html.includes(proofAnchor)) html = html.replace(proofAnchor, `${communityHtml}${proofAnchor}`);
    else if (html.includes(opportunityAnchor)) html = html.replace(opportunityAnchor, `${communityHtml}${opportunityAnchor}`);
    else if (html.includes('<footer>')) html = html.replace('<footer>', `${communityHtml}<footer>`);
    else html = html.replace('</main>', `${communityHtml}</main>`);
  }

  html = html.replace('</head>', `<style id="linkary-enhanced-theme">${extraCss()}</style></head>`);

  const headers = new Headers(base.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'public, max-age=30, s-maxage=60');
  return new Response(html, { status: base.status, statusText: base.statusText, headers });
}