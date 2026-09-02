import type { Env } from "../env";
import { requireDb } from "../env";
import { Db } from "../db/client";
import type { ProfileBlockRow, ProfileRow } from "../db/models";
import { HttpError, html, json, readJson } from "../http";
import { publicProfileUrl } from "../urls";
import { requireAuth, verifyCsrf } from "../auth/session";
import { organizationMembership } from "./organizations";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char] || char,
  );
}
function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
function safePublicImageUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
function safeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export async function getPublishedProfile(
  username: string,
  env: Env,
): Promise<{ profile: ProfileRow; blocks: ProfileBlockRow[] }> {
  const db = new Db(requireDb(env));
  const profile = await db.first<ProfileRow>(
    `SELECT * FROM profiles WHERE username = ? AND visibility = 'published' LIMIT 1`,
    [username.toLowerCase()],
  );
  if (!profile)
    throw new HttpError(404, "Profile not found", "profile_not_found");
  const blocks = await db.all<ProfileBlockRow>(
    `SELECT * FROM profile_blocks WHERE profile_id = ? AND enabled = 1 ORDER BY position ASC`,
    [profile.id],
  );
  return { profile, blocks };
}

export async function publicProfileJson(
  username: string,
  env: Env,
): Promise<Response> {
  const { profile, blocks } = await getPublishedProfile(username, env);
  return json(
    {
      profile: {
        id: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        type: profile.profile_type,
        bio: profile.bio,
        avatarUrl: profile.avatar_url,
        verificationStatus: profile.verification_status,
      },
      blocks: blocks.map((block) => ({
        id: block.id,
        type: block.block_type,
        title: block.title,
        url: block.url,
        config: safeJson(block.config_json),
      })),
    },
    { headers: { "cache-control": "public, max-age=60, s-maxage=300" } },
  );
}

export async function profileAnalytics(
  request: Request,
  env: Env,
  profileId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  await requireEditableProfile(db, auth.user.id, profileId);
  const row = await db.first<{ link_clicks: number }>(
    "SELECT COUNT(*) AS link_clicks FROM profile_engagement_events WHERE profile_id = ?",
    [profileId],
  );
  return json({ linkClicks: row?.link_clicks || 0 });
}
export async function redirectPublicProfileBlock(
  _request: Request,
  env: Env,
  username: string,
  blockId: string,
): Promise<Response> {
  const { profile } = await getPublishedProfile(username, env);
  const db = new Db(requireDb(env));
  const block = await db.first<ProfileBlockRow>(
    "SELECT * FROM profile_blocks WHERE id = ? AND profile_id = ? AND enabled = 1 LIMIT 1",
    [blockId, profile.id],
  );
  if (!block?.url)
    throw new HttpError(
      404,
      "Profile link not found",
      "profile_link_not_found",
    );
  try {
    await db.run(
      "INSERT INTO profile_engagement_events (id, profile_id, block_id, event_type, created_at) VALUES (?, ?, ?, 'link_click', ?)",
      [
        `pge_${crypto.randomUUID().replace(/-/g, "")}`,
        profile.id,
        block.id,
        new Date().toISOString(),
      ],
    );
  } catch {
    /* Redirects remain live until the deliberate production migration runs. */
  }
  return Response.redirect(block.url, 302);
}

function youtubeThumbnail(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const id = parsed.hostname.includes("youtu.be")
      ? parsed.pathname.slice(1)
      : parsed.searchParams.get("v");
    return id && /^[a-zA-Z0-9_-]{6,20}$/.test(id)
      ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      : null;
  } catch {
    return null;
  }
}

function safeDirectImageUrl(value: string | null): string | null {
  const url = safePublicImageUrl(value);
  if (!url) return null;
  const path = new URL(url).pathname.toLowerCase();
  return /\.(avif|gif|jpe?g|png|webp)(?:$|\/)/.test(path) || new URL(url).hostname === 'i.ytimg.com' ? url : null;
}
function isDirectVideoUrl(value: string | null): boolean {
  if (!value) return false;
  try { return /\.(mp4|webm|ogg)$/i.test(new URL(value).pathname); } catch { return false; }
}

async function renderPublicProfileV2(
  request: Request,
  env: Env,
  username: string,
): Promise<Response> {
  const { profile, blocks } = await getPublishedProfile(username, env);
  const canonical = publicProfileUrl(request, env, profile.username);
  const title = profile.seo_title || `${profile.display_name} | Linkary`;
  const description =
    profile.seo_description ||
    profile.bio ||
    `Verified ${profile.profile_type} profile on Linkary.`;
  const avatarUrl = safePublicImageUrl(profile.avatar_url);
  const previewImage = new URL(
    "/assets/brand/linkary-banner.jpeg",
    canonical,
  ).toString();
  const blockUrl = (block: ProfileBlockRow) =>
    `${canonical}/go/${encodeURIComponent(block.id)}`;
  const socialTypes = new Set([
    "telegram",
    "youtube",
    "tiktok",
    "instagram",
    "facebook",
    "reddit",
    "linkedin",
  ]);
  const features = blocks.filter(
    (block) =>
      ["featured_video", "featured_article", "featured_image"].includes(
        block.block_type,
      ) && block.url,
  );
  const teams = blocks.filter(
    (block) => block.block_type === "team_member" && block.url,
  );
  const isSocial = (block: ProfileBlockRow) => {
    const identity = `${block.block_type} ${block.title || ''} ${block.url || ''}`.toLowerCase();
    return socialTypes.has(block.block_type) || ['x.com/', 'twitter.com/', 't.me/', 'linkedin.com/', 'instagram.com/', 'tiktok.com/', 'youtube.com/', 'youtu.be/', 'discord.gg/', 'discord.com/'].some((value) => identity.includes(value));
  };
  const socials = blocks.filter((block) => isSocial(block) && block.url && !['featured_video', 'featured_article', 'featured_image', 'team_member', 'heading'].includes(block.block_type));
  const links = blocks.filter(
    (block) =>
      !isSocial(block) &&
      ![
        "featured_video",
        "featured_article",
        "featured_image",
        "team_member",
        "heading",
      ].includes(block.block_type) &&
      block.url,
  );
  const linkAndHeadings = blocks.filter(
    (block) => block.block_type === 'heading' || links.some((link) => link.id === block.id),
  );
  const icon = (block: ProfileBlockRow) => {
    const key = `${block.block_type} ${block.title || ""}`.toLowerCase();
    if (key.includes("telegram")) return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M21.5 3.2 2.9 10.4c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 1.9 5.8c.2.6.1.8.7.8.4 0 .6-.2.8-.4l2.3-2.2 4.8 3.5c.9.5 1.5.3 1.7-.8L22.8 5c.3-1.4-.5-2-1.3-1.8Zm-11 10.7-.4 4.2-1.8-5.7L18.9 5.7 10.5 13.9Z"/></svg>';
    if (key.includes("youtube")) return "▶";
    if (key.includes("linkedin")) return "in";
    if (key.includes("instagram")) return "◎";
    if (key.includes("tiktok")) return "♪";
    if (key.includes("discord")) return "◉";
    if (key.includes("x") || key.includes("twitter")) return "𝕏";
    return "↗";
  };
  const avatar = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="" referrerpolicy="no-referrer">`
    : escapeHtml(
        (profile.display_name || profile.username).slice(0, 1).toUpperCase(),
      );
  const socialHtml = socials
    .map(
      (block) =>
        `<a class="social" href="${escapeHtml(blockUrl(block))}" aria-label="${escapeHtml(block.title || "Social link")}">${icon(block)}</a>`,
    )
    .join("");
  const featureHtml = `<style>footer{display:none}</style>` + features
    .map((block, index) => {
      const config = safeJson(block.config_json) as { mediaUrl?: string };
      const source = config.mediaUrl || block.url;
      const thumbnail = youtubeThumbnail(config.mediaUrl || null) || safeDirectImageUrl(config.mediaUrl || null) || (block.block_type === "featured_video" ? youtubeThumbnail(block.url) : null) || (block.block_type === "featured_image" ? safeDirectImageUrl(block.url) : null);
      const media = isDirectVideoUrl(source) ? `<video src="${escapeHtml(source!)}" muted playsinline loop autoplay style="position:absolute;width:100%;height:100%;object-fit:cover;opacity:.78"></video>` : thumbnail ? `<img src="${escapeHtml(thumbnail)}" alt="" loading="lazy">` : '<span class="feature-art">◆</span>';
      return `<a class="feature ${index === 0 ? "hero-feature" : ""}" href="${escapeHtml(blockUrl(block))}">${media}<span class="feature-shade"></span><span class="feature-copy"><small>${escapeHtml(block.block_type.replace("featured_", "FEATURED ").toUpperCase())}</small><strong>${escapeHtml(block.title || "Open featured work")}</strong><i>Explore ↗</i></span></a>`;
    })
    .join("");
  let linkHtml = linkAndHeadings
    .map(
      (block) =>
        block.block_type === 'heading'
          ? `<div class="section-break" style="padding:16px 4px 2px;color:#ffc4b4;font:700 10px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.14em">${escapeHtml(block.title || 'More')}</div>`
          :
        `<a class="link-card" href="${escapeHtml(blockUrl(block))}"><b>${icon(block)}</b><span>${escapeHtml(block.title || block.url || "Open link")}</span><i>↗</i></a>`,
    )
    .join("");
  linkHtml = linkHtml || "<style>.features + .section{display:none}</style>";
  const teamHtml = teams
    .map(
      (block) =>
        `<a class="team-card" href="${escapeHtml(blockUrl(block))}"><b>${escapeHtml((block.title || "?").slice(0, 1).toUpperCase())}</b><span><strong>${escapeHtml(block.title || "Team member")}</strong><small>${escapeHtml(String((safeJson(block.config_json) as { role?: string }).role || "Team member"))}</small></span><i>↗</i></a>`,
    )
    .join("");
  const structuredData = safeScriptJson({
    "@context": "https://schema.org",
    "@type": profile.profile_type === "project" ? "Organization" : "Person",
    name: profile.display_name,
    url: canonical,
    description,
    ...(avatarUrl ? { image: avatarUrl } : {}),
  });
  const shareData = safeScriptJson({
    title,
    text: description,
    url: canonical,
  });
  const typeLabel =
    profile.profile_type === "project"
      ? "PROJECT IDENTITY"
      : "CREATOR IDENTITY";
  const teamSection = teamHtml
    ? `<section class="section"><div class="section-title"><span>THE PEOPLE</span><h2>Team</h2></div><div class="team-grid">${teamHtml}</div></section>`
    : "";
  return html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="profile"><meta property="og:site_name" content="Linkary"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(previewImage)}"><meta property="og:image:secure_url" content="${escapeHtml(previewImage)}"><meta property="og:image:width" content="1500"><meta property="og:image:height" content="500"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(previewImage)}"><script type="application/ld+json">${structuredData}</script><style>:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f6f2ec;background:#100d0b}*{box-sizing:border-box}body{min-height:100vh;margin:0;background:radial-gradient(900px 560px at 50% -12%,#ff633f 0,transparent 58%),radial-gradient(700px 550px at 0 75%,#3e1712 0,transparent 62%),#100d0b}.page{width:min(760px,100%);margin:auto;padding:24px 20px 52px}.top{display:flex;justify-content:space-between;align-items:center}.brand{color:#fff;text-decoration:none;font-size:15px;font-weight:850;letter-spacing:-.04em}.brand:before{content:'≡';display:inline-grid;place-items:center;width:27px;height:27px;margin-right:7px;border-radius:7px;background:#ff5a36;color:#111;font-size:20px;vertical-align:middle}.share{border:1px solid #ffffff2c;border-radius:999px;padding:10px 14px;background:#ffffff12;color:#fff;font:700 12px/1 inherit;cursor:pointer;backdrop-filter:blur(10px)}.hero{margin:58px 0 28px;text-align:center}.avatar{width:96px;height:96px;margin:auto;border:3px solid #ffffff66;border-radius:32px;display:grid;place-items:center;overflow:hidden;background:linear-gradient(145deg,#ff5a36,#26100d);box-shadow:0 18px 50px #0008;color:#fff;font-size:34px;font-weight:900}.avatar img{width:100%;height:100%;object-fit:cover}.eyebrow{margin-top:17px;color:#ffc4b4;font:700 10px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.15em}.hero h1{margin:9px 0 5px;font-size:clamp(38px,9vw,60px);letter-spacing:-.075em;line-height:.94}.handle{color:#d6c8c0;font-size:14px}.bio{max-width:600px;margin:18px auto 0;color:#efe4dc;font-size:16px;line-height:1.58}.socials{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin:24px 0 36px}.social{width:44px;height:44px;display:grid;place-items:center;border:1px solid #ffffff2e;border-radius:14px;background:#ffffff10;color:#fff;text-decoration:none;font-weight:850;box-shadow:0 8px 22px #0003;transition:transform .18s ease,background .18s ease}.social:hover{transform:translateY(-3px);background:#ff5a36;color:#15100e}.features{display:grid;gap:14px}.feature{position:relative;min-height:220px;overflow:hidden;border:1px solid #ffffff24;border-radius:24px;background:linear-gradient(130deg,#2c1510,#c74327);color:#fff;text-decoration:none;box-shadow:0 18px 44px #0005}.feature img{position:absolute;width:100%;height:100%;object-fit:cover;opacity:.78}.feature-art{position:absolute;right:8%;top:13%;font-size:120px;color:#ffffff18}.feature-shade{position:absolute;inset:0;background:linear-gradient(0deg,#100b09 0%,#100b0970 48%,transparent 100%)}.feature-copy{position:absolute;inset:auto 22px 20px;display:grid;gap:7px}.feature-copy small,.section-title span{font:700 10px/1 ui-monospace,SFMono-Regular,monospace;letter-spacing:.13em;color:#ffc4b4}.feature-copy strong{font-size:clamp(22px,4vw,31px);letter-spacing:-.05em}.feature-copy i{font-size:13px;font-style:normal;color:#ffe0d6}.section{margin-top:34px}.section-title{display:flex;align-items:baseline;justify-content:space-between;margin:0 4px 12px}.section-title h2{margin:0;font-size:18px;letter-spacing:-.04em}.links{display:grid;gap:10px}.link-card,.team-card{min-height:68px;display:grid;grid-template-columns:42px 1fr 20px;align-items:center;gap:12px;padding:10px 15px;border:1px solid #ffffff1f;border-radius:18px;background:#fff;color:#17110e;text-decoration:none;box-shadow:0 9px 25px #0003;transition:transform .18s ease,box-shadow .18s ease}.link-card:hover,.team-card:hover{transform:translateY(-3px);box-shadow:0 16px 34px #0007}.link-card b,.team-card b{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:#f8e7e1;color:#ec4e2c;font-size:16px}.link-card span{font-size:15px;font-weight:780}.link-card i,.team-card i{font-style:normal;color:#9b8177}.team-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.team-card span{display:grid;gap:3px}.team-card strong{font-size:14px}.team-card small{font-size:12px;color:#816e65}footer{margin-top:42px;color:#bcaea6;text-align:center;font-size:12px}footer strong{color:#ff6a49}@media(max-width:560px){.page{padding:18px 14px 38px}.hero{margin:46px 0 24px}.avatar{width:82px;height:82px;border-radius:27px}.bio{font-size:15px}.feature{min-height:185px;border-radius:20px}.feature-copy{inset:auto 17px 17px}.link-card,.team-card{border-radius:15px;min-height:62px}.team-grid{grid-template-columns:1fr}.social{width:42px;height:42px}}</style></head><body><main class="page"><header class="top"><a class="brand" href="https://linkary.xyz">Linkary</a><button class="share" type="button" data-share>Share</button></header><section class="hero"><div class="avatar">${avatar}</div><div class="eyebrow">${typeLabel}</div><h1>${escapeHtml(profile.display_name)}</h1><div class="handle">@${escapeHtml(profile.username)}</div>${profile.bio ? `<p class="bio">${escapeHtml(profile.bio)}</p>` : ""}</section>${socialHtml ? `<nav class="socials" aria-label="Social links">${socialHtml}</nav>` : ""}${featureHtml ? `<section class="features">${featureHtml}</section>` : ""}<section class="section"><div class="section-title"><span>LINKARY PROFILE</span><h2>${profile.profile_type === "project" ? "Official links" : "Links & work"}</h2></div><div class="links">${linkHtml || '<div class="link-card"><span>Your curated links are coming soon.</span></div>'}</div></section>${teamSection}<footer>Built on <strong>Linkary</strong> · Identity that compounds</footer></main><script>(function(){var button=document.querySelector('[data-share]');if(!button)return;var data=${shareData};button.addEventListener('click',async function(){try{if(navigator.share){await navigator.share(data);return;}if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(data.url);button.textContent='Copied';setTimeout(function(){button.textContent='Share';},1800);return;}window.prompt('Copy this Linkary profile URL',data.url);}catch(error){if(error&&error.name==='AbortError')return;window.prompt('Copy this Linkary profile URL',data.url);}});})();</script></body></html>`,
    { headers: { "cache-control": "public, max-age=60, s-maxage=300" } },
  );
}

export async function renderPublicProfile(
  request: Request,
  env: Env,
  username: string,
): Promise<Response> {
  return renderPublicProfileV2(request, env, username);
  const { profile, blocks } = await getPublishedProfile(username, env);
  const canonical = publicProfileUrl(request, env, profile.username);
  const title = profile.seo_title || `${profile.display_name} | Linkary`;
  const description =
    profile.seo_description ||
    profile.bio ||
    `Verified ${profile.profile_type} profile on Linkary.`;
  const brandedPreviewImage = new URL(
    "/assets/brand/linkary-banner.jpeg",
    canonical,
  ).toString();
  const avatarUrl = safePublicImageUrl(profile.avatar_url);
  const icon = (value: string | null) => {
    const key = (value || "").toLowerCase();
    if (key.includes("telegram")) return "✈";
    if (key.includes("youtube")) return "▶";
    if (key.includes("linkedin")) return "in";
    if (key.includes("tiktok")) return "♪";
    if (key === "x" || key.includes("twitter")) return "𝕏";
    return "↗";
  };
  const featureBlocks = blocks.filter(
    (block) =>
      ["featured_video", "featured_article", "featured_image"].includes(
        block.block_type,
      ) && block.url,
  );
  const teamBlocks = blocks.filter(
    (block) => block.block_type === "team_member",
  );
  const linkBlocks = blocks.filter(
    (block) =>
      ![
        "featured_video",
        "featured_article",
        "featured_image",
        "team_member",
      ].includes(block.block_type) && block.url,
  );
  const blockUrl = (block: ProfileBlockRow) =>
    `${canonical}/go/${encodeURIComponent(block.id)}`;
  const featureHtml = featureBlocks
    .map(
      (block) =>
        `<a class="feature-card" href="${escapeHtml(blockUrl(block))}"><span class="feature-kicker">FEATURED ${block.block_type.replace("featured_", "").toUpperCase()}</span><strong>${escapeHtml(block.title || "Open featured work")}</strong><i>Explore ↗</i></a>`,
    )
    .join("");
  const linksHtml = [...linkBlocks, ...teamBlocks]
    .map((block) =>
      block.block_type === "team_member"
        ? `<a class="profile-link team-card" href="${escapeHtml(blockUrl(block))}"><b>${escapeHtml((block.title || "?").slice(0, 1).toUpperCase())}</b><span><strong>${escapeHtml(block.title || "Team member")}</strong><small>${escapeHtml(String((safeJson(block.config_json) as { role?: string }).role || "Team"))}</small></span><i>↗</i></a>`
        : `<a class="profile-link" href="${escapeHtml(blockUrl(block))}"><b>${icon(block.title)}</b><span>${escapeHtml(block.title || block.url!)}</span><i>↗</i></a>`,
    )
    .join("");
  const structuredData = safeScriptJson({
    "@context": "https://schema.org",
    "@type": profile.profile_type === "project" ? "Organization" : "Person",
    name: profile.display_name,
    url: canonical,
    description,
    ...(avatarUrl ? { image: avatarUrl } : {}),
  });
  const shareData = safeScriptJson({
    title,
    text: description,
    url: canonical,
  });
  const avatarHtml = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="" referrerpolicy="no-referrer">`
    : escapeHtml(
        (profile.display_name || profile.username).slice(0, 1).toUpperCase(),
      );
  return html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="profile"><meta property="og:site_name" content="Linkary"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(brandedPreviewImage)}"><meta property="og:image:secure_url" content="${escapeHtml(brandedPreviewImage)}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1500"><meta property="og:image:height" content="500"><meta property="og:image:alt" content="${escapeHtml(`${profile.display_name} on Linkary`)}">${avatarUrl ? `<meta property="og:image" content="${escapeHtml(avatarUrl)}"><meta property="og:image:alt" content="${escapeHtml(`${profile.display_name} profile image`)}">` : ""}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeHtml(title)}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${escapeHtml(brandedPreviewImage)}"><meta name="twitter:image:alt" content="${escapeHtml(`${profile.display_name} on Linkary`)}"><script type="application/ld+json">${structuredData}</script><style>:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#14110d;background:#f5f1eb}*{box-sizing:border-box}body{min-height:100vh;margin:0;background:radial-gradient(900px 450px at 50% -10%,#ffd8c7 0,transparent 70%),#f5f1eb}.page{width:min(680px,100%);margin:auto;padding:32px 20px 44px}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:48px}.brand{font-size:15px;font-weight:850;letter-spacing:-.03em;color:#16120e;text-decoration:none}.brand:before{content:'≡';display:inline-grid;place-items:center;width:25px;height:25px;margin-right:7px;background:#15110e;color:#fff;border-radius:6px;font-size:19px;vertical-align:middle}.share{border:1px solid #ded6cd;border-radius:999px;padding:9px 13px;color:#6a625a;background:#fff;cursor:pointer;font-size:12px}.identity{text-align:center}.avatar{width:88px;height:88px;margin:0 auto 16px;border:4px solid #fff;border-radius:28px;display:grid;place-items:center;overflow:hidden;background:linear-gradient(140deg,#ff5733,#241711);box-shadow:0 12px 36px #3c21152b;color:#fff;font-weight:900;font-size:31px}.avatar img{width:100%;height:100%;object-fit:cover}.eyebrow{color:#f4512a;font:10px ui-monospace,SFMono-Regular,monospace;letter-spacing:.1em}.identity h1{margin:9px 0 5px;font-size:clamp(34px,9vw,52px);letter-spacing:-.07em;line-height:.96}.handle{color:#786f67;font-size:14px}.bio{max-width:510px;margin:20px auto 0;color:#514a44;line-height:1.65;font-size:15px}.features{display:grid;gap:12px;margin:32px 0}.feature-card{min-height:132px;padding:20px;border-radius:18px;display:grid;align-content:end;gap:6px;background:linear-gradient(125deg,#1d1714,#68301e 62%,#ff5b32);color:#fff;text-decoration:none;box-shadow:0 12px 26px #5b241526}.feature-kicker{font:10px ui-monospace,monospace;letter-spacing:.11em;opacity:.75}.feature-card strong{font-size:22px;letter-spacing:-.04em}.feature-card i{font-size:13px;font-style:normal;opacity:.85}.links{display:grid;gap:10px}.profile-link{min-height:64px;padding:10px 14px;display:grid;grid-template-columns:38px 1fr 20px;gap:8px;align-items:center;border:1px solid #e3dcd3;border-radius:16px;background:#fff;color:#1b1713;text-decoration:none;box-shadow:0 4px 12px #4a302008;transition:transform .18s ease,box-shadow .18s ease}.profile-link:hover{transform:translateY(-2px);box-shadow:0 11px 20px #4a302019}.profile-link b{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#f8eee8;color:#ef4d2c;font-size:15px}.profile-link span{font-size:15px;font-weight:750}.profile-link i{color:#a59a90;font-style:normal}.empty{margin:32px 0;padding:18px;border:1px dashed #d8cec3;border-radius:14px;text-align:center;color:#776e66;font-size:14px}footer{margin-top:42px;text-align:center;color:#90867c;font-size:12px}footer strong{color:#e9512e}@media(max-width:480px){.page{padding:20px 15px 32px}.top{margin-bottom:34px}.avatar{width:76px;height:76px;border-radius:24px}.profile-link{min-height:60px;border-radius:14px}.feature-card{min-height:118px}}</style></head><body><main class="page"><header class="top"><a class="brand" href="https://linkary.xyz">Linkary</a><button class="share" type="button" data-share>Share profile ↗</button></header><section class="identity"><div class="avatar">${avatarHtml}</div><div class="eyebrow">${profile.profile_type === "project" ? "PROJECT PROFILE" : "CREATOR PROFILE"}</div><h1>${escapeHtml(profile.display_name)}</h1><div class="handle">@${escapeHtml(profile.username)}</div>${profile.bio ? `<p class="bio">${escapeHtml(profile.bio)}</p>` : ""}</section>${featureHtml ? `<section class="features">${featureHtml}</section>` : ""}<section class="links">${linksHtml || '<div class="empty">This profile is being curated.</div>'}</section><footer>Built on <strong>Linkary</strong> · Growth intelligence that compounds</footer></main><script>(function(){var button=document.querySelector('[data-share]');if(!button)return;var data=${shareData};button.addEventListener('click',async function(){try{if(navigator.share){await navigator.share(data);return;}if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(data.url);button.textContent='Link copied';setTimeout(function(){button.textContent='Share profile ↗';},1800);return;}window.prompt('Copy this Linkary profile URL',data.url);}catch(error){if(error&&error.name==='AbortError')return;window.prompt('Copy this Linkary profile URL',data.url);}});})();</script></body></html>`,
    { headers: { "cache-control": "public, max-age=60, s-maxage=300" } },
  );
}

export async function renderSitemap(
  request: Request,
  env: Env,
): Promise<Response> {
  const db = new Db(requireDb(env));
  const rows = await db.all<{ username: string; updated_at: string }>(
    `SELECT username, updated_at FROM profiles WHERE visibility = 'published' ORDER BY updated_at DESC LIMIT 50000`,
  );
  const urls = rows
    .map(
      (row) =>
        `<url><loc>${escapeHtml(publicProfileUrl(request, env, row.username))}</loc><lastmod>${escapeHtml(row.updated_at.slice(0, 10))}</lastmod></url>`,
    )
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    {
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=3600",
      },
    },
  );
}

async function canEditProfile(
  db: Db,
  userId: string,
  profile: ProfileRow,
): Promise<boolean> {
  if (profile.profile_type === "creator")
    return profile.owner_user_id === userId;
  if (!profile.organization_id) return false;
  const membership = await organizationMembership(
    db,
    userId,
    profile.organization_id,
  );
  return Boolean(
    membership &&
      ["owner", "admin", "marketing_manager"].includes(membership.role),
  );
}
async function requireEditableProfile(
  db: Db,
  userId: string,
  profileId: string,
): Promise<ProfileRow> {
  const profile = await db.first<ProfileRow>(
    `SELECT * FROM profiles WHERE id = ?`,
    [profileId],
  );
  if (!profile)
    throw new HttpError(404, "Profile not found", "profile_not_found");
  if (!(await canEditProfile(db, userId, profile)))
    throw new HttpError(403, "Profile edit access denied", "forbidden");
  return profile;
}
export async function getEditableProfile(
  request: Request,
  env: Env,
  profileId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  const profile = await requireEditableProfile(db, auth.user.id, profileId);
  return json({
    profile: {
      id: profile.id,
      displayName: profile.display_name,
      bio: profile.bio,
      seoTitle: profile.seo_title,
      seoDescription: profile.seo_description,
      visibility: profile.visibility,
    },
  });
}
function cleanText(value: unknown, max: number): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string")
    throw new HttpError(400, "Invalid text field", "invalid_profile_field");
  return value.trim().slice(0, max);
}
function validateDestination(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string")
    throw new HttpError(400, "Invalid URL", "invalid_url");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, "Invalid URL", "invalid_url");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new HttpError(400, "Only HTTP(S) links are supported", "invalid_url");
  return url.toString();
}

export async function updateProfile(
  request: Request,
  env: Env,
  profileId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const profile = await requireEditableProfile(db, auth.user.id, profileId);
  const body = await readJson<{
    displayName?: string;
    bio?: string;
    seoTitle?: string;
    seoDescription?: string;
  }>(request);
  await db.run(
    `UPDATE profiles SET display_name = COALESCE(?, display_name), bio = COALESCE(?, bio), seo_title = ?, seo_description = ?, updated_at = ? WHERE id = ?`,
    [
      cleanText(body.displayName, 80),
      cleanText(body.bio, 500),
      cleanText(body.seoTitle, 70),
      cleanText(body.seoDescription, 180),
      new Date().toISOString(),
      profile.id,
    ],
  );
  return json({ ok: true, profileId: profile.id });
}
export async function listProfileBlocks(
  request: Request,
  env: Env,
  profileId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  const db = new Db(requireDb(env));
  await requireEditableProfile(db, auth.user.id, profileId);
  const blocks = await db.all<ProfileBlockRow>(
    `SELECT * FROM profile_blocks WHERE profile_id = ? ORDER BY position ASC`,
    [profileId],
  );
  return json({
    blocks: blocks.map((b) => ({
      id: b.id,
      type: b.block_type,
      title: b.title,
      url: b.url,
      enabled: Boolean(b.enabled),
      config: safeJson(b.config_json),
    })),
  });
}
export async function addProfileBlock(
  request: Request,
  env: Env,
  profileId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  await requireEditableProfile(db, auth.user.id, profileId);
  const body = await readJson<{
    type?: string;
    title?: string;
    url?: string;
    config?: unknown;
  }>(request);
  const allowed = new Set([
    "link",
    "social_link",
    "telegram",
    "youtube",
    "tiktok",
    "instagram",
    "facebook",
    "reddit",
    "linkedin",
    "website",
    "booking",
    "custom_button",
    "featured_article",
    "featured_video",
    "featured_image",
    "campaign_proof",
    "media_kit",
    "work_with_me",
    "project_card",
    "community_card",
    "team_member",
    "heading",
  ]);
  if (!body.type || !allowed.has(body.type))
    throw new HttpError(
      400,
      "Unsupported profile block type",
      "invalid_block_type",
    );
  const positionRow = await db.first<{ next_position: number }>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM profile_blocks WHERE profile_id = ?`,
    [profileId],
  );
  const blockId = `blk_${crypto.randomUUID().replace(/-/g, "")}`;
  const timestamp = new Date().toISOString();
  await db.run(
    `INSERT INTO profile_blocks (id, profile_id, block_type, position, enabled, title, url, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    [
      blockId,
      profileId,
      body.type,
      positionRow?.next_position || 0,
      cleanText(body.title, 120),
      validateDestination(body.url),
      JSON.stringify(body.config || {}),
      timestamp,
      timestamp,
    ],
  );
  return json({ id: blockId }, { status: 201 });
}
export async function updateProfileBlock(
  request: Request,
  env: Env,
  profileId: string,
  blockId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  await requireEditableProfile(db, auth.user.id, profileId);
  if (
    !(await db.first<{ id: string }>(
      `SELECT id FROM profile_blocks WHERE id = ? AND profile_id = ?`,
      [blockId, profileId],
    ))
  )
    throw new HttpError(404, "Block not found", "block_not_found");
  const body = await readJson<{
    title?: string;
    url?: string | null;
    enabled?: boolean;
    config?: unknown;
  }>(request);
  await db.run(
    `UPDATE profile_blocks SET title = COALESCE(?, title), url = COALESCE(?, url), enabled = COALESCE(?, enabled), config_json = COALESCE(?, config_json), updated_at = ? WHERE id = ? AND profile_id = ?`,
    [
      cleanText(body.title, 120),
      body.url === undefined ? null : validateDestination(body.url),
      body.enabled === undefined ? null : body.enabled ? 1 : 0,
      body.config === undefined ? null : JSON.stringify(body.config),
      new Date().toISOString(),
      blockId,
      profileId,
    ],
  );
  return json({ ok: true });
}
export async function reorderProfileBlocks(
  request: Request,
  env: Env,
  profileId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  await requireEditableProfile(db, auth.user.id, profileId);
  const body = await readJson<{ blockIds?: string[] }>(request);
  if (
    !Array.isArray(body.blockIds) ||
    new Set(body.blockIds).size !== body.blockIds.length ||
    body.blockIds.length > 100
  )
    throw new HttpError(400, "Invalid block order", "invalid_block_order");
  const current = await db.all<{ id: string }>(
    `SELECT id FROM profile_blocks WHERE profile_id = ?`,
    [profileId],
  );
  if (
    current.length !== body.blockIds.length ||
    current.some((row) => !body.blockIds!.includes(row.id))
  )
    throw new HttpError(
      400,
      "Block order must include every profile block exactly once",
      "invalid_block_order",
    );
  const timestamp = new Date().toISOString();
  await db.batch(
    body.blockIds.map((blockId, position) =>
      db.statement(
        `UPDATE profile_blocks SET position = ?, updated_at = ? WHERE id = ? AND profile_id = ?`,
        [position, timestamp, blockId, profileId],
      ),
    ),
  );
  return json({ ok: true });
}
export async function deleteProfileBlock(
  request: Request,
  env: Env,
  profileId: string,
  blockId: string,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  await requireEditableProfile(db, auth.user.id, profileId);
  await db.run(`DELETE FROM profile_blocks WHERE id = ? AND profile_id = ?`, [
    blockId,
    profileId,
  ]);
  return json({ ok: true });
}
export async function publishProfile(
  request: Request,
  env: Env,
  profileId: string,
  published: boolean,
): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const profile = await requireEditableProfile(db, auth.user.id, profileId);
  if (profile.verification_status !== "verified_x")
    throw new HttpError(
      409,
      "Verified X ownership is required before publishing",
      "verification_required",
    );
  const timestamp = new Date().toISOString();
  await db.run(
    `UPDATE profiles SET visibility = ?, published_at = ?, updated_at = ? WHERE id = ?`,
    [
      published ? "published" : "private",
      published ? timestamp : null,
      timestamp,
      profileId,
    ],
  );
  return json({ ok: true, visibility: published ? "published" : "private" });
}
