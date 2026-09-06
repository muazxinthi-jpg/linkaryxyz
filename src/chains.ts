export type BetaChainKey = 'ethereum' | 'base' | 'bnb' | 'solana' | 'robinhood';
export type ChainFamily = 'evm' | 'solana';
export type CapabilityState = 'active' | 'prepared' | 'unavailable';
export type NftDiscoveryState = 'active' | 'probe' | 'unavailable';

export type BetaChainCapability = {
  key: BetaChainKey;
  label: string;
  family: ChainFamily;
  rpc: CapabilityState;
  nftDiscovery: NftDiscoveryState;
  tokenData: CapabilityState;
  transferData: CapabilityState;
  priceData: CapabilityState;
  webhooks: CapabilityState;
  alchemyNftHost?: string;
  openSeaSlug?: string;
};

/**
 * Controlled Beta production chain registry.
 *
 * Alchemy services can be enabled at the account/app level without Linkary
 * automatically consuming them. Runtime calls stay explicit, bounded and
 * feature-scoped so the free-first Beta remains economical.
 */
export const BETA_CHAIN_CAPABILITIES: readonly BetaChainCapability[] = [
  {
    key: 'ethereum',
    label: 'Ethereum',
    family: 'evm',
    rpc: 'active',
    nftDiscovery: 'active',
    tokenData: 'prepared',
    transferData: 'prepared',
    priceData: 'prepared',
    webhooks: 'prepared',
    alchemyNftHost: 'eth-mainnet',
    openSeaSlug: 'ethereum',
  },
  {
    key: 'base',
    label: 'Base',
    family: 'evm',
    rpc: 'active',
    nftDiscovery: 'active',
    tokenData: 'prepared',
    transferData: 'prepared',
    priceData: 'prepared',
    webhooks: 'prepared',
    alchemyNftHost: 'base-mainnet',
    openSeaSlug: 'base',
  },
  {
    key: 'bnb',
    label: 'BNB Chain',
    family: 'evm',
    rpc: 'active',
    nftDiscovery: 'probe',
    tokenData: 'prepared',
    transferData: 'prepared',
    priceData: 'prepared',
    webhooks: 'prepared',
    alchemyNftHost: 'bnb-mainnet',
    openSeaSlug: 'bsc',
  },
  {
    key: 'solana',
    label: 'Solana',
    family: 'solana',
    rpc: 'active',
    nftDiscovery: 'active',
    tokenData: 'prepared',
    transferData: 'prepared',
    priceData: 'prepared',
    webhooks: 'prepared',
  },
  {
    key: 'robinhood',
    label: 'Robinhood',
    family: 'evm',
    rpc: 'active',
    nftDiscovery: 'unavailable',
    tokenData: 'prepared',
    transferData: 'prepared',
    priceData: 'prepared',
    webhooks: 'prepared',
  },
] as const;

export const BETA_CHAIN_KEYS = BETA_CHAIN_CAPABILITIES.map((chain) => chain.key) as BetaChainKey[];

export function betaChain(key: string | null | undefined): BetaChainCapability | undefined {
  if (!key) return undefined;
  return BETA_CHAIN_CAPABILITIES.find((chain) => chain.key === key);
}
