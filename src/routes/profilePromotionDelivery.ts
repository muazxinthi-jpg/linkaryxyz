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

function trackingBase(request: Request, env: Env): string {
  try { return new URL(env.TRACKING_BASE_URL || 'https://l.linkary.xyz').origin; }
  catch { return new URL(request.url).origin; }
}

export async function enhancePublicProfileWithPromotion(response: Response, request: Request, env: Env, username: string): Promise<Response> {
  if (!env.DB || !response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return response;
  const db = new Db(env.DB);
  let creative: LiveCreative | null = null;
  try { creative = await liveCreativeByUsername(db, username); } catch { return response; }
  if (!creative) return response;

  const base = trackingBase(request, env);
  const bannerHref = `${base}/p/${encodeURIComponent(creative.tracking_code)}?kind=banner`;
  const ctaHref = `${base}/p/${encodeURIComponent(creative.tracking_code)}?kind=cta`;
  const impressionEndpoint = `/api/public/promotion-impressions/${encodeURIComponent(creative.tracking_code)}`;
  const markup = `<section class="linkary-sponsored-header" data-linkary-sponsored="${escapeHtml(creative.auction_id)}" aria-label="Sponsored promotion"><a class="linkary-sponsored-banner" href="${escapeHtml(bannerHref)}" target="_blank" rel="sponsored noopener noreferrer"><img src="${escapeHtml(creative.banner_url)}" alt="Sponsored banner"></a><a class="linkary-sponsored-cta" href="${escapeHtml(ctaHref)}" target="_blank" rel="sponsored noopener noreferrer">${escapeHtml(ctaLabel(creative.cta_type))}</a><span class="linkary-sponsored-label">Sponsored</span></section><script>(function(){try{fetch(${JSON.stringify(impressionEndpoint)},{method:'POST',keepalive:true,credentials:'omit'}).catch(function(){});}catch(e){}})();</script>`;
  const styles = `<style id="linkary-sponsored-header-style">.linkary-sponsored-header{position:relative;width:min(1120px,calc(100% - 24px));margin:12px auto 44px;border-radius:24px;overflow:visible;isolation:isolate}.linkary-sponsored-banner{display:block;width:100%;height:clamp(150px,22vw,260px);border-radius:24px;overflow:hidden;background:#f2f2f2;box-shadow:0 14px 40px rgba(17,17,17,.12)}.linkary-sponsored-banner img{width:100%;height:100%;display:block;object-fit:cover}.linkary-sponsored-cta{position:absolute;left:50%;bottom:-22px;transform:translateX(-50%);z-index:3;display:inline-flex;align-items:center;justify-content:center;min-width:128px;height:44px;padding:0 22px;border-radius:999px;background:#ff5500;color:#fff!important;text-decoration:none!important;font:700 14px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 10px 26px rgba(255,85,0,.28);border:3px solid #fff}.linkary-sponsored-label{position:absolute;top:12px;right:12px;z-index:2;padding:5px 9px;border-radius:999px;background:rgba(17,17,17,.72);color:#fff;font:600 10px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.04em;text-transform:uppercase}@media(max-width:640px){.linkary-sponsored-header{width:calc(100% - 16px);margin-top:8px;border-radius:18px}.linkary-sponsored-banner{height:150px;border-radius:18px}.linkary-sponsored-cta{height:40px;bottom:-20px;min-width:112px}}</style>`;

  const html = await response.text();
  let enhanced = html.includes('</head>') ? html.replace('</head>', `${styles}</head>`) : `${styles}${html}`;
  const mainOpen = enhanced.match(/<main\b[^>]*>/i);
  if (mainOpen?.index !== undefined) {
    const at = mainOpen.index + mainOpen[0].length;
    enhanced = `${enhanced.slice(0, at)}${markup}${enhanced.slice(at)}`;
  } else if (enhanced.includes('<body>')) {
    enhanced = enhanced.replace('<body>', `<body>${markup}`);
  } else {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store');
  return new Response(enhanced, { status: response.status, statusText: response.statusText, headers });
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
