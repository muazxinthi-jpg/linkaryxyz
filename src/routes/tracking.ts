import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { hmacSha256, randomToken } from '../security/crypto';
import { organizationMembership, requireOperationalProjectAccess } from './organizations';
import { getLinkaryUrls } from '../urls';

const id = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

export async function createTrackedLink(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ activityId?: string }>(request);
  if (!body.activityId) throw new HttpError(400, 'activityId is required', 'activity_required');

  const db = new Db(requireDb(env));
  const activity = await db.first<{ campaign_id: string; organization_id: string; destination_url: string | null }>(
    'SELECT a.campaign_id, c.organization_id, a.destination_url FROM campaign_activities a JOIN campaigns c ON c.id = a.campaign_id WHERE a.id = ?',
    [body.activityId],
  );
  if (!activity || !activity.destination_url) throw new HttpError(409, 'An activity destination URL is required', 'destination_required');
  await requireOperationalProjectAccess(db, auth.user.id, activity.organization_id, true);

  const code = randomToken(8);
  const linkId = id('tl');
  const timestamp = now();
  await db.run(
    "INSERT INTO tracked_links (id, organization_id, campaign_id, activity_id, code, destination_url, status, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)",
    [linkId, activity.organization_id, activity.campaign_id, body.activityId, code, activity.destination_url, auth.user.id, timestamp, timestamp],
  );

  const trackingBase = getLinkaryUrls(request, env).tracking;
  return json({ id: linkId, code, url: `${trackingBase}/r/${encodeURIComponent(code)}` }, { status: 201 });
}

export async function listTrackedLinks(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const campaignId = url.searchParams.get('campaignId');
  if (!campaignId) throw new HttpError(400, 'campaignId is required', 'campaign_required');

  const db = new Db(requireDb(env));
  const campaign = await db.first<{ organization_id: string }>('SELECT organization_id FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign || !(await organizationMembership(db, auth.user.id, campaign.organization_id))) {
    throw new HttpError(403, 'Tracking access denied', 'forbidden');
  }

  const status = url.searchParams.get('status')?.trim();
  if (status && !['active', 'paused', 'archived'].includes(status)) {
    throw new HttpError(400, 'Choose a valid tracking link status', 'invalid_tracking_status');
  }

  const params: unknown[] = [campaignId];
  let where = 't.campaign_id = ?';
  if (status) {
    where += ' AND t.status = ?';
    params.push(status);
  }

  const links = await db.all(
    `SELECT
       t.id,
       t.code,
       t.activity_id,
       a.title AS activity_title,
       a.activity_type,
       t.destination_url,
       t.status,
       t.created_at,
       t.updated_at,
       COUNT(c.id) AS clicks,
       MAX(c.occurred_at) AS last_click_at
     FROM tracked_links t
     LEFT JOIN campaign_activities a ON a.id = t.activity_id
     LEFT JOIN tracked_link_clicks c ON c.tracked_link_id = t.id
     WHERE ${where}
     GROUP BY t.id
     ORDER BY t.created_at DESC`,
    params,
  );

  const trackingBase = getLinkaryUrls(request, env).tracking;
  return json({
    links: links.map((row: any) => ({ ...row, url: `${trackingBase}/r/${encodeURIComponent(row.code)}` })),
  });
}

export async function updateTrackedLinkStatus(request: Request, env: Env, linkId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ status?: 'active' | 'paused' | 'archived' }>(request);
  if (!['active', 'paused', 'archived'].includes(body.status || '')) {
    throw new HttpError(400, 'Choose a valid tracking link status', 'invalid_tracking_status');
  }

  const db = new Db(requireDb(env));
  const link = await db.first<{ organization_id: string }>('SELECT organization_id FROM tracked_links WHERE id = ?', [linkId]);
  if (!link) throw new HttpError(404, 'Tracking link not found', 'tracking_not_found');
  await requireOperationalProjectAccess(db, auth.user.id, link.organization_id, true);

  const timestamp = now();
  await db.run('UPDATE tracked_links SET status = ?, updated_at = ? WHERE id = ?', [body.status, timestamp, linkId]);
  return json({ ok: true, status: body.status, updatedAt: timestamp });
}

export async function redirectTrackedLink(request: Request, env: Env, code: string): Promise<Response> {
  const db = new Db(requireDb(env));
  const link = await db.first<{ id: string; destination_url: string; status: string }>(
    'SELECT id, destination_url, status FROM tracked_links WHERE code = ?',
    [code],
  );
  if (!link || link.status !== 'active') throw new HttpError(404, 'Tracking link not found', 'tracking_not_found');

  const visitor = request.headers.get('cf-connecting-ip');
  const visitorHash = visitor && env.TRACKING_HASH_SALT ? await hmacSha256(env.TRACKING_HASH_SALT, visitor) : null;
  const referer = request.headers.get('referer');
  let referrerHost: string | null = null;
  try { if (referer) referrerHost = new URL(referer).hostname; } catch {}

  await db.run(
    'INSERT INTO tracked_link_clicks (id, tracked_link_id, visitor_id_hash, referrer_host, occurred_at) VALUES (?, ?, ?, ?, ?)',
    [id('tlc'), link.id, visitorHash, referrerHost, now()],
  );
  return Response.redirect(link.destination_url, 302);
}
