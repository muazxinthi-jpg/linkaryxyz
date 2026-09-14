import type { Env } from '../env';
import { requireDb, ServiceConfigurationError } from '../env';
import { Db } from '../db/client';
import { requireAuth } from '../auth/session';
import { HttpError, json } from '../http';

// Official native USDC contract on Base. Never infer USDC from a token symbol.
export const BASE_USDC_CONTRACT = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const BALANCE_OF_SELECTOR = '70a08231';
const BASE_BALANCE_TTL_MS = 45_000;
const balanceCache = new Map<string, { expiresAt: number; value: BaseWalletBalances }>();

export type BaseWalletBalances = {
  walletAddress: string;
  ethWei: string;
  usdcAtomic: string;
  gasPriceWei: string | null;
  estimatedUsdcTransferFeeWei: string | null;
  updatedAt: string;
};

function validAddress(address: string): boolean { return /^0x[a-fA-F0-9]{40}$/.test(address); }
function hex(value: unknown): bigint {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) throw new HttpError(502, 'Base balance data is temporarily unavailable', 'base_balance_unavailable');
  return BigInt(value);
}

async function rpc<T>(env: Env, method: string, params: unknown[]): Promise<T> {
  const key = env.ALCHEMY_API_KEY?.trim();
  if (!key) throw new ServiceConfigurationError('Alchemy API key is not configured');
  const response = await fetch(`https://base-mainnet.g.alchemy.com/v2/${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const payload = await response.json().catch(() => ({})) as { result?: T; error?: unknown };
  if (!response.ok || payload.error || payload.result === undefined) throw new HttpError(502, 'Base balance data is temporarily unavailable', 'base_balance_unavailable');
  return payload.result;
}

export async function baseWalletBalances(env: Env, address: string, forceRefresh = false): Promise<BaseWalletBalances> {
  if (!validAddress(address)) throw new HttpError(400, 'A valid Linkary EVM wallet is required', 'wallet_address_invalid');
  const key = address.toLowerCase();
  const cached = balanceCache.get(key);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;
  const balanceOf = `0x${BALANCE_OF_SELECTOR}${key.slice(2).padStart(64, '0')}`;
  const [eth, usdc] = await Promise.all([
    rpc<string>(env, 'eth_getBalance', [address, 'latest']),
    rpc<string>(env, 'eth_call', [{ to: BASE_USDC_CONTRACT, data: balanceOf }, 'latest']),
  ]);
  // A transient gas-price quote failure must not hide the actual asset balances.
  const gasPriceWei = await rpc<string>(env, 'eth_gasPrice', []).then(hex).catch(() => null);
  const value: BaseWalletBalances = {
    walletAddress: address,
    ethWei: hex(eth).toString(),
    usdcAtomic: hex(usdc).toString(),
    gasPriceWei: gasPriceWei?.toString() || null,
    // A conservative ERC-20 transfer estimate; final gas is paid by the EOA on Base.
    estimatedUsdcTransferFeeWei: gasPriceWei ? (gasPriceWei * BigInt(65_000)).toString() : null,
    updatedAt: new Date().toISOString(),
  };
  if (balanceCache.size >= 120) balanceCache.delete(balanceCache.keys().next().value as string);
  balanceCache.set(key, { expiresAt: Date.now() + BASE_BALANCE_TTL_MS, value });
  return value;
}

export async function primaryBaseWalletBalances(env: Env, userId: string, forceRefresh = false): Promise<BaseWalletBalances> {
  const db = new Db(requireDb(env));
  const wallet = await db.first<{ address: string }>(`SELECT address FROM wallet_accounts WHERE user_id = ? AND provider = 'coinbase_cdp' AND chain_family = 'evm' AND status = 'active' ORDER BY is_primary DESC, created_at ASC LIMIT 1`, [userId]);
  if (!wallet) throw new HttpError(409, 'No active Linkary Base wallet is available', 'wallet_missing');
  return baseWalletBalances(env, wallet.address, forceRefresh);
}

export async function getMyBaseWalletBalances(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const force = new URL(request.url).searchParams.get('refresh') === '1';
  return json({ balances: await primaryBaseWalletBalances(env, auth.user.id, force) });
}
