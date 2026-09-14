import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json } from '../http';
import { sha256 } from '../security/crypto';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

type LiveCreative = {
  auction_id: string;
  creative_id: string;
  profile_id: string;
  advertiser_user_id: string;
  banner_url: string;
  destination_url: string;
  cta_type: string;
  tracking_code: string;
  promotion_ends_at: string | null;
};

type FeaturedHeader = {
  id: string;
  profile_id: string;
  owner_user_id: string;
  project_name: string;
  banner_url: string;
  destination_url: string;
  cta_type: string;
  tracking_code: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char] || char);
}

function ctaLabel(value: string): string {
  return ({ join: 'Join', register: 'Register', book_now: 'Book now', learn_more: 'Learn more', visit: 'Visit', explore: 'Explore', trade: 'Trade', mint: 'Mint', buy: 'Buy', view: 'View' } as Record<string, string>)[value] || 'Visit';
}

async function liveCreativeByUsername(db: Db, username: string): Promise<LiveCreative | null> {
  return db.first<LiveCreative>(
    `SELECT a.id AS auction_id, c.id AS creative_id, a.profile_id, c.advertiser_user_id,
            c.banner_url, c.destination_url, c.cta_type, c.tracking_code, a.promotion_ends_at
       FROM profiles p
       JOIN profile_promotion_auctions a ON a.profile_id = p.id
       JOIN profile_promotion_creatives c ON c.auction_id = a.id
      WHERE lower(p.username) = lower(?) AND p.visibility = 'published'
        AND a.status = 'live' AND c.moderation_status = 'approved'
        AND (a.promotion_ends_at IS NULL OR a.promotion_ends_at > ?)
      ORDER BY a.live_at DESC LIMIT 1`,
    [username, now()],
  );
}

async function liveCreativeByCode(db: Db, code: string): Promise<LiveCreative | null> {
  return db.first<LiveCreative>(
    `SELECT a.id AS auction_id, c.id AS creative_id, a.profile_id, c.advertiser_user_id,
            c.banner_url, c.destination_url, c.cta_type, c.tracking_code, a.promotion_ends_at
       FROM profile_promotion_creatives c
       JOIN profile_promotion_auctions a ON a.id = c.auction_id
      WHERE c.tracking_code = ? AND c.moderation_status = 'approved' AND a.status = 'live'
        AND (a.promotion_ends_at IS NULL OR a.promotion_ends_at > ?)
      LIMIT 1`,
    [code, now()],
  );
}

async function featuredHeaderByUsername(db: Db, username: string): Promise<FeaturedHeader | null> {
  return db.first<FeaturedHeader>(
    `SELECT h.id, h.profile_id, h.owner_user_id, h.project_name, h.banner_url, h.destination_url, h.cta_type, h.tracking_code
       FROM profiles p
       JOIN profile_featured_headers h ON h.profile_id = p.id
      WHERE lower(p.username) = lower(?) AND p.visibility = 'published' AND h.enabled = 1
      LIMIT 1`,
    [username],
  );
}

async function featuredHeaderByCode(db: Db, code: string): Promise<FeaturedHeader | null> {
  return db.first<FeaturedHeader>(
    `SELECT id, profile_id, owner_user_id, project_name, banner_url, destination_url, cta_type, tracking_code
       FROM profile_featured_headers WHERE tracking_code = ? AND enabled = 1 LIMIT 1`,
    [code],
  );
}

function trackingBase(request: Request, env: Env): string {
  try { return new URL(env.TRACKING_BASE_URL || 'https://l.linkary.xyz').origin; }
  catch { return new URL(request.url).origin; }
}

function injectHeader(response: Response, markup: string, styles: string): Promise<Response> {
  return response.text().then((html) => {
    let enhanced = html.includes('</head>') ? html.replace('</head>', `${styles}</head>`) : `${styles}${html}`;
    let inserted = false;
    const hero = enhanced.match(/<(section|div)\s+class=(['"])hero\2[^>]*>/i);
    if (hero?.index !== undefined) {
      const heroOpen = hero[0].replace(/class=(['"])hero\1/i, 'class=$1hero linkary-promotion-hero$1');
      enhanced = `${enhanced.slice(0, hero.index)}${markup}${heroOpen}${enhanced.slice(hero.index + hero[0].length)}`;
      inserted = true;
    } else {
      const mainOpen = enhanced.match(/<main\b[^>]*>/i);
      if (mainOpen?.index !== undefined) {
        const at = mainOpen.index + mainOpen[0].length;
        enhanced = `${enhanced.slice(0, at)}${markup}${enhanced.slice(at)}`;
        inserted = true;
      } else if (enhanced.includes('<body>')) {
        enhanced = enhanced.replace('<body>', `<body>${markup}`);
        inserted = true;
      } else {
        return response;
      }
    }
    if (inserted) {
      enhanced = enhanced.replace(/<main\b([^>]*?)\bclass=(['"])([^'"]*)\2([^>]*)>/i, (_match, before, quote, classNames, after) => `<main${before}class=${quote}${classNames} linkary-promotion-page${quote}${after}>`);
      enhanced = enhanced.replace(/class=(['"])([^'"]*\btop\b[^'"]*)\1/i, (_match, quote, classNames) => `class=${quote}${classNames} linkary-promotion-top${quote}`);
    }
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('cache-control', 'no-store');
    return new Response(enhanced, { status: response.status, statusText: response.statusText, headers });
  });
}

const HEADER_STYLES = `<style id="linkary-sponsored-header-style">
.page.linkary-promotion-page{position:relative!important;overflow:visible!important}
.linkary-promotion-top{position:absolute!important;top:-6px!important;left:50%!important;transform:translateX(-50%)!important;width:min(980px,calc(100vw - 56px))!important;box-sizing:border-box!important;padding:0 clamp(16px,1.8vw,24px)!important;margin:0!important;z-index:20!important;pointer-events:none!important}
.linkary-promotion-top>*{pointer-events:auto!important}
.linkary-sponsored-header{--linkary-avatar-overlap:clamp(112px,8.5vw,128px);--linkary-cta-avatar-gap:clamp(58px,4.2vw,68px);position:relative;z-index:5;width:min(980px,calc(100vw - 56px));margin:-20px 50% 0;transform:translateX(-50%);border-radius:28px;overflow:visible;isolation:isolate}
.linkary-sponsored-banner{display:block;width:100%;height:clamp(300px,28vw,340px);border-radius:28px;overflow:hidden;background:#f2f2f2;border:1px solid rgba(255,85,0,.18);box-shadow:0 18px 44px rgba(38,24,17,.14);clip-path:ellipse(100% 100% at 50% 0)}
.linkary-sponsored-banner img{width:100%;height:100%;display:block;object-fit:cover}
.linkary-sponsored-cta{position:absolute;left:50%;bottom:calc(var(--linkary-avatar-overlap) + var(--linkary-cta-avatar-gap));transform:translateX(-50%);z-index:8;display:inline-flex;align-items:center;justify-content:center;min-width:128px;height:44px;padding:0 24px;border-radius:999px;background:#ff5500;color:#fff!important;text-decoration:none!important;font:750 14px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 10px 26px rgba(255,85,0,.3);border:3px solid #fff}
.linkary-sponsored-label{position:absolute;top:58px;right:18px;z-index:7;padding:6px 10px;border-radius:999px;background:rgba(17,17,17,.72);backdrop-filter:blur(8px);color:#fff;font:700 10px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.05em;text-transform:uppercase}
.linkary-featured-project{position:absolute;left:18px;top:58px;z-index:7;max-width:55%;padding:7px 11px;border-radius:999px;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);color:#111;font:750 11px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 6px 18px rgba(17,17,17,.08)}
.linkary-sponsored-header + script + .linkary-promotion-hero,.linkary-sponsored-header + .linkary-promotion-hero{margin-top:calc(var(--linkary-avatar-overlap) * -1)!important;padding-top:0!important;position:relative!important;z-index:9!important}
.linkary-promotion-hero .avatar{width:clamp(156px,12vw,184px)!important;height:clamp(156px,12vw,184px)!important;position:relative!important;z-index:10!important;border:5px solid #fff!important;border-radius:26px!important;box-shadow:0 14px 38px rgba(42,28,20,.16)!important;overflow:hidden!important}
@media(min-width:641px) and (max-width:1024px){.linkary-promotion-top{top:-2px!important;width:min(900px,calc(100vw - 36px))!important;padding:0 18px!important}.linkary-sponsored-header{--linkary-avatar-overlap:clamp(96px,10vw,112px);--linkary-cta-avatar-gap:clamp(46px,5vw,56px);width:min(900px,calc(100vw - 36px));margin-top:-14px}.linkary-sponsored-banner{height:clamp(292px,34vw,330px)}.linkary-promotion-hero .avatar{width:clamp(148px,18vw,176px)!important;height:clamp(148px,18vw,176px)!important}}
@media(max-width:640px){.linkary-promotion-top{top:6px!important;width:calc(100vw - 16px)!important;padding:0 12px!important}.linkary-sponsored-header{--linkary-avatar-overlap:78px;--linkary-cta-avatar-gap:34px;width:calc(100vw - 16px);margin-top:-8px;border-radius:20px}.linkary-sponsored-banner{height:260px;border-radius:20px}.linkary-sponsored-cta{height:40px;min-width:112px;padding:0 18px}.linkary-sponsored-label{top:54px;right:12px}.linkary-featured-project{top:54px;left:12px;max-width:58%;font-size:10px}.linkary-promotion-hero .avatar{width:clamp(128px,36vw,152px)!important;height:clamp(128px,36vw,152px)!important;border-width:4px!important;border-radius:20px!important}.linkary-sponsored-header + script + .linkary-promotion-hero,.linkary-sponsored-header + .linkary-promotion-hero{margin-top:-78px!important}}
</style>`;

export async function enhancePublicProfileWithPromotion(response: Response, request: Request, env: Env, username: string): Promise<Response> {
  if (!env.DB || !response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return response;
  const db = new Db(env.DB);
  let creative: LiveCreative | null = null;
  let featured: FeaturedHeader | null = null;
  try {
    creative = await liveCreativeByUsername(db, username);
    if (!creative) featured = await featuredHeaderByUsername(db, username);
  } catch { return response; }

  const base = trackingBase(request, env);
  if (creative) {
    const bannerHref = `${base}/p/${encodeURIComponent(creative.tracking_code)}?kind=banner`;
    const ctaHref = `${base}/p/${encodeURIComponent(creative.tracking_code)}?kind=cta`;
    const impressionEndpoint = `/api/public/promotion-impressions/${encodeURIComponent(creative.tracking_code)}`;
    const markup = `<section class="linkary-sponsored-header" data-linkary-sponsored="${escapeHtml(creative.auction_id)}" aria-label="Sponsored promotion"><a class="linkary-sponsored-banner" href="${escapeHtml(bannerHref)}" target="_blank" rel="sponsored noopener noreferrer"><img src="${escapeHtml(creative.banner_url)}" alt="Sponsored banner"></a><a class="linkary-sponsored-cta" href="${escapeHtml(ctaHref)}" target="_blank" rel="sponsored noopener noreferrer">${escapeHtml(ctaLabel(creative.cta_type))}</a><span class="linkary-sponsored-label">Sponsored</span></section><script>(function(){try{fetch(${JSON.stringify(impressionEndpoint)},{method:'POST',keepalive:true,credentials:'omit'}).catch(function(){});}catch(e){}})();</script>`;
    return injectHeader(response, markup, HEADER_STYLES);
  }

  if (!featured) return response;
  const bannerHref = `${base}/f/${encodeURIComponent(featured.tracking_code)}?kind=banner`;
  const ctaHref = `${base}/f/${encodeURIComponent(featured.tracking_code)}?kind=cta`;
  const impressionEndpoint = `/api/public/featured-header-impressions/${encodeURIComponent(featured.tracking_code)}`;
  const markup = `<section class="linkary-sponsored-header" data-linkary-featured="${escapeHtml(featured.id)}" aria-label="Featured project"><a class="linkary-sponsored-banner" href="${escapeHtml(bannerHref)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(featured.banner_url)}" alt="${escapeHtml(featured.project_name)} banner"></a><span class="linkary-featured-project">${escapeHtml(featured.project_name)}</span><a class="linkary-sponsored-cta" href="${escapeHtml(ctaHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(ctaLabel(featured.cta_type))}</a><span class="linkary-sponsored-label">Featured</span></section><script>(function(){try{fetch(${JSON.stringify(impressionEndpoint)},{method:'POST',keepalive:true,credentials:'omit'}).catch(function(){});}catch(e){}})();</script>`;
  return injectHeader(response, markup, HEADER_STYLES);
}

async function visitorHash(request: Request, env: Env): Promise<string | null> {
  const salt = env.TRACKING_HASH_SALT?.trim();
  if (!salt) return null;
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  if (!ip && !ua) return null;
  return sha256(`${salt}|${ip}|${ua}`);
}

export async function recordPromotionImpression(request: Request, env: Env, code: string): Promise<Response> {
  const db = new Db(requireDb(env));
  const creative = await liveCreativeByCode(db, code);
  if (!creative) return json({ ok: false }, { status: 404 });
  try {
    const timestamp = now();
    const hash = await visitorHash(request, env);
    await db.batch([
      db.statement(`INSERT INTO profile_promotion_events (id, auction_id, creative_id, profile_id, advertiser_user_id, event_type, occurred_at, visitor_hash, referrer, utm_source, utm_medium, utm_campaign) VALUES (?, ?, ?, ?, ?, 'impression', ?, ?, ?, 'linkary', 'sponsored_profile', ?)`, [id('pev'), creative.auction_id, creative.creative_id, creative.profile_id, creative.advertiser_user_id, timestamp, hash, request.headers.get('referer'), creative.auction_id]),
      db.statement(`UPDATE profile_promotion_creatives SET impressions_count = impressions_count + 1, updated_at = ? WHERE id = ?`, [timestamp, creative.creative_id]),
    ]);
  } catch {
    // Analytics must never make the public profile fail.
  }
  return json({ ok: true });
}

export async function redirectPromotionClick(request: Request, env: Env, code: string): Promise<Response> {
  const db = new Db(requireDb(env));
  const creative = await liveCreativeByCode(db, code);
  if (!creative) throw new HttpError(404, 'Promotion is unavailable', 'promotion_unavailable');
  const kind = new URL(request.url).searchParams.get('kind') === 'cta' ? 'cta_click' : 'banner_click';
  try {
    const timestamp = now();
    const hash = await visitorHash(request, env);
    await db.batch([
      db.statement(`INSERT INTO profile_promotion_events (id, auction_id, creative_id, profile_id, advertiser_user_id, event_type, occurred_at, visitor_hash, referrer, utm_source, utm_medium, utm_campaign) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'linkary', 'sponsored_profile', ?)`, [id('pev'), creative.auction_id, creative.creative_id, creative.profile_id, creative.advertiser_user_id, kind, timestamp, hash, request.headers.get('referer'), creative.auction_id]),
      db.statement(`UPDATE profile_promotion_creatives SET banner_clicks_count = banner_clicks_count + ?, cta_clicks_count = cta_clicks_count + ?, updated_at = ? WHERE id = ?`, [kind === 'banner_click' ? 1 : 0, kind === 'cta_click' ? 1 : 0, timestamp, creative.creative_id]),
    ]);
  } catch {
    // Redirect must remain available if analytics persistence is temporarily unavailable.
  }
  const destination = new URL(creative.destination_url);
  if (!destination.searchParams.has('utm_source')) destination.searchParams.set('utm_source', 'linkary');
  if (!destination.searchParams.has('utm_medium')) destination.searchParams.set('utm_medium', 'sponsored_profile');
  if (!destination.searchParams.has('utm_campaign')) destination.searchParams.set('utm_campaign', creative.auction_id);
  return Response.redirect(destination.toString(), 302);
}

export async function recordFeaturedHeaderImpression(_request: Request, env: Env, code: string): Promise<Response> {
  const db = new Db(requireDb(env));
  const featured = await featuredHeaderByCode(db, code);
  if (!featured) return json({ ok: false }, { status: 404 });
  try {
    await db.run(`UPDATE profile_featured_headers SET impressions_count = impressions_count + 1, updated_at = ? WHERE id = ?`, [now(), featured.id]);
  } catch {
    // Analytics must never make the public profile fail.
  }
  return json({ ok: true });
}

export async function redirectFeaturedHeaderClick(request: Request, env: Env, code: string): Promise<Response> {
  const db = new Db(requireDb(env));
  const featured = await featuredHeaderByCode(db, code);
  if (!featured) throw new HttpError(404, 'Featured header is unavailable', 'featured_header_unavailable');
  const isCta = new URL(request.url).searchParams.get('kind') === 'cta';
  try {
    await db.run(
      `UPDATE profile_featured_headers SET banner_clicks_count = banner_clicks_count + ?, cta_clicks_count = cta_clicks_count + ?, updated_at = ? WHERE id = ?`,
      [isCta ? 0 : 1, isCta ? 1 : 0, now(), featured.id],
    );
  } catch {
    // Redirect must remain available if analytics persistence is temporarily unavailable.
  }
  const destination = new URL(featured.destination_url);
  if (!destination.searchParams.has('utm_source')) destination.searchParams.set('utm_source', 'linkary');
  if (!destination.searchParams.has('utm_medium')) destination.searchParams.set('utm_medium', 'featured_profile');
  if (!destination.searchParams.has('utm_campaign')) destination.searchParams.set('utm_campaign', `featured_${featured.id}`);
  if (!destination.searchParams.has('utm_content')) destination.searchParams.set('utm_content', featured.project_name);
  return Response.redirect(destination.toString(), 302);
}
