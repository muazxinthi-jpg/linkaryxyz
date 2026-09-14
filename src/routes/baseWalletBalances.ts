import type { Env } from '../env';

const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const BALANCE_OF_SELECTOR = '70a08231';
const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 200;

type CacheEntry = { expiresAt: number; value: BaseWalletBalances };
const cache = new Map<string, CacheEntry>();

export type BaseWalletBalances = {
  configured: boolean;
  address: string;
  ethAtomic: string;
  usdcAtomic: string;
  eth: string;
  usdc: string;
  updatedAt: string;
  message: string;
};

function validEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function parseHex(value: unknown): bigint {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) return BigInt(0);
  try { return BigInt(value); } catch { return BigInt(0); }
}

function formatUnits(value: bigint, decimals: number, maxFraction = 8): string {
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = value / scale;
  if (decimals === 0) return whole.toString();
  const fraction = (value % scale).toString().padStart(decimals, '0').slice(0, maxFraction).replace(/0+$/, '');
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

async function rpc<T>(apiKey: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(`https://base-mainnet.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error('base_rpc_unavailable');
  const payload = await response.json() as { result?: T; error?: unknown };
  if (payload.error || payload.result === undefined) throw new Error('base_rpc_unavailable');
  return payload.result;
}

function cached(address: string): BaseWalletBalances | null {
  const key = address.toLowerCase();
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function remember(address: string, value: BaseWalletBalances): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest) cache.delete(oldest);
  }
  cache.set(address.toLowerCase(), { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

export async function buildBaseWalletBalances(env: Env, address: string, forceRefresh = false): Promise<BaseWalletBalances> {
  const normalized = address.trim();
  if (!validEvmAddress(normalized)) {
    return { configured: Boolean(env.ALCHEMY_API_KEY?.trim()), address: normalized, ethAtomic: '0', usdcAtomic: '0', eth: '0', usdc: '0', updatedAt: new Date().toISOString(), message: 'No active Linkary Base wallet is available.' };
  }

  const apiKey = env.ALCHEMY_API_KEY?.trim();
  if (!apiKey) {
    return { configured: false, address: normalized, ethAtomic: '0', usdcAtomic: '0', eth: '0', usdc: '0', updatedAt: new Date().toISOString(), message: 'Base balances are temporarily unavailable.' };
  }

  if (!forceRefresh) {
    const hit = cached(normalized);
    if (hit) return hit;
  }

  const paddedAddress = normalized.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  try {
    const [ethHex, usdcHex] = await Promise.all([
      rpc<string>(apiKey, 'eth_getBalance', [normalized, 'latest']),
      rpc<string>(apiKey, 'eth_call', [{ to: BASE_USDC, data: `0x${BALANCE_OF_SELECTOR}${paddedAddress}` }, 'latest']),
    ]);
    const eth = parseHex(ethHex);
    const usdc = parseHex(usdcHex);
    const result: BaseWalletBalances = {
      configured: true,
      address: normalized,
      ethAtomic: eth.toString(),
      usdcAtomic: usdc.toString(),
      eth: formatUnits(eth, 18, 8),
      usdc: formatUnits(usdc, 6, 6),
      updatedAt: new Date().toISOString(),
      message: 'Live balances on Base. ETH pays network fees and USDC is used for Linkary payments.',
    };
    remember(normalized, result);
    return result;
  } catch {
    return { configured: true, address: normalized, ethAtomic: '0', usdcAtomic: '0', eth: '0', usdc: '0', updatedAt: new Date().toISOString(), message: 'Base balances could not be refreshed right now.' };
  }
}
