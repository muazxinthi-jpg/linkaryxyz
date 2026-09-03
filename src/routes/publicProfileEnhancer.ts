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
  return `
:root,html{background:#fff!important;color:#151210!important}
body{min-height:100vh!important;background:radial-gradient(900px 520px at 12% 4%,rgba(255,90,54,.10),transparent 70%),radial-gradient(850px 560px at 90% 28%,rgba(255,90,54,.07),transparent 72%),#fff!important;color:#151210!important}
body:before,body:after,.page:before,.page:after{display:none!important;content:none!important}
.matrix{display:block!important;z-index:0!important;opacity:.46!important;mix-blend-mode:multiply!important;filter:saturate(1.35) contrast(1.08)!important;pointer-events:none!important}
.page{position:relative!important;z-index:1!important;width:min(1180px,calc(100% - 64px))!important;margin:42px auto!important;padding:34px 46px 76px!important;overflow:hidden!important;background:rgba(255,255,255,.92)!important;background-image:none!important;color:#151210!important;border:1px solid rgba(255,90,54,.22)!important;border-radius:34px!important;box-shadow:0 24px 80px rgba(41,27,20,.12)!important;backdrop-filter:blur(2px)!important}
.page>*{position:relative;z-index:1}
.top{color:#151210!important}
.brand{color:#151210!important}
.brand:before{background:#ff5a36!important;color:#fff!important}
.share{background:#fff!important;color:#151210!important;border:1px solid #e7ddd7!important;box-shadow:0 8px 22px rgba(30,20,15,.08)!important}
.hero{margin:54px 0 28px!important;color:#151210!important}
.avatar{border:2px solid #ff5a36!important;background:#fff!important;box-shadow:0 14px 38px rgba(42,28,20,.13)!important}
.eyebrow{margin-top:15px!important;color:#ff5a36!important}
.hero h1{margin:10px 0 6px!important;color:#111!important;font-size:clamp(42px,4.5vw,62px)!important;line-height:.98!important;letter-spacing:-.055em!important;text-shadow:none!important}
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
footer{color:#74665f!important}
footer strong{color:#ff5a36!important}
@media(min-width:900px){.image-showcase .showcase-grid,.product-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
@media(max-width:899px){.page{width:calc(100% - 24px)!important;margin:18px auto!important;padding:24px 20px 48px!important;border-radius:26px!important}.hero h1{font-size:clamp(40px,7vw,56px)!important}.feature{min-height:320px!important}.showcase-item,.product-item{min-height:195px!important}.matrix{opacity:.38!important}}
@media(max-width:650px){body{background:#fff!important}.page{width:100%!important;margin:0!important;padding:20px 15px 42px!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:rgba(255,255,255,.94)!important}.hero{margin:42px 0 23px!important}.hero h1{font-size:clamp(34px,11vw,48px)!important}.bio{font-size:15px!important}.socials a,.social{width:45px!important;height:45px!important}.cta-card,.profile-enhanced-cta{min-height:86px!important;padding:14px 15px!important}.feature{min-height:270px!important;padding-bottom:86px!important}.feature img,.feature video{height:calc(100% - 100px)!important}.feature-copy strong{font-size:21px!important}.showcase-item,.product-item{min-height:172px!important;border-radius:18px!important}.image-showcase .showcase-grid,.product-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.proof-grid{gap:9px!important}.matrix{opacity:.30!important}}
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

  html = html.replace('</head>', `<style id="linkary-enhanced-theme">${extraCss()}</style></head>`);

  const headers = new Headers(base.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'public, max-age=30, s-maxage=60');
  return new Response(html, { status: base.status, statusText: base.statusText, headers });
}
