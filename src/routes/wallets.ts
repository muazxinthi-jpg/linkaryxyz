import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership } from './organizations';

const id = () => `pwd_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

type ChainFamily = 'evm' | 'solana';

async function ensureSchema(db: Db): Promise<void> {
  await db.run(`CREATE TABLE IF NOT EXISTS profile_wallet_destinations (
    id TEXT PRIMARY KEY NOT NULL,
    profile_id TEXT NOT NULL REFERENCES profiles(id),
    chain_family TEXT NOT NULL CHECK (chain_family IN ('evm', 'solana')),
    address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_by_user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(profile_id, chain_family)
  )`);
  await db.run('CREATE INDEX IF NOT EXISTS idx_profile_wallet_destinations_profile ON profile_wallet_destinations(profile_id, status)');
}

async function editableProfile(db: Db, userId: string, profileId: string) {
  const profile = await db.first<{ id: string; profile_type: string; owner_user_id: string | null; organization_id: string | null }>(
    'SELECT id, profile_type, owner_user_id, organization_id FROM profiles WHERE id = ?',
    [profileId],
  );
  if (!profile) throw new HttpError(404, 'Profile not found', 'profile_not_found');
  if (profile.profile_type === 'creator') {
    if (profile.owner_user_id !== userId) throw new HttpError(403, 'Wallet access denied', 'forbidden');
    return profile;
  }
  if (!profile.organization_id) throw new HttpError(403, 'Wallet access denied', 'forbidden');
  const membership = await organizationMembership(db, userId, profile.organization_id);
  if (!membership || !['owner', 'admin', 'marketing_manager'].includes(membership.role)) throw new HttpError(403, 'Wallet access denied', 'forbidden');
  return profile;
}

function validateAddress(chainFamily: ChainFamily, raw: string): string {
  const address = raw.trim();
  if (chainFamily === 'evm') {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new HttpError(400, 'Enter a valid EVM wallet address', 'invalid_evm_address');
    return address;
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) throw new HttpError(400, 'Enter a valid Solana wallet address', 'invalid_solana_address');
  return address;
}

export async function listProfileWalletDestinations(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const profileId = new URL(request.url).searchParams.get('profileId');
  if (!profileId) throw new HttpError(400, 'profileId is required', 'profile_required');
  const db = new Db(requireDb(env));
  await editableProfile(db, auth.user.id, profileId);
  await ensureSchema(db);
  const destinations = await db.all<{ id: string; chain_family: ChainFamily; address: string; status: string; created_at: string; updated_at: string }>(
    `SELECT id, chain_family, address, status, created_at, updated_at
       FROM profile_wallet_destinations
      WHERE profile_id = ? AND status = 'active'
      ORDER BY chain_family ASC`,
    [profileId],
  );
  const embeddedWallets = await db.all<{ chain_family: string; address: string; account_type: string; is_primary: number }>(
    `SELECT chain_family, address, account_type, is_primary
       FROM wallet_accounts
      WHERE user_id = ? AND provider = 'coinbase_cdp' AND status = 'active'
      ORDER BY is_primary DESC, created_at ASC`,
    [auth.user.id],
  );
  return json({ destinations, embeddedWallets });
}

export async function saveProfileWalletDestination(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  await verifyCsrf(request, env, auth);
  const body = await readJson<{ profileId?: string; chainFamily?: ChainFamily; address?: string | null; action?: 'save' | 'remove' }>(request);
  if (!body.profileId || !['evm', 'solana'].includes(body.chainFamily || '')) throw new HttpError(400, 'Profile and chain are required', 'invalid_wallet_destination');
  const chainFamily = body.chainFamily as ChainFamily;
  const db = new Db(requireDb(env));
  await editableProfile(db, auth.user.id, body.profileId);
  await ensureSchema(db);
  const timestamp = now();

  if (body.action === 'remove' || !body.address?.trim()) {
    await db.run(`UPDATE profile_wallet_destinations SET status = 'disabled', updated_at = ? WHERE profile_id = ? AND chain_family = ?`, [timestamp, body.profileId, chainFamily]);
    return json({ ok: true, removed: true, chainFamily });
  }

  const address = validateAddress(chainFamily, body.address);
  await db.run(
    `INSERT INTO profile_wallet_destinations (id, profile_id, chain_family, address, status, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
     ON CONFLICT(profile_id, chain_family) DO UPDATE SET address = excluded.address, status = 'active', updated_at = excluded.updated_at`,
    [id(), body.profileId, chainFamily, address, auth.user.id, timestamp, timestamp],
  );
  return json({ ok: true, chainFamily, address });
}
