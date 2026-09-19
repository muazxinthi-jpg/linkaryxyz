import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { buildWalletPortfolio } from './walletPortfolio';

const SETTING_KEY = 'public_homepage_wallet_value';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

type Destination = { chain_family: string; address: string };
type SettingRow = { value_json: string };
type StoredSnapshot = {
  version: 1 | 2;
  lastAttemptAt: number;
  snapshot: {
    connectedValueUsd: number | null;
    partial: boolean;
    updatedAt: string;
  } | null;
};

function parseStored(value: string | null | undefined): StoredSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredSnapshot>;
    if ((parsed.version !== 1 && parsed.version !== 2) || !Number.isFinite(parsed.lastAttemptAt)) return null;
    const snapshot = parsed.snapshot;
    if (snapshot !== null && snapshot !== undefined) {
      if (
        (snapshot.connectedValueUsd !== null &&
          (typeof snapshot.connectedValueUsd !== 'number' || !Number.isFinite(snapshot.connectedValueUsd))) ||
        typeof snapshot.partial !== 'boolean' ||
        typeof snapshot.updatedAt !== 'string'
      ) return null;
    }
    return { version: parsed.version, lastAttemptAt: Number(parsed.lastAttemptAt), snapshot: snapshot || null };
  } catch {
    return null;
  }
}

export async function getPublicHomepageWalletValue(env: Env) {
  try {
    const db = new Db(requireDb(env));
    const row = await db.first<SettingRow>(
      'SELECT value_json FROM admin_settings WHERE setting_key = ?',
      [SETTING_KEY],
    );
    return parseStored(row?.value_json)?.snapshot || null;
  } catch {
    return null;
  }
}

/**
 * Refreshes the homepage's public aggregate no more than once per 24 hours.
 * Only the aggregate and its timestamp are persisted; addresses and holdings
 * are used transiently for the Alchemy request and never enter the public API.
 */
export async function refreshPublicHomepageWalletValue(env: Env): Promise<void> {
  try {
    const db = new Db(requireDb(env));
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const cutoff = now - REFRESH_INTERVAL_MS;
    const claim = await db.first<SettingRow>(
      "INSERT INTO admin_settings (setting_key, value_json, updated_at) " +
      "VALUES (?, ?, ?) " +
      "ON CONFLICT(setting_key) DO UPDATE SET " +
      "value_json = json_set(admin_settings.value_json, '$.version', 2, '$.lastAttemptAt', CAST(json_extract(excluded.value_json, '$.lastAttemptAt') AS INTEGER)), " +
      "updated_at = excluded.updated_at " +
      "WHERE COALESCE(CAST(json_extract(admin_settings.value_json, '$.version') AS INTEGER), 0) < 2 OR COALESCE(CAST(json_extract(admin_settings.value_json, '$.lastAttemptAt') AS INTEGER), 0) <= ? " +
      "RETURNING value_json",
      [SETTING_KEY, JSON.stringify({ version: 2, lastAttemptAt: now, snapshot: null }), nowIso, cutoff],
    );
    if (!claim) return;

    const wallets = await db.all<Destination>(
      "SELECT w.chain_family, w.address FROM profile_wallet_destinations w JOIN profiles p ON p.id = w.profile_id WHERE w.status = 'active' AND p.visibility <> 'archived' " +
      "UNION SELECT wa.chain_family, wa.address FROM wallet_accounts wa WHERE wa.status = 'active' AND EXISTS (SELECT 1 FROM profiles p WHERE p.owner_user_id = wa.user_id AND p.visibility <> 'archived')",
    );

    let snapshot: StoredSnapshot['snapshot'];
    if (!wallets.length) {
      snapshot = { connectedValueUsd: 0, partial: false, updatedAt: nowIso };
    } else {
      const portfolio = await buildWalletPortfolio(env, [], wallets, true);
      snapshot = {
        connectedValueUsd: portfolio.pricedAssetCount > 0 ? portfolio.totalUsd : null,
        partial: portfolio.partial,
        updatedAt: portfolio.updatedAt,
      };
    }

    await db.run(
      'UPDATE admin_settings SET value_json = ?, updated_at = ? WHERE setting_key = ?',
      [JSON.stringify({ version: 2, lastAttemptAt: now, snapshot }), nowIso, SETTING_KEY],
    );
  } catch {
    // Optional homepage enrichment must not interfere with the promotion
    // scheduler, and provider/database errors must not expose wallet data.
  }
}
