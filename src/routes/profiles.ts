import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import type { ProfileBlockRow, ProfileRow } from '../db/models';
import { HttpError, html, json } from '../http';
import { publicProfileUrl } from '../urls';

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char] || char); }
function safeJson(value: string): unknown { try { return JSON.parse(value); } catch { return {}; } }

export async function getPublishedProfile(username: string, env: Env): Promise<{ profile: ProfileRow; blocks: ProfileBlockRow[] }> {
  const db = new Db(requireDb(env));
  const profile = await db.first<ProfileRow>(`SELECT * FROM profiles WHERE username = ? AND visibility = 'published' LIMIT 1`, [username.toLowerCase()]);
  if (!profile) throw new HttpError(404, 'Profile not found', 'profile_not_found');
  const blocks = await db.all<ProfileBlockRow>(`SELECT * FROM profile_blocks WHERE profile_id = ? AND enabled = 1 ORDER BY position ASC`, [profile.id]);
  return { profile, blocks };
}

export async function publicProfileJson(username: string, env: Env): Promise<Response> {
  const { profile, blocks } = await getPublishedProfile(username, env);
  return json({ profile: { id: profile.id, username: profile.username, displayName: profile.display_name, type: profile.profile_type, bio: profile.bio, avatarUrl: profile.avatar_url, verificationStatus: profile.verification_status }, blocks: blocks.map((block) => ({ id: block.id, type: block.block_type, title: block.title, url: block.url, config: safeJson(block.config_json) })) }, { headers: { 'cache-control': 'public, max-age=60, s-maxage=300' } });
}

export async function renderPublicProfile(request: Request, env: Env, username: string): Promise<Response> {
  const { profile, blocks } = await getPublishedProfile(username, env);
  const canonical = publicProfileUrl(request, env, profile.username);
  const title = profile.seo_title || `${profile.display_name} | Linkary`;
  const description = profile.seo_description || profile.bio || `Verified ${profile.profile_type} profile on Linkary.`;
  const blockHtml = blocks.map((block) => block.url ? `<a class="profile-link" href="${escapeHtml(block.url)}" rel="noopener noreferrer">${escapeHtml(block.title || block.url)}</a>` : '').join('\n');
  const structuredData = JSON.stringify({ '@context': 'https://schema.org', '@type': profile.profile_type === 'project' ? 'Organization' : 'Person', name: profile.display_name, url: canonical, description }).replace(/</g, '\\u003c');
  return html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="profile"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta name="twitter:card" content="summary"><script type="application/ld+json">${structuredData}</script><style>:root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7f7f5;color:#171717}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(180deg,#fff 0,#f7f7f5 100%)}main{width:min(680px,calc(100% - 32px));margin:0 auto;padding:64px 0 48px}.card{background:#fff;border:1px solid #e7e5e4;border-radius:24px;padding:28px;box-shadow:0 18px 50px rgba(0,0,0,.06)}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#f26419;font-weight:700}.name{font-size:clamp(30px,6vw,46px);line-height:1.05;margin:12px 0 10px}.handle{color:#737373;margin-bottom:18px}.bio{font-size:17px;line-height:1.6;color:#404040}.links{display:grid;gap:12px;margin-top:26px}.profile-link{display:flex;padding:15px 16px;border:1px solid #e7e5e4;border-radius:14px;color:#171717;text-decoration:none;font-weight:650;background:#fff}.profile-link:hover{border-color:#f26419;transform:translateY(-1px)}footer{text-align:center;color:#a3a3a3;font-size:13px;margin-top:24px}@media(max-width:520px){main{padding-top:28px}.card{padding:22px;border-radius:20px}}</style></head><body><main><article class="card"><div class="eyebrow">Verified ${escapeHtml(profile.profile_type)}</div><h1 class="name">${escapeHtml(profile.display_name)}</h1><div class="handle">@${escapeHtml(profile.username)}</div><p class="bio">${escapeHtml(profile.bio || '')}</p><div class="links">${blockHtml}</div></article><footer>Powered by Linkary</footer></main></body></html>`, { headers: { 'cache-control': 'public, max-age=60, s-maxage=300' } });
}

export async function renderSitemap(request: Request, env: Env): Promise<Response> {
  const db = new Db(requireDb(env));
  const rows = await db.all<{ username: string; updated_at: string }>(`SELECT username, updated_at FROM profiles WHERE visibility = 'published' ORDER BY updated_at DESC LIMIT 50000`);
  const urls = rows.map((row) => `<url><loc>${escapeHtml(publicProfileUrl(request, env, row.username))}</loc><lastmod>${escapeHtml(row.updated_at.slice(0, 10))}</lastmod></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=3600' } });
}
