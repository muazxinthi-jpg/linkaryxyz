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
  return `.profile-enhanced-ctas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 18px}.profile-enhanced-cta{display:grid;grid-template-columns:42px 1fr 20px;align-items:center;gap:11px;min-height:78px;padding:12px 14px;border-radius:19px;background:#ff6543;color:#17110e;text-decoration:none;box-shadow:0 12px 30px #0004}.profile-enhanced-cta.media_kit{background:#f5eee9}.profile-enhanced-cta>b{width:40px;height:40px;display:grid;place-items:center;border-radius:13px;background:#ffffff90;font-size:18px}.profile-enhanced-cta>span{display:grid;gap:4px}.profile-enhanced-cta small{font:800 9px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em}.profile-enhanced-cta strong{font-size:15px}.profile-enhanced-cta>i{font-style:normal}.socials a{background:#fff!important}.socials .profile-social-brand{display:block;width:21px;height:21px;object-fit:contain}.profile-social-custom{font-size:14px;font-weight:900;color:#17110e}@media(max-width:650px){.profile-enhanced-ctas{grid-template-columns:1fr}}`;
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

  if (ctaHtml && !html.includes('profile-enhanced-ctas')) {
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
