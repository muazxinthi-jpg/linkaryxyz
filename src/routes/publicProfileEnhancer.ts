import type { Env } from '../env';
import type { ProfileBlockRow } from '../db/models';
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
  return Boolean(block.url && (block.block_type === 'social_link' || socialPlatform(block)));
}

const KNOWN_SOCIALS = new Set(['x', 'linkedin', 'tiktok', 'facebook', 'instagram', 'youtube', 'telegram', 'whatsapp', 'reddit', 'discord', 'github', 'farcaster']);

function icon(platform: string): string {
  if (!KNOWN_SOCIALS.has(platform)) return '<span class="profile-social-custom" aria-hidden="true">↗</span>';
  return `<img class="profile-social-brand" src="/assets/social/${escapeHtml(platform)}.svg" alt="" aria-hidden="true">`;
}

function extraCss(): string {
  return `:root{background:#fff!important;color:#17110e!important}body{background:radial-gradient(900px 520px at 12% 5%,rgba(255,101,67,.10),transparent 72%),radial-gradient(820px 520px at 88% 30%,rgba(255,101,67,.07),transparent 72%),#fff!important;color:#17110e!important}.page{width:min(1180px,calc(100% - 56px))!important;padding:34px 42px 72px!important;z-index:1!important;color:#17110e!important;background:rgba(255,255,255,.94)!important;border:1px solid #eee7e1!important;border-radius:34px!important;box-shadow:0 26px 90px rgba(43,28,21,.14)!important;backdrop-filter:blur(3px)}.matrix{z-index:0!important;opacity:.28!important;mix-blend-mode:multiply!important}.brand{color:#17110e!important}.share{background:#fff!important;color:#17110e!important;border-color:#e8e0da!important;box-shadow:0 8px 22px rgba(30,20,15,.08)!important}.hero{margin:64px 0 32px!important}.hero h1{color:#111!important;font-size:clamp(50px,6vw,78px)!important}.eyebrow{color:#ff5a36!important}.handle{color:#7e6e67!important}.bio{max-width:820px!important;color:#292421!important;font-size:18px!important;line-height:1.65!important}.socials{margin:26px 0 34px!important;gap:12px!important}.socials a,.social{width:50px!important;height:50px!important;border-radius:16px!important;background:#fff!important;color:#17110e!important;border:1px solid #e9e2dd!important;box-shadow:0 12px 28px rgba(38,25,18,.12)!important}.socials .profile-social-brand{display:block;width:23px;height:23px;object-fit:contain}.profile-social-custom{font-size:14px;font-weight:900;color:#17110e}.cta-grid,.profile-enhanced-ctas{display:grid!important;grid-template-columns:1fr!important;gap:12px!important;margin:8px 0 28px!important}.cta-card,.profile-enhanced-cta{display:grid;grid-template-columns:52px 1fr 24px;align-items:center;gap:15px;min-height:98px!important;padding:17px 20px!important;border-radius:24px!important;background:#ff6543!important;color:#17110e!important;text-decoration:none;box-shadow:0 16px 38px rgba(255,101,67,.22)!important}.cta-card.media_kit,.profile-enhanced-cta.media_kit{background:#fff!important;border:1px solid #e9e2dd!important}.cta-card>span,.profile-enhanced-cta>b{width:48px!important;height:48px!important;display:grid;place-items:center;border-radius:14px;background:#ffffffc7!important;font-size:19px}.cta-card strong,.profile-enhanced-cta strong{font-size:19px!important;letter-spacing:-.02em}.cta-card small,.profile-enhanced-cta small{font-size:10px!important}.features{gap:18px!important}.feature{min-height:430px!important;padding:14px 14px 98px!important;border:1px solid #e9e2dd!important;border-radius:28px!important;background:#fff!important;color:#17110e!important;box-shadow:0 18px 46px rgba(36,23,17,.12)!important}.feature img,.feature video{left:14px!important;top:14px!important;width:calc(100% - 28px)!important;height:calc(100% - 112px)!important;border-radius:20px!important;object-fit:cover!important;opacity:1!important}.feature-shade,.feature:after{display:none!important}.feature-copy{left:22px!important;right:22px!important;bottom:18px!important;gap:4px!important}.feature-copy small{color:#b84d32!important;font-size:10px!important}.feature-copy strong{color:#17110e!important;font-size:26px!important}.feature-copy i{color:#766761!important;font-size:12px!important}.section{margin-top:38px!important}.section-title h2{color:#17110e!important;font-size:22px!important}.section-title span,.section-break,.showcase-title{color:#b84d32!important}.showcase{margin-top:30px!important}.showcase-title{margin-bottom:13px!important}.showcase-title span:first-child{font-size:11px!important}.showcase-item,.product-item{min-height:250px!important;padding:10px 10px 60px!important;border:1px solid #e9e2dd!important;border-radius:22px!important;background:#fff!important;color:#17110e!important;box-shadow:0 16px 38px rgba(36,23,17,.10)!important}.showcase-item img,.product-item img{inset:10px 10px 60px!important;width:calc(100% - 20px)!important;height:calc(100% - 70px)!important;border-radius:15px!important;object-fit:cover!important;opacity:1!important;padding:0!important}.image-showcase .showcase-item img{object-fit:contain!important;background:#faf8f6!important;padding:8px!important}.showcase-item:after,.product-item:after{display:none!important}.showcase-item span,.product-item span{left:14px!important;right:14px!important;bottom:13px!important;color:#17110e!important}.showcase-item strong,.product-item strong{font-size:16px!important;line-height:1.2!important;text-shadow:none!important}.showcase-item small,.product-item i{color:#a4513e!important}.proof-card{background:#fff!important;color:#17110e!important;border:1px solid #e9e2dd!important;box-shadow:0 16px 38px rgba(36,23,17,.10)!important;padding:20px!important}.proof-metric{background:#faf7f5!important;border:1px solid #eee6e1!important;padding:15px 13px!important}.proof-metric strong{color:#17110e!important;font-size:24px!important}.proof-metric span{color:#766761!important;font-size:11px!important}.proof-card>p{color:#746760!important;font-size:12px!important}.proof-relationships span{background:#faf7f5!important}.proof-relationships b{color:#17110e!important}.proof-relationships small{color:#766761!important}.relationship-card,.team-card,.link-card,.opportunity-card{border:1px solid #e9e2dd!important;background:#fff!important;color:#17110e!important;box-shadow:0 13px 32px rgba(36,23,17,.09)!important}.relationship-card,.team-card,.link-card{min-height:86px!important;padding:14px 18px!important;border-radius:20px!important}.link-card span{font-size:16px!important}.opportunity-card{padding:18px 19px!important;border-radius:21px!important}.opportunity-card strong{font-size:19px!important}.opportunity-card>p{font-size:13px!important}.links{gap:12px!important}footer{color:#766761!important}footer strong{color:#ff5a36!important}@media(min-width:900px){.page{margin:42px auto!important}.image-showcase .showcase-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}.product-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}@media(max-width:899px){.page{width:calc(100% - 24px)!important;padding:24px 20px 48px!important;border-radius:26px!important}.feature{min-height:320px!important}.showcase-item,.product-item{min-height:195px!important}.matrix{opacity:.22!important}}@media(max-width:650px){body{background:#fff!important}.page{width:100%!important;margin:0!important;padding:20px 15px 42px!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:rgba(255,255,255,.96)!important}.hero{margin:46px 0 24px!important}.hero h1{font-size:clamp(38px,13vw,56px)!important}.bio{font-size:15px!important}.cta-card,.profile-enhanced-cta{min-height:86px!important;padding:14px 15px!important}.feature{min-height:270px!important;padding-bottom:86px!important}.feature img,.feature video{height:calc(100% - 100px)!important}.feature-copy strong{font-size:21px!important}.showcase-item,.product-item{min-height:172px!important;border-radius:18px!important}.image-showcase .showcase-grid,.product-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.proof-grid{gap:9px!important}.matrix{opacity:.16!important}}`;
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
  const socialHtml = buildSocialHtml(request, profile.username, blocks);
  const ctaHtml = buildCtaHtml(request, profile.username, blocks, profile.profile_type);
  let html = source;

  if (/<nav class="socials"[^>]*>[\s\S]*?<\/nav>/.test(html)) {
    html = html.replace(/<nav class="socials"[^>]*>[\s\S]*?<\/nav>/, socialHtml);
  }

  if (ctaHtml && !html.includes('profile-enhanced-ctas') && !html.includes('class="cta-grid"')) {
    const socialAndHeroClose = `${socialHtml}</section>`;
    if (html.includes(socialAndHeroClose)) html = html.replace(socialAndHeroClose, `${socialAndHeroClose}${ctaHtml}`);
    else if (html.includes('</section>')) html = html.replace('</section>', `</section>${ctaHtml}`);
  }

  if (html.includes('</style>')) html = html.replace('</style>', `${extraCss()}</style>`);
  else html = html.replace('</head>', `<style>${extraCss()}</style></head>`);

  const headers = new Headers(base.headers);
  headers.delete('content-length');
  return new Response(html, { status: base.status, statusText: base.statusText, headers });
}
