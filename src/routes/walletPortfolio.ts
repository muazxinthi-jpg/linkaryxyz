import type { Env } from '../env';

type WalletLike = { chain_family: string; address: string };
type AlchemyPrice = { currency?: unknown; value?: unknown; lastUpdatedAt?: unknown };
type AlchemyMetadata = { decimals?: unknown; logo?: unknown; name?: unknown; symbol?: unknown };
type AlchemyToken = {
  address?: unknown;
  network?: unknown;
  tokenAddress?: unknown;
  tokenBalance?: unknown;
  tokenMetadata?: AlchemyMetadata | null;
  tokenPrices?: AlchemyPrice[] | null;
  error?: unknown;
};
type AlchemyPortfolioResponse = {
  data?: { tokens?: AlchemyToken[] };
  error?: { partialErrors?: unknown[] };
};

export type PortfolioAsset = {
  symbol: string;
  name: string;
  amount: number | null;
  usdValue: number;
  share: number;
  logoUrl: string | null;
  networks: string[];
  isOther?: boolean;
};

export type WalletPortfolioSummary = {
  configured: boolean;
  totalUsd: number;
  assets: PortfolioAsset[];
  pricedAssetCount: number;
  walletCount: number;
  partial: boolean;
  updatedAt: string;
  message: string;
};

type CacheEntry = { expiresAt: number; value: WalletPortfolioSummary };
const PORTFOLIO_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 120;
const portfolioCache = new Map<string, CacheEntry>();

const EVM_NETWORKS = ['eth-mainnet', 'base-mainnet', 'bnb-mainnet', 'robinhood-mainnet'] as const;
const SOLANA_NETWORKS = ['sol-mainnet'] as const;
const NETWORK_LABELS: Record<string, string> = {
  'eth-mainnet': 'Ethereum',
  'base-mainnet': 'Base',
  'bnb-mainnet': 'BNB Chain',
  'robinhood-mainnet': 'Robinhood',
  'sol-mainnet': 'Solana',
};

function validEvm(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function validSolana(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeLogo(value: unknown): string | null {
  const raw = safeText(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function rawBalance(value: unknown): bigint | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (!/^(?:0x[0-9a-fA-F]+|\d+)$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

function decimalAmount(balance: bigint, decimals: number): number | null {
  if (balance <= BigInt(0)) return null;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  if (decimals === 0) {
    const numeric = Number(balance.toString());
    return Number.isFinite(numeric) ? numeric : null;
  }
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = balance / scale;
  const fraction = (balance % scale).toString().padStart(decimals, '0').slice(0, 12).replace(/0+$/, '');
  const numeric = Number(fraction ? `${whole.toString()}.${fraction}` : whole.toString());
  return Number.isFinite(numeric) ? numeric : null;
}

function usdPrice(prices: AlchemyPrice[] | null | undefined): number | null {
  if (!Array.isArray(prices)) return null;
  const match = prices.find((price) => safeText(price.currency).toLowerCase() === 'usd');
  const numeric = Number(safeText(match?.value));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeAmount(value: number): number {
  if (value >= 1_000_000) return Math.round(value * 100) / 100;
  return Number(value.toPrecision(10));
}

function collectWallets(embeddedWallets: WalletLike[], destinations: WalletLike[]) {
  const evm = new Map<string, string>();
  const solana = new Map<string, string>();
  for (const wallet of [...embeddedWallets, ...destinations]) {
    const address = safeText(wallet.address);
    if (!address) continue;
    if (wallet.chain_family === 'evm' && validEvm(address)) evm.set(address.toLowerCase(), address);
    if (wallet.chain_family === 'solana' && validSolana(address)) solana.set(address, address);
  }
  return { evm: Array.from(evm.values()), solana: Array.from(solana.values()) };
}

function cacheKey(evm: string[], solana: string[]): string {
  return [...evm.map((address) => `e:${address.toLowerCase()}`), ...solana.map((address) => `s:${address}`)].sort().join('|');
}

function readCache(key: string): WalletPortfolioSummary | null {
  const entry = portfolioCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    portfolioCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key: string, value: WalletPortfolioSummary): void {
  if (portfolioCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = portfolioCache.keys().next().value as string | undefined;
    if (oldest) portfolioCache.delete(oldest);
  }
  portfolioCache.set(key, { expiresAt: Date.now() + PORTFOLIO_TTL_MS, value });
}

function emptySummary(configured: boolean, walletCount: number, message: string): WalletPortfolioSummary {
  return {
    configured,
    totalUsd: 0,
    assets: [],
    pricedAssetCount: 0,
    walletCount,
    partial: false,
    updatedAt: new Date().toISOString(),
    message,
  };
}

export async function buildWalletPortfolio(
  env: Env,
  embeddedWallets: WalletLike[],
  destinations: WalletLike[],
  forceRefresh = false,
): Promise<WalletPortfolioSummary> {
  const apiKey = env.ALCHEMY_API_KEY?.trim();
  const wallets = collectWallets(embeddedWallets, destinations);
  const walletCount = wallets.evm.length + wallets.solana.length;
  if (!walletCount) return emptySummary(Boolean(apiKey), 0, 'No wallet is available to value yet.');
  if (!apiKey) return emptySummary(false, walletCount, 'Portfolio value is temporarily unavailable because market data is not configured.');

  const key = cacheKey(wallets.evm, wallets.solana);
  if (!forceRefresh) {
    const cached = readCache(key);
    if (cached) return cached;
  }

  const addresses = [
    ...wallets.evm.map((address) => ({ address, networks: [...EVM_NETWORKS] })),
    ...wallets.solana.map((address) => ({ address, networks: [...SOLANA_NETWORKS] })),
  ];

  let payload: AlchemyPortfolioResponse;
  try {
    const response = await fetch(`https://api.g.alchemy.com/data/v1/${encodeURIComponent(apiKey)}/assets/tokens/by-address`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        addresses,
        withMetadata: true,
        withPrices: true,
        includeNativeTokens: true,
        includeErc20Tokens: true,
        includeBlockMetadata: false,
      }),
    });
    if (!response.ok) {
      const unavailable = emptySummary(true, walletCount, 'Portfolio pricing is temporarily unavailable. Your wallet settings are unaffected.');
      unavailable.partial = true;
      return unavailable;
    }
    payload = await response.json() as AlchemyPortfolioResponse;
  } catch {
    const unavailable = emptySummary(true, walletCount, 'Portfolio pricing is temporarily unavailable. Your wallet settings are unaffected.');
    unavailable.partial = true;
    return unavailable;
  }

  type Aggregate = { symbol: string; name: string; amount: number; usdValue: number; logoUrl: string | null; networks: Set<string> };
  const aggregates = new Map<string, Aggregate>();

  for (const token of payload.data?.tokens || []) {
    const metadata = token.tokenMetadata || {};
    const symbol = safeText(metadata.symbol).toUpperCase();
    const name = safeText(metadata.name) || symbol;
    const decimals = typeof metadata.decimals === 'number' ? metadata.decimals : Number(metadata.decimals);
    const balance = rawBalance(token.tokenBalance);
    const price = usdPrice(token.tokenPrices);
    if (!symbol || !name || balance === null || price === null || !Number.isInteger(decimals)) continue;
    const amount = decimalAmount(balance, decimals);
    if (amount === null || amount <= 0) continue;
    const usdValue = amount * price;
    if (!Number.isFinite(usdValue) || usdValue < 0.005) continue;

    const identity = `${symbol}\u0000${name.toLowerCase()}`;
    const network = NETWORK_LABELS[safeText(token.network)] || safeText(token.network) || 'Supported network';
    const current = aggregates.get(identity);
    if (current) {
      current.amount += amount;
      current.usdValue += usdValue;
      current.networks.add(network);
      if (!current.logoUrl) current.logoUrl = safeLogo(metadata.logo);
    } else {
      aggregates.set(identity, {
        symbol,
        name,
        amount,
        usdValue,
        logoUrl: safeLogo(metadata.logo),
        networks: new Set([network]),
      });
    }
  }

  const all = Array.from(aggregates.values()).filter((asset) => asset.usdValue >= 0.005).sort((a, b) => b.usdValue - a.usdValue);
  const totalUsdRaw = all.reduce((sum, asset) => sum + asset.usdValue, 0);
  const top = all.slice(0, 6);
  const rest = all.slice(6);
  const visible: PortfolioAsset[] = top.map((asset) => ({
    symbol: asset.symbol,
    name: asset.name,
    amount: normalizeAmount(asset.amount),
    usdValue: normalizeMoney(asset.usdValue),
    share: totalUsdRaw > 0 ? Number(((asset.usdValue / totalUsdRaw) * 100).toFixed(2)) : 0,
    logoUrl: asset.logoUrl,
    networks: Array.from(asset.networks).sort(),
  }));
  const otherValue = rest.reduce((sum, asset) => sum + asset.usdValue, 0);
  if (otherValue >= 0.005) {
    visible.push({
      symbol: 'OTHER',
      name: `${rest.length} other priced asset${rest.length === 1 ? '' : 's'}`,
      amount: null,
      usdValue: normalizeMoney(otherValue),
      share: totalUsdRaw > 0 ? Number(((otherValue / totalUsdRaw) * 100).toFixed(2)) : 0,
      logoUrl: null,
      networks: Array.from(new Set(rest.flatMap((asset) => Array.from(asset.networks)))).sort(),
      isOther: true,
    });
  }

  const partial = Array.isArray(payload.error?.partialErrors) && payload.error!.partialErrors!.length > 0;
  const summary: WalletPortfolioSummary = {
    configured: true,
    totalUsd: normalizeMoney(totalUsdRaw),
    assets: visible,
    pricedAssetCount: all.length,
    walletCount,
    partial,
    updatedAt: new Date().toISOString(),
    message: all.length
      ? partial
        ? 'Available priced assets are shown. One or more networks could not be fully loaded.'
        : 'Estimated from priced assets across your Linkary wallet and saved wallet destinations.'
      : partial
        ? 'No priced balance could be confirmed while one or more networks were unavailable.'
        : 'No non-zero assets with available USD pricing were found.',
  };
  writeCache(key, summary);
  return summary;
}
