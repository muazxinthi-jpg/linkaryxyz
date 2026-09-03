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

function icon(platform: string): string {
  const icons: Record<string, string> = {
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2.7h3.7l-8.1 9.2 9.5 9.4h-7.4l-5.8-5.7-5 5.7H1.9l8.7-9.9-9.1-8.8h7.6l5.2 5.2 4.6-5.2Zm-1.3 16.5h2L8.1 4.4H6L17.6 19.2Z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 3.5A2.2 2.2 0 1 1 5.1 8a2.2 2.2 0 0 1 .1-4.5ZM3.3 9.8h3.8v10.7H3.3V9.8Zm6.2 0h3.6v1.5h.1c.5-.9 1.7-1.9 3.6-1.9 3.9 0 4.6 2.5 4.6 5.8v5.3h-3.8v-4.7c0-1.1 0-2.6-1.6-2.6s-1.9 1.2-1.9 2.5v4.8H9.5V9.8Z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.1 21v-8h2.7l.4-3.1h-3.1V8c0-.9.3-1.5 1.6-1.5h1.7V3.7c-.3 0-1.3-.1-2.4-.1-2.4 0-4.1 1.5-4.1 4.2v2H8.2V13H11v8h3.1Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5Zm0 2A2.5 2.5 0 1 0 14.5 12 2.5 2.5 0 0 0 12 9.5Zm5.2-3.3a1.1 1.1 0 1 1-1.1 1.1 1.1 1.1 0 0 1 1.1-1.1Z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 12s0-3.2-.4-4.7a3.1 3.1 0 0 0-2.2-2.2C18.9 4.7 12 4.7 12 4.7s-6.9 0-8.4.4a3.1 3.1 0 0 0-2.2 2.2C1 8.8 1 12 1 12s0 3.2.4 4.7a3.1 3.1 0 0 0 2.2 2.2c1.5.4 8.4.4 8.4.4s6.9 0 8.4-.4a3.1 3.1 0 0 0 2.2-2.2C23 15.2 23 12 23 12Zm-13.8 3.6V8.4l6.2 3.6-6.2 3.6Z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 3.6 2.8 10.8c-1.3.5-1.3 1.2-.2 1.6l4.8 1.5 1.8 5.6c.2.6.1.9.8.9.5 0 .7-.2 1-.5l2.3-2.2 4.9 3.6c.9.5 1.6.3 1.8-.8l3.2-15.1c.4-1.3-.5-1.9-1.8-1.8Zm-3 4.2-8.1 7.3-.3 3.2-1.6-5.1 9.7-6.1c.4-.3.8-.1.3.3Z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a9.8 9.8 0 0 0-8.5 14.7L2.2 22l5.5-1.4A9.9 9.9 0 1 0 12 2Zm0 17.7a7.8 7.8 0 0 1-4-1.1l-.3-.2-3.2.8.9-3.1-.2-.3A7.8 7.8 0 1 1 12 19.7Zm4.3-5.8c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.6.2l-.8 1c-.1.2-.3.2-.5.1-1.4-.7-2.4-1.3-3.3-2.9-.2-.3.2-.4.6-1.2.1-.2 0-.4 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.2-.5-.3Z"/></svg>',
    reddit: '<span class="profile-social-letter">r/</span>',
    tiktok: '<span class="profile-social-letter">♪</span>',
    discord: '<span class="profile-social-letter">◉</span>',
    github: '<span class="profile-social-letter">GH</span>',
    farcaster: '<span class="profile-social-letter">F</span>',
    custom: '<span class="profile-social-letter">↗</span>',
  };
  return icons[platform] || icons.custom;
}

function extraCss(): string {
  return `.profile-enhanced-ctas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 18px}.profile-enhanced-cta{display:grid;grid-template-columns:42px 1fr 20px;align-items:center;gap:11px;min-height:78px;padding:12px 14px;border-radius:19px;background:#ff6543;color:#17110e;text-decoration:none;box-shadow:0 12px 30px #0004}.profile-enhanced-cta.media_kit{background:#f5eee9}.profile-enhanced-cta>b{width:40px;height:40px;display:grid;place-items:center;border-radius:13px;background:#ffffff90;font-size:18px}.profile-enhanced-cta>span{display:grid;gap:4px}.profile-enhanced-cta small{font:800 9px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em}.profile-enhanced-cta strong{font-size:15px}.profile-enhanced-cta>i{font-style:normal}.socials svg{width:19px;height:19px;fill:currentColor}.profile-social-letter{font-size:10px;font-weight:950}@media(max-width:650px){.profile-enhanced-ctas{grid-template-columns:1fr}}`;
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
