import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership } from './organizations';

const id = () => `pwd_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();

type ChainFamily = 'evm' | 'solana';
type WalletRow = { chain_family: string; address: string; account_type?: string; is_primary?: number };
type OwnedNft = {
  id: string;
  name: string;
  collection: string;
  imageUrl: string;
  externalUrl: string;
  chain: string;
  ownerAddress: string;
  contractAddress: string | null;
  tokenId: string | null;
};

const EVM_NFT_NETWORKS = [
  { chain: 'Ethereum', host: 'eth-mainnet', openSea: 'ethereum' },
  { chain: 'Base', host: 'base-mainnet', openSea: 'base' },
  { chain: 'Arbitrum', host: 'arb-mainnet', openSea: 'arbitrum' },
  { chain: 'BNB Chain', host: 'bnb-mainnet', openSea: 'bsc' },
] as const;

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

function gatewayUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (raw.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${raw.slice(7).replace(/^ipfs\//, '')}`;
  if (raw.startsWith('ar://')) return `https://arweave.net/${raw.slice(5)}`;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function firstUrl(...values: unknown[]): string | null {
  for (const value of values) {
    const url = gatewayUrl(value);
    if (url) return url;
  }
  return null;
}

function evmNftExternalUrl(chainSlug: string, contractAddress: string | null, tokenId: string | null, fallback: string): string {
  if (contractAddress && tokenId) return `https://opensea.io/assets/${chainSlug}/${contractAddress}/${tokenId}`;
  return fallback;
}

async function fetchEvmNfts(apiKey: string, ownerAddress: string): Promise<OwnedNft[]> {
  const batches = await Promise.all(EVM_NFT_NETWORKS.map(async (network) => {
    try {
      const endpoint = new URL(`https://${network.host}.g.alchemy.com/nft/v3/${encodeURIComponent(apiKey)}/getNFTsForOwner`);
      endpoint.searchParams.set('owner', ownerAddress);
      endpoint.searchParams.set('withMetadata', 'true');
      endpoint.searchParams.set('pageSize', '20');
      const response = await fetch(endpoint.toString(), { headers: { accept: 'application/json' } });
      if (!response.ok) return [] as OwnedNft[];
      const payload = await response.json() as { ownedNfts?: Array<Record<string, unknown>> };
      return (payload.ownedNfts || []).map((raw) => {
        const image = (raw.image || {}) as Record<string, unknown>;
        const contract = (raw.contract || {}) as Record<string, unknown>;
        const openSea = (contract.openSeaMetadata || contract.openSea || {}) as Record<string, unknown>;
        const rawMetadata = (raw.raw || {}) as Record<string, unknown>;
        const metadata = (rawMetadata.metadata || {}) as Record<string, unknown>;
        const contractAddress = typeof contract.address === 'string' ? contract.address : null;
        const tokenId = typeof raw.tokenId === 'string' ? raw.tokenId : null;
        const imageUrl = firstUrl(image.cachedUrl, image.thumbnailUrl, image.pngUrl, image.originalUrl, metadata.image, openSea.imageUrl);
        if (!imageUrl) return null;
        const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : tokenId ? `NFT #${tokenId}` : 'NFT';
        const collection = [openSea.collectionName, contract.name].find((value) => typeof value === 'string' && value.trim()) as string | undefined;
        const external = firstUrl(metadata.external_url, openSea.externalUrl) || imageUrl;
        return {
          id: `${network.chain}:${contractAddress || 'contract'}:${tokenId || name}`,
          name,
          collection: collection?.trim() || network.chain,
          imageUrl,
          externalUrl: evmNftExternalUrl(network.openSea, contractAddress, tokenId, external),
          chain: network.chain,
          ownerAddress,
          contractAddress,
          tokenId,
        } satisfies OwnedNft;
      }).filter((item): item is OwnedNft => Boolean(item));
    } catch {
      return [] as OwnedNft[];
    }
  }));
  return batches.flat();
}

async function fetchSolanaNfts(apiKey: string, ownerAddress: string): Promise<OwnedNft[]> {
  try {
    const response = await fetch(`https://solana-mainnet.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAssetsByOwner',
        params: {
          ownerAddress,
          limit: 50,
          page: 1,
          options: { showUnverifiedCollections: true, showCollectionMetadata: true, showFungible: false, showZeroBalance: false },
        },
      }),
    });
    if (!response.ok) return [];
    const payload = await response.json() as { result?: { items?: Array<Record<string, unknown>> } };
    return (payload.result?.items || []).map((raw) => {
      const content = (raw.content || {}) as Record<string, unknown>;
      const links = (content.links || {}) as Record<string, unknown>;
      const metadata = (content.metadata || {}) as Record<string, unknown>;
      const files = Array.isArray(content.files) ? content.files as Array<Record<string, unknown>> : [];
      const grouping = Array.isArray(raw.grouping) ? raw.grouping as Array<Record<string, unknown>> : [];
      const idValue = typeof raw.id === 'string' ? raw.id : '';
      const imageUrl = firstUrl(links.image, files[0]?.cdn_uri, files[0]?.uri, metadata.image);
      if (!idValue || !imageUrl) return null;
      const collectionItem = grouping.find((item) => item.group_key === 'collection');
      const collection = typeof collectionItem?.group_value === 'string' ? collectionItem.group_value : 'Solana';
      return {
        id: `Solana:${idValue}`,
        name: typeof metadata.name === 'string' && metadata.name.trim() ? metadata.name.trim() : 'Solana NFT',
        collection,
        imageUrl,
        externalUrl: `https://explorer.solana.com/address/${encodeURIComponent(idValue)}`,
        chain: 'Solana',
        ownerAddress,
        contractAddress: idValue,
        tokenId: idValue,
      } satisfies OwnedNft;
    }).filter((item): item is OwnedNft => Boolean(item));
  } catch {
    return [];
  }
}

async function discoverNfts(env: Env, walletRows: WalletRow[], destinations: Array<{ chain_family: ChainFamily; address: string }>) {
  const apiKey = env.ALCHEMY_API_KEY?.trim();
  if (!apiKey) {
    return {
      configured: false,
      nfts: [] as OwnedNft[],
      message: 'NFT wallet discovery requires the server-side Alchemy API key.',
    };
  }

  const evmAddresses = new Set<string>();
  const solanaAddresses = new Set<string>();
  for (const wallet of walletRows) {
    if (/^0x[a-fA-F0-9]{40}$/.test(wallet.address)) evmAddresses.add(wallet.address);
    else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet.address)) solanaAddresses.add(wallet.address);
  }
  for (const wallet of destinations) {
    if (wallet.chain_family === 'evm') evmAddresses.add(wallet.address);
    if (wallet.chain_family === 'solana') solanaAddresses.add(wallet.address);
  }

  const requests: Array<Promise<OwnedNft[]>> = [];
  for (const address of Array.from(evmAddresses).slice(0, 3)) requests.push(fetchEvmNfts(apiKey, address));
  for (const address of Array.from(solanaAddresses).slice(0, 3)) requests.push(fetchSolanaNfts(apiKey, address));
  const nfts = (await Promise.all(requests)).flat();
  const unique = Array.from(new Map(nfts.map((nft) => [nft.id, nft])).values()).slice(0, 120);
  return {
    configured: true,
    nfts: unique,
    message: unique.length
      ? 'Assets were discovered from the wallets attached to this Linkary profile.'
      : 'No displayable NFTs were found in the attached wallets on the supported networks.',
  };
}

export async function listProfileWalletDestinations(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  const url = new URL(request.url);
  const profileId = url.searchParams.get('profileId');
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
  const nftDiscovery = url.searchParams.get('includeNfts') === '1'
    ? await discoverNfts(env, embeddedWallets, destinations)
    : undefined;
  return json({ destinations, embeddedWallets, ...(nftDiscovery ? { nftDiscovery } : {}) });
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