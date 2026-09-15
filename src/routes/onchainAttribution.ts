import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { ensureAttributionSchema } from '../db/attributionSchema';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { requireOperationalProjectAccess } from './organizations';

export type AttributionChain = 'ethereum' | 'base' | 'bnb' | 'solana' | 'robinhood';
export const ATTRIBUTION_CHAINS: readonly AttributionChain[] = ['ethereum', 'base', 'bnb', 'solana', 'robinhood'];
type StoredAttributionChain = AttributionChain | 'polygon';

const now = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;

const OUTCOME_TYPES = new Set([
  'signup',
  'telegram_join',
  'retained_user',
  'wallet_connect',
  'lead',
  'purchase',
  'deposit',
  'subscription',
  'token_purchase',
  'custom',
]);

type WatchTargetInput = {
  campaignId?: string;
  activityId?: string | null;
  trackedLinkId?: string | null;
  chain?: string;
  address?: string;
  label?: string | null;
};

type ReviewInput = {
  eventType?: string;
  valueUsd?: number | null;
};

type WebhookActivity = {
  hash?: unknown;
  transactionHash?: unknown;
  category?: unknown;
  asset?: unknown;
  value?: unknown;
  fromAddress?: unknown;
  toAddress?: unknown;
  from?: unknown;
  to?: unknown;
  source?: unknown;
  destination?: unknown;
  signature?: unknown;
  slot?: unknown;
  blockTime?: unknown;
  blockTimestamp?: unknown;
  timestamp?: unknown;
  blockNum?: unknown;
  typeTraceAddress?: unknown;
  removed?: unknown;
  log?: {
    blockNumber?: unknown;
    blockHash?: unknown;
    logIndex?: unknown;
    removed?: unknown;
  } | null;
  rawContract?: { value?: unknown } | null;
  [key: string]: unknown;
};

type AlchemyPayload = {
  webhookId?: unknown;
  id?: unknown;
  createdAt?: unknown;
  type?: unknown;
  event?: { activity?: unknown } | null;
  activity?: unknown;
  [key: string]: unknown;
};

type WatchTargetRow = {
  id: string;
  organization_id: string;
  campaign_id: string;
  activity_id: string | null;
  tracked_link_id: string | null;
  chain: StoredAttributionChain;
  address: string;
  label: string | null;
  status: 'active' | 'disabled';
  provider_sync_status: 'pending_config' | 'syncing' | 'active' | 'error' | 'disabled';
  provider_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

type EventRow = {
  id: string;
  watch_target_id: string;
  organization_id: string;
  campaign_id: string;
  activity_id: string | null;
  tracked_link_id: string | null;
  provider_event_id: string;
  provider_item_key: string;
  chain: StoredAttributionChain;
  watched_address: string;
  direction: 'inbound' | 'outbound' | 'self' | 'unknown';
  transaction_hash: string | null;
  block_number: string | null;
  block_hash: string | null;
  log_index: string | null;
  category: string | null;
  asset: string | null;
  value_text: string | null;
  from_address: string | null;
  to_address: string | null;
  evidence_confidence: 'verified';
  chain_status: 'confirmed' | 'reorged';
  review_status: 'pending' | 'confirmed' | 'ignored' | 'reorged';
  linked_conversion_id: string | null;
  reorged_at: string | null;
  reorg_provider_event_id: string | null;
  reorg_payload_json: string | null;
  provider_created_at: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
};

type AlchemyWebhookConfig = {
  webhookId?: string;
  signingKey?: string;
};

export function alchemyWebhookConfig(env: Env, chain: AttributionChain): AlchemyWebhookConfig {
  switch (chain) {
    case 'ethereum': return { webhookId: env.ALCHEMY_WEBHOOK_ID_ETHEREUM, signingKey: env.ALCHEMY_WEBHOOK_SIGNING_KEY_ETHEREUM };
    case 'base': return { webhookId: env.ALCHEMY_WEBHOOK_ID_BASE, signingKey: env.ALCHEMY_WEBHOOK_SIGNING_KEY_BASE };
    case 'bnb': return { webhookId: env.ALCHEMY_WEBHOOK_ID_BNB, signingKey: env.ALCHEMY_WEBHOOK_SIGNING_KEY_BNB };
    case 'solana': return { webhookId: env.ALCHEMY_WEBHOOK_ID_SOLANA, signingKey: env.ALCHEMY_WEBHOOK_SIGNING_KEY_SOLANA };
    case 'robinhood': return { webhookId: env.ALCHEMY_WEBHOOK_ID_ROBINHOOD, signingKey: env.ALCHEMY_WEBHOOK_SIGNING_KEY_ROBINHOOD };
  }
}

export function requireAttributionChain(value: string | null | undefined): AttributionChain {
  const chain = String(value || '').trim().toLowerCase();
  if (!ATTRIBUTION_CHAINS.includes(chain as AttributionChain)) throw new HttpError(400, 'Unsupported chain', 'unsupported_chain');
  return chain as AttributionChain;
}

const SOLANA_BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function isSolanaPublicKey(value: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  let decoded = 0n;
  for (const character of value) {
    const digit = SOLANA_BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return false;
    decoded = (decoded * 58n) + BigInt(digit);
  }
  const leadingZeroBytes = value.match(/^1*/)?.[0].length || 0;
  const decodedBytes = decoded === 0n ? 0 : Math.ceil(decoded.toString(16).length / 2);
  return leadingZeroBytes + decodedBytes === 32;
}

export function normalizeAttributionAddress(chain: AttributionChain, raw: string | null | undefined): string {
  const value = String(raw || '').trim();
  if (chain === 'solana') {
    if (!isSolanaPublicKey(value)) throw new HttpError(400, 'Invalid Solana address', 'invalid_wallet_address');
    return value;
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) throw new HttpError(400, 'Invalid EVM address', 'invalid_wallet_address');
  return value.toLowerCase();
}

function normalizeEventAddress(chain: AttributionChain, value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { return normalizeAttributionAddress(chain, value); }
  catch { return null; }
}

function activityAddress(item: WebhookActivity, side: 'from' | 'to'): unknown {
  if (side === 'from') return item.fromAddress ?? item.from ?? (item.source as { address?: unknown } | null)?.address ?? item.source;
  return item.toAddress ?? item.to ?? (item.destination as { address?: unknown } | null)?.address ?? item.destination;
}

export function normalizeAlchemyActivityAddresses(chain: AttributionChain, item: WebhookActivity) {
  return {
    from: normalizeEventAddress(chain, activityAddress(item, 'from')),
    to: normalizeEventAddress(chain, activityAddress(item, 'to')),
  };
}

function stringOrNull(value: unknown, max = 240): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

async function hmacHex(body: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function syncWebhookAddress(
  env: Env,
  chain: AttributionChain,
  address: string,
  mode: 'add' | 'remove',
): Promise<'active' | 'pending_config'> {
  const config = alchemyWebhookConfig(env, chain);
  if (!env.ALCHEMY_NOTIFY_AUTH_TOKEN || !config.webhookId || !config.signingKey) return 'pending_config';

  const response = await fetch('https://dashboard.alchemy.com/api/update-webhook-addresses', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-alchemy-token': env.ALCHEMY_NOTIFY_AUTH_TOKEN,
    },
    body: JSON.stringify({
      webhook_id: config.webhookId,
      addresses_to_add: mode === 'add' ? [address] : [],
      addresses_to_remove: mode === 'remove' ? [address] : [],
    }),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 240);
    throw new Error(`Alchemy Notify address sync failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }
  return 'active';
}

async function campaignAccess(db: Db, userId: string, campaignId: string, write: boolean) {
  await ensureAttributionSchema(db);
  const campaign = await db.first<{ organization_id: string }>('SELECT organization_id FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign) throw new HttpError(404, 'Campaign not found', 'campaign_not_found');
  await requireOperationalProjectAccess(db, userId, campaign.organization_id, write);
  return campaign;
}

async function validateContext(
  db: Db,
  campaignId: string,
  activityId: string | null,
  trackedLinkId: string | null,
) {
  if (activityId) {
    const activity = await db.first<{ campaign_id: string }>('SELECT campaign_id FROM campaign_activities WHERE id = ?', [activityId]);
    if (!activity || activity.campaign_id !== campaignId) throw new HttpError(400, 'Activity does not belong to campaign', 'invalid_activity_context');
  }
  if (trackedLinkId) {
    const link = await db.first<{ campaign_id: string | null; activity_id: string | null }>(
      'SELECT campaign_id, activity_id FROM tracked_links WHERE id = ?',
      [trackedLinkId],
    );
    if (!link || link.campaign_id !== campaignId) throw new HttpError(400, 'Tracking link does not belong to campaign', 'invalid_tracking_context');
    if (activityId && link.activity_id && link.activity_id !== activityId) {
      throw new HttpError(400, 'Tracking link belongs to a different activity', 'invalid_tracking_context');
    }
  }
}

export async function listOnchainWatchTargets(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const campaignId = new URL(request.url).searchParams.get('campaignId')?.trim();
  if (!campaignId) throw new HttpError(400, 'campaignId is required', 'campaign_required');
  const db = new Db(requireDb(env));
  await campaignAccess(db, auth.user.id, campaignId, false);
  const rows = await db.all<WatchTargetRow>(
    `SELECT id, organization_id, campaign_id, activity_id, tracked_link_id, chain, address, label,
            status, provider_sync_status, provider_sync_error, created_at, updated_at
       FROM onchain_watch_targets
      WHERE campaign_id = ?
      ORDER BY created_at DESC`,
    [campaignId],
  );
  return json({ watchTargets: rows });
}

export async function createOnchainWatchTarget(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const input = await readJson<WatchTargetInput>(request);
  const campaignId = String(input.campaignId || '').trim();
  if (!campaignId) throw new HttpError(400, 'campaignId is required', 'campaign_required');
  const chain = requireAttributionChain(input.chain);
  const address = normalizeAttributionAddress(chain, input.address);
  const activityId = input.activityId ? String(input.activityId).trim() : null;
  const trackedLinkId = input.trackedLinkId ? String(input.trackedLinkId).trim() : null;
  const label = input.label ? String(input.label).trim().slice(0, 120) : null;

  const db = new Db(requireDb(env));
  const campaign = await campaignAccess(db, auth.user.id, campaignId, true);
  await validateContext(db, campaignId, activityId, trackedLinkId);

  const config = alchemyWebhookConfig(env, chain);
  const providerReady = Boolean(env.ALCHEMY_NOTIFY_AUTH_TOKEN && config.webhookId && config.signingKey);
  const timestamp = now();
  const proposedId = makeId('owt');
  await db.run(
    `INSERT INTO onchain_watch_targets (
       id, organization_id, campaign_id, activity_id, tracked_link_id, chain, address, label,
       status, provider_sync_status, provider_sync_error, created_by_user_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?, ?)
     ON CONFLICT(organization_id, campaign_id, chain, address) DO UPDATE SET
       activity_id = excluded.activity_id,
       tracked_link_id = excluded.tracked_link_id,
       label = excluded.label,
       status = 'active',
       provider_sync_status = excluded.provider_sync_status,
       provider_sync_error = NULL,
       updated_at = excluded.updated_at`,
    [
      proposedId,
      campaign.organization_id,
      campaignId,
      activityId,
      trackedLinkId,
      chain,
      address,
      label,
      providerReady ? 'syncing' : 'pending_config',
      auth.user.id,
      timestamp,
      timestamp,
    ],
  );

  const target = await db.first<WatchTargetRow>(
    `SELECT id, organization_id, campaign_id, activity_id, tracked_link_id, chain, address, label,
            status, provider_sync_status, provider_sync_error, created_at, updated_at
       FROM onchain_watch_targets
      WHERE organization_id = ? AND campaign_id = ? AND chain = ? AND address = ?`,
    [campaign.organization_id, campaignId, chain, address],
  );
  if (!target) throw new HttpError(500, 'Watch target was not saved', 'watch_target_save_failed');

  if (providerReady) {
    try {
      await syncWebhookAddress(env, chain, address, 'add');
      await db.run(
        `UPDATE onchain_watch_targets
            SET provider_sync_status = 'active', provider_sync_error = NULL, updated_at = ?
          WHERE id = ?`,
        [now(), target.id],
      );
      target.provider_sync_status = 'active';
      target.provider_sync_error = null;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Alchemy Notify sync failed';
      await db.run(
        `UPDATE onchain_watch_targets
            SET provider_sync_status = 'error', provider_sync_error = ?, updated_at = ?
          WHERE id = ?`,
        [message, now(), target.id],
      );
      throw new HttpError(502, 'Onchain target saved, but provider sync failed', 'alchemy_sync_failed');
    }
  }

  return json({ watchTarget: target, providerConfigured: providerReady }, { status: 201 });
}

export async function disableOnchainWatchTarget(request: Request, env: Env, targetId: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const target = await db.first<WatchTargetRow>(
    `SELECT id, organization_id, campaign_id, activity_id, tracked_link_id, chain, address, label,
            status, provider_sync_status, provider_sync_error, created_at, updated_at
       FROM onchain_watch_targets WHERE id = ?`,
    [targetId],
  );
  if (!target) throw new HttpError(404, 'Watch target not found', 'watch_target_not_found');
  await requireOperationalProjectAccess(db, auth.user.id, target.organization_id, true);
  if (target.status === 'disabled') return json({ ok: true, alreadyDisabled: true });

  const other = await db.first<{ count: number }>(
    `SELECT COUNT(*) AS count
       FROM onchain_watch_targets
      WHERE chain = ? AND address = ? AND status = 'active' AND id <> ?`,
    [target.chain, target.address, target.id],
  );
  const config = target.chain === 'polygon' ? {} : alchemyWebhookConfig(env, target.chain);
  const providerReady = Boolean(env.ALCHEMY_NOTIFY_AUTH_TOKEN && config.webhookId && config.signingKey);

  if (target.chain !== 'polygon' && Number(other?.count || 0) === 0 && target.provider_sync_status === 'active') {
    if (!providerReady) throw new HttpError(503, 'Alchemy webhook configuration is unavailable', 'alchemy_not_configured');
    try {
      await syncWebhookAddress(env, target.chain, target.address, 'remove');
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Alchemy Notify sync failed';
      await db.run(
        `UPDATE onchain_watch_targets
            SET provider_sync_status = 'error', provider_sync_error = ?, updated_at = ?
          WHERE id = ?`,
        [message, now(), target.id],
      );
      throw new HttpError(502, 'Provider address removal failed', 'alchemy_sync_failed');
    }
  }

  await db.run(
    `UPDATE onchain_watch_targets
        SET status = 'disabled', provider_sync_status = 'disabled', provider_sync_error = NULL, updated_at = ?
      WHERE id = ?`,
    [now(), target.id],
  );
  return json({ ok: true });
}

export async function listOnchainAttributionEvents(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const campaignId = url.searchParams.get('campaignId')?.trim();
  if (!campaignId) throw new HttpError(400, 'campaignId is required', 'campaign_required');
  const status = url.searchParams.get('status')?.trim();
  if (status && !['pending', 'confirmed', 'ignored', 'reorged'].includes(status)) throw new HttpError(400, 'Invalid review status', 'invalid_review_status');
  const db = new Db(requireDb(env));
  await campaignAccess(db, auth.user.id, campaignId, false);
  const rows = await db.all<EventRow & { watch_label: string | null }>(
    `SELECT e.id, e.watch_target_id, e.organization_id, e.campaign_id, e.activity_id, e.tracked_link_id,
            e.provider_event_id, e.provider_item_key, e.chain, e.watched_address, e.direction,
            e.transaction_hash, e.block_number, e.block_hash, e.log_index,
            e.category, e.asset, e.value_text, e.from_address, e.to_address,
            e.evidence_confidence, e.chain_status, e.review_status, e.linked_conversion_id,
            e.reorged_at, e.reorg_provider_event_id, e.reorg_payload_json, e.provider_created_at,
            e.occurred_at, e.created_at, e.updated_at, w.label AS watch_label
       FROM onchain_attribution_events e
       JOIN onchain_watch_targets w ON w.id = e.watch_target_id
      WHERE e.campaign_id = ? ${status ? 'AND e.review_status = ?' : ''}
      ORDER BY e.occurred_at DESC
      LIMIT 250`,
    status ? [campaignId, status] : [campaignId],
  );
  return json({ events: rows });
}

export async function reviewOnchainAttributionEvent(
  request: Request,
  env: Env,
  eventId: string,
  action: 'confirm' | 'ignore',
): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const db = new Db(requireDb(env));
  const event = await db.first<EventRow>('SELECT * FROM onchain_attribution_events WHERE id = ?', [eventId]);
  if (!event) throw new HttpError(404, 'Onchain event not found', 'onchain_event_not_found');
  await requireOperationalProjectAccess(db, auth.user.id, event.organization_id, true);
  if (event.chain_status === 'reorged') throw new HttpError(409, 'Reorged events cannot be approved', 'event_reorged');

  if (action === 'ignore') {
    if (event.review_status === 'confirmed') throw new HttpError(409, 'Confirmed events cannot be ignored', 'event_already_confirmed');
    await db.run(
      `UPDATE onchain_attribution_events SET review_status = 'ignored', updated_at = ? WHERE id = ?`,
      [now(), event.id],
    );
    return json({ ok: true, reviewStatus: 'ignored' });
  }

  const input = await readJson<ReviewInput>(request);
  const eventType = String(input.eventType || '').trim().toLowerCase();
  if (!OUTCOME_TYPES.has(eventType)) throw new HttpError(400, 'Choose a valid outcome type', 'invalid_event_type');
  const valueUsd = input.valueUsd === null || input.valueUsd === undefined ? null : Number(input.valueUsd);
  if (valueUsd !== null && (!Number.isFinite(valueUsd) || valueUsd < 0)) throw new HttpError(400, 'valueUsd must be zero or greater', 'invalid_value');

  const externalKey = `alchemy:${event.provider_item_key}`;
  let conversion = await db.first<{ id: string }>(
    'SELECT id FROM conversion_events WHERE organization_id = ? AND external_event_key = ?',
    [event.organization_id, externalKey],
  );
  if (!conversion) {
    const conversionId = makeId('conv');
    await db.run(
      `INSERT INTO conversion_events (
         id, organization_id, campaign_id, activity_id, tracked_link_id,
         external_event_key, event_type, value_usd, source, attribution_confidence, occurred_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'provider_verified', 'verified', ?, ?)`,
      [
        conversionId,
        event.organization_id,
        event.campaign_id,
        event.activity_id,
        event.tracked_link_id,
        externalKey,
        eventType,
        valueUsd,
        event.occurred_at,
        now(),
      ],
    );
    conversion = { id: conversionId };
  }

  await db.run(
    `UPDATE onchain_attribution_events
        SET review_status = 'confirmed', linked_conversion_id = ?, updated_at = ?
      WHERE id = ?`,
    [conversion.id, now(), event.id],
  );
  return json({ ok: true, reviewStatus: 'confirmed', conversionId: conversion.id });
}

async function findTargetsByAddresses(db: Db, chain: AttributionChain, addresses: string[]): Promise<WatchTargetRow[]> {
  const unique = Array.from(new Set(addresses));
  const rows: WatchTargetRow[] = [];
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50);
    if (!batch.length) continue;
    const placeholders = batch.map(() => '?').join(', ');
    rows.push(...await db.all<WatchTargetRow>(
      `SELECT id, organization_id, campaign_id, activity_id, tracked_link_id, chain, address, label,
              status, provider_sync_status, provider_sync_error, created_at, updated_at
         FROM onchain_watch_targets
        WHERE chain = ? AND status = 'active' AND address IN (${placeholders})`,
      [chain, ...batch],
    ));
  }
  return rows;
}

export async function receiveAlchemyAddressActivityWebhook(
  request: Request,
  env: Env,
  chainValue: string,
): Promise<Response> {
  const chain = requireAttributionChain(chainValue);
  const config = alchemyWebhookConfig(env, chain);
  if (!config.webhookId || !config.signingKey) throw new HttpError(503, 'Alchemy webhook is not configured for this chain', 'alchemy_not_configured');

  const rawBody = await request.text();
  const receivedSignature = request.headers.get('x-alchemy-signature')?.trim().toLowerCase() || '';
  if (!receivedSignature || !/^[a-f0-9]{64}$/.test(receivedSignature)) throw new HttpError(401, 'Invalid webhook signature', 'invalid_webhook_signature');
  const expectedSignature = await hmacHex(rawBody, config.signingKey);
  if (!constantTimeEqual(receivedSignature, expectedSignature)) throw new HttpError(401, 'Invalid webhook signature', 'invalid_webhook_signature');

  let payload: AlchemyPayload;
  try { payload = JSON.parse(rawBody) as AlchemyPayload; }
  catch { throw new HttpError(400, 'Invalid webhook JSON', 'invalid_webhook_payload'); }

  if (payload.webhookId !== config.webhookId) throw new HttpError(403, 'Webhook ID does not match configured chain', 'webhook_id_mismatch');
  if (payload.type !== 'ADDRESS_ACTIVITY') throw new HttpError(400, 'Unsupported Alchemy webhook type', 'unsupported_webhook_type');
  const providerEventId = stringOrNull(payload.id, 160);
  if (!providerEventId) throw new HttpError(400, 'Alchemy event ID is required', 'missing_provider_event_id');

  const candidate = payload.event && Array.isArray(payload.event.activity) ? payload.event.activity : payload.activity;
  const activity = Array.isArray(candidate) ? candidate.filter((item): item is WebhookActivity => Boolean(item && typeof item === 'object')) : [];
  if (!activity.length) return json({ ok: true, matched: 0, activity: 0 });

  const addresses: string[] = [];
  for (const item of activity) {
    const { from, to } = normalizeAlchemyActivityAddresses(chain, item);
    if (from) addresses.push(from);
    if (to) addresses.push(to);
  }
  if (!addresses.length) return json({ ok: true, matched: 0, activity: activity.length });

  const db = new Db(requireDb(env));
  const targets = await findTargetsByAddresses(db, chain, addresses);
  const byAddress = new Map<string, WatchTargetRow[]>();
  for (const target of targets) {
    const list = byAddress.get(target.address) || [];
    list.push(target);
    byAddress.set(target.address, list);
  }

  let matched = 0;
  const providerCreatedAt = stringOrNull(payload.createdAt, 80);
  for (let index = 0; index < activity.length; index += 1) {
    const item = activity[index];
    const { from, to } = normalizeAlchemyActivityAddresses(chain, item);
    const matchedTargets = new Map<string, WatchTargetRow>();
    for (const address of [from, to]) {
      if (!address) continue;
      for (const target of byAddress.get(address) || []) matchedTargets.set(target.id, target);
    }
    if (!matchedTargets.size) continue;

    for (const target of matchedTargets.values()) {
      const fromMatch = from === target.address;
      const toMatch = to === target.address;
      const direction = fromMatch && toMatch ? 'self' : toMatch ? 'inbound' : fromMatch ? 'outbound' : 'unknown';
      const transactionHash = stringOrNull(item.hash ?? item.transactionHash ?? item.signature, 180);
      const blockNumber = stringOrNull(item.blockNum ?? item.log?.blockNumber ?? item.slot, 80);
      const blockHash = stringOrNull(item.log?.blockHash, 180);
      const logIndex = stringOrNull(item.log?.logIndex, 80);
      const traceAddress = stringOrNull(item.typeTraceAddress, 160);
      const identity = [transactionHash || providerEventId, blockHash, logIndex || traceAddress || stringOrNull(item.category, 80) || String(index)]
        .filter(Boolean)
        .join(':');
      const providerItemKey = `${chain}:${identity}:${target.id}`;
      const timestamp = now();
      const occurredAt = stringOrNull(item.blockTimestamp ?? item.timestamp ?? item.blockTime, 80) || providerCreatedAt || timestamp;
      const category = stringOrNull(item.category, 80);
      const asset = stringOrNull(item.asset, 120);
      const valueText = stringOrNull(item.value ?? item.rawContract?.value, 160);
      const removed = item.removed === true || item.log?.removed === true;

      if (removed) {
        const existing = await db.first<{ id: string; linked_conversion_id: string | null }>(
          'SELECT id, linked_conversion_id FROM onchain_attribution_events WHERE provider_item_key = ?',
          [providerItemKey],
        );
        if (existing) {
          const statements = [db.statement(
            `UPDATE onchain_attribution_events
                SET chain_status = 'reorged', review_status = 'reorged', linked_conversion_id = NULL,
                    reorged_at = ?, reorg_provider_event_id = ?, reorg_payload_json = ?, updated_at = ?
              WHERE id = ?`,
            [timestamp, providerEventId, JSON.stringify(item).slice(0, 12000), timestamp, existing.id],
          )];
          if (existing.linked_conversion_id) {
            statements.push(db.statement(
              `DELETE FROM conversion_events
                WHERE id = ? AND source = 'provider_verified' AND external_event_key = ?`,
              [existing.linked_conversion_id, `alchemy:${providerItemKey}`],
            ));
          }
          await db.batch(statements);
          matched += 1;
          continue;
        }
      }

      await db.run(
        `INSERT OR IGNORE INTO onchain_attribution_events (
           id, watch_target_id, organization_id, campaign_id, activity_id, tracked_link_id,
           provider, provider_event_id, provider_item_key, chain, watched_address, direction,
           transaction_hash, block_number, block_hash, log_index, category, asset, value_text, from_address, to_address,
           evidence_confidence, chain_status, review_status, linked_conversion_id, reorged_at, provider_created_at,
           occurred_at, raw_payload_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'alchemy', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        [
          makeId('oce'),
          target.id,
          target.organization_id,
          target.campaign_id,
          target.activity_id,
          target.tracked_link_id,
          providerEventId,
          providerItemKey,
          chain,
          target.address,
          direction,
          transactionHash,
          blockNumber,
          blockHash,
          logIndex,
          category,
          asset,
          valueText,
          from,
          to,
          removed ? 'reorged' : 'confirmed',
          removed ? 'reorged' : 'pending',
          removed ? timestamp : null,
          providerCreatedAt,
          occurredAt,
          JSON.stringify(item).slice(0, 12000),
          timestamp,
          timestamp,
        ],
      );
      matched += 1;
    }
  }

  return json({ ok: true, matched, activity: activity.length });
}
