import type { Env } from '../env';
import { requireDb } from '../env';
import { Db } from '../db/client';
import { HttpError, json, readJson } from '../http';
import { requireAuth, verifyCsrf } from '../auth/session';
import { organizationMembership } from './organizations';
import { BETA_CHAIN_CAPABILITIES, betaChain, type BetaChainCapability, type BetaChainKey, type ChainFamily } from '../chains';

const id = () => `pwd_${crypto.randomUUID().replace(/-/g, '')}`;
const now = () => new Date().toISOString();
const EVM_PAGE_SIZE = 100;
const SOLANA_PAGE_SIZE = 100;

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

type NftChainSelection = 'all' | BetaChainKey;
type NftChainState = {
  key: BetaChainKey;
  label: string;
  status: 'ok' | 'empty' | 'unavailable' | 'error';
  loadedCount: number;
  hasMore: boolean;
  message: string;
};
type CursorEntry = { address: string; pageKey?: string; page?: number };
type NftCursor = { chain: BetaChainKey; entries: CursorEntry[] };
type ChainFetchResult = {
  nfts: OwnedNft[];
  state: NftChainState;
  nextCursor: NftCursor | null;
};

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

function encodeCursor(cursor: NftCursor | null): string | null {
  if (!cursor || !cursor.entries.length) return null;
  const encoded = btoa(JSON.stringify(cursor));
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCursor(raw: string | null, selectedChain: NftChainSelection): NftCursor | null {
  if (!raw || selectedChain === 'all') return null;
  try {
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(raw.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(padded)) as Partial<NftCursor>;
    if (parsed.chain !== selectedChain || !Array.isArray(parsed.entries)) return null;
    const entries = parsed.entries.filter((entry): entry is CursorEntry => Boolean(entry && typeof entry.address === 'string'));
    return { chain: selectedChain, entries };
  } catch {
    return null;
  }
}

function mapEvmNft(network: BetaChainCapability, ownerAddress: string, raw: Record<string, unknown>): OwnedNft | null {
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
    id: `${network.key}:${contractAddress || 'contract'}:${tokenId || name}`,
    name,
    collection: collection?.trim() || network.label,
    imageUrl,
    externalUrl: evmNftExternalUrl(network.openSeaSlug || network.key, contractAddress, tokenId, external),
    chain: network.label,
    ownerAddress,
    contractAddress,
    tokenId,
  };
}

async function fetchEvmChain(
  apiKey: string,
  network: BetaChainCapability,
  ownerAddresses: string[],
  cursor: NftCursor | null,
): Promise<ChainFetchResult> {
  if (network.nftDiscovery === 'unavailable' || !network.alchemyNftHost) {
    return {
      nfts: [],
      state: {
        key: network.key,
        label: network.label,
        status: 'unavailable',
        loadedCount: 0,
        hasMore: false,
        message: 'NFT discovery is not currently available for this network.',
      },
      nextCursor: null,
    };
  }
  if (!ownerAddresses.length) {
    return {
      nfts: [],
      state: { key: network.key, label: network.label, status: 'empty', loadedCount: 0, hasMore: false, message: 'No EVM wallet is attached to this profile.' },
      nextCursor: null,
    };
  }

  const cursorByAddress = new Map((cursor?.entries || []).map((entry) => [entry.address.toLowerCase(), entry]));
  const requestedAddresses = cursor
    ? ownerAddresses.filter((address) => cursorByAddress.has(address.toLowerCase()))
    : ownerAddresses;
  const results = await Promise.all(requestedAddresses.map(async (ownerAddress) => {
    const prior = cursorByAddress.get(ownerAddress.toLowerCase());
    try {
      const endpoint = new URL(`https://${network.alchemyNftHost}.g.alchemy.com/nft/v3/${encodeURIComponent(apiKey)}/getNFTsForOwner`);
      endpoint.searchParams.set('owner', ownerAddress);
      endpoint.searchParams.set('withMetadata', 'true');
      endpoint.searchParams.set('pageSize', String(EVM_PAGE_SIZE));
      if (prior?.pageKey) endpoint.searchParams.set('pageKey', prior.pageKey);
      const response = await fetch(endpoint.toString(), { headers: { accept: 'application/json' } });
      if (!response.ok) {
        return {
          ownerAddress,
          unavailable: network.nftDiscovery === 'probe' && [400, 404, 405, 501].includes(response.status),
          error: true,
          nfts: [] as OwnedNft[],
          pageKey: null as string | null,
        };
      }
      const payload = await response.json() as { ownedNfts?: Array<Record<string, unknown>>; pageKey?: string };
      return {
        ownerAddress,
        unavailable: false,
        error: false,
        nfts: (payload.ownedNfts || []).map((raw) => mapEvmNft(network, ownerAddress, raw)).filter((item): item is OwnedNft => item !== null),
        pageKey: typeof payload.pageKey === 'string' && payload.pageKey ? payload.pageKey : null,
      };
    } catch {
      return { ownerAddress, unavailable: false, error: true, nfts: [] as OwnedNft[], pageKey: null as string | null };
    }
  }));

  if (results.length && results.every((result) => result.unavailable)) {
    return {
      nfts: [],
      state: {
        key: network.key,
        label: network.label,
        status: 'unavailable',
        loadedCount: 0,
        hasMore: false,
        message: 'NFT discovery is not currently available for this network.',
      },
      nextCursor: null,
    };
  }

  const successful = results.filter((result) => !result.error);
  const nfts = results.flatMap((result) => result.nfts);
  const nextEntries = results.filter((result) => result.pageKey).map((result) => ({ address: result.ownerAddress, pageKey: result.pageKey as string }));
  const hasMore = nextEntries.length > 0;
  const hadErrors = results.some((result) => result.error && !result.unavailable);
  const status: NftChainState['status'] = !successful.length && hadErrors ? 'error' : nfts.length ? 'ok' : hadErrors ? 'error' : 'empty';
  const message = status === 'error'
    ? successful.length
      ? `Some ${network.label} NFT results could not be loaded. Available assets are shown.`
      : `${network.label} NFTs could not be loaded right now.`
    : nfts.length
      ? `${network.label} NFTs were discovered from the attached wallet${ownerAddresses.length === 1 ? '' : 's'}.`
      : `No displayable ${network.label} NFTs were found in the attached wallet${ownerAddresses.length === 1 ? '' : 's'}.`;

  return {
    nfts,
    state: { key: network.key, label: network.label, status, loadedCount: nfts.length, hasMore, message },
    nextCursor: hasMore ? { chain: network.key, entries: nextEntries } : null,
  };
}

function mapSolanaNft(ownerAddress: string, raw: Record<string, unknown>): OwnedNft | null {
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
    id: `solana:${idValue}`,
    name: typeof metadata.name === 'string' && metadata.name.trim() ? metadata.name.trim() : 'Solana NFT',
    collection,
    imageUrl,
    externalUrl: `https://explorer.solana.com/address/${encodeURIComponent(idValue)}`,
    chain: 'Solana',
    ownerAddress,
    contractAddress: idValue,
    tokenId: idValue,
  };
}

async function fetchSolanaChain(apiKey: string, ownerAddresses: string[], cursor: NftCursor | null): Promise<ChainFetchResult> {
  const network = betaChain('solana')!;
  if (!ownerAddresses.length) {
    return {
      nfts: [],
      state: { key: 'solana', label: 'Solana', status: 'empty', loadedCount: 0, hasMore: false, message: 'No Solana wallet is attached to this profile.' },
      nextCursor: null,
    };
  }
  const cursorByAddress = new Map((cursor?.entries || []).map((entry) => [entry.address, entry]));
  const requestedAddresses = cursor ? ownerAddresses.filter((address) => cursorByAddress.has(address)) : ownerAddresses;
  const results = await Promise.all(requestedAddresses.map(async (ownerAddress) => {
    const page = Math.max(1, cursorByAddress.get(ownerAddress)?.page || 1);
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
            limit: SOLANA_PAGE_SIZE,
            page,
            options: { showUnverifiedCollections: true, showCollectionMetadata: true, showFungible: false, showZeroBalance: false },
          },
        }),
      });
      if (!response.ok) return { ownerAddress, page, error: true, nfts: [] as OwnedNft[], hasMore: false };
      const payload = await response.json() as { result?: { items?: Array<Record<string, unknown>>; total?: number } };
      const rawItems = payload.result?.items || [];
      const nfts = rawItems.map((raw) => mapSolanaNft(ownerAddress, raw)).filter((item): item is OwnedNft => item !== null);
      const total = typeof payload.result?.total === 'number' ? payload.result.total : null;
      const hasMore = total !== null ? page * SOLANA_PAGE_SIZE < total : rawItems.length === SOLANA_PAGE_SIZE;
      return { ownerAddress, page, error: false, nfts, hasMore };
    } catch {
      return { ownerAddress, page, error: true, nfts: [] as OwnedNft[], hasMore: false };
    }
  }));

  const successful = results.filter((result) => !result.error);
  const nfts = results.flatMap((result) => result.nfts);
  const nextEntries = results.filter((result) => result.hasMore).map((result) => ({ address: result.ownerAddress, page: result.page + 1 }));
  const hasMore = nextEntries.length > 0;
  const hadErrors = results.some((result) => result.error);
  const status: NftChainState['status'] = !successful.length && hadErrors ? 'error' : nfts.length ? 'ok' : hadErrors ? 'error' : 'empty';
  const message = status === 'error'
    ? successful.length
      ? 'Some Solana NFT results could not be loaded. Available assets are shown.'
      : 'Solana NFTs could not be loaded right now.'
    : nfts.length
      ? `Solana NFTs were discovered from the attached wallet${ownerAddresses.length === 1 ? '' : 's'}.`
      : `No displayable Solana NFTs were found in the attached wallet${ownerAddresses.length === 1 ? '' : 's'}.`;

  return {
    nfts,
    state: { key: network.key, label: network.label, status, loadedCount: nfts.length, hasMore, message },
    nextCursor: hasMore ? { chain: 'solana', entries: nextEntries } : null,
  };
}

function uniqueNfts(nfts: OwnedNft[]): OwnedNft[] {
  return Array.from(new Map(nfts.map((nft) => [nft.id, nft])).values());
}

function unavailableState(network: BetaChainCapability): NftChainState {
  return {
    key: network.key,
    label: network.label,
    status: 'unavailable',
    loadedCount: 0,
    hasMore: false,
    message: 'NFT discovery is not currently available for this network.',
  };
}

async function discoverNfts(
  env: Env,
  walletRows: WalletRow[],
  destinations: Array<{ chain_family: ChainFamily; address: string }>,
  selectedChain: NftChainSelection,
  rawCursor: string | null,
) {
  const apiKey = env.ALCHEMY_API_KEY?.trim();
  if (!apiKey) {
    return {
      configured: false,
      selectedChain,
      nfts: [] as OwnedNft[],
      chains: [] as NftChainState[],
      nextCursor: null as string | null,
      hasMore: false,
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

  const evm = Array.from(evmAddresses).slice(0, 3);
  const solana = Array.from(solanaAddresses).slice(0, 3);
  const cursor = decodeCursor(rawCursor, selectedChain);

  if (selectedChain !== 'all') {
    const network = betaChain(selectedChain);
    if (!network) throw new HttpError(400, 'Unsupported NFT network', 'invalid_nft_chain');
    let result: ChainFetchResult;
    if (network.nftDiscovery === 'unavailable') {
      result = { nfts: [], state: unavailableState(network), nextCursor: null };
    } else if (network.family === 'solana') {
      result = await fetchSolanaChain(apiKey, solana, cursor);
    } else {
      result = await fetchEvmChain(apiKey, network, evm, cursor);
    }
    const nfts = uniqueNfts(result.nfts);
    return {
      configured: true,
      selectedChain,
      nfts,
      chains: [result.state],
      nextCursor: encodeCursor(result.nextCursor),
      hasMore: Boolean(result.nextCursor),
      message: result.state.message,
    };
  }

  const queryable = BETA_CHAIN_CAPABILITIES.filter((network) => network.nftDiscovery !== 'unavailable');
  const results = await Promise.all(queryable.map(async (network) => {
    if (network.family === 'solana') return fetchSolanaChain(apiKey, solana, null);
    return fetchEvmChain(apiKey, network, evm, null);
  }));
  const statesByKey = new Map(results.map((result) => [result.state.key, result.state]));
  const chains = BETA_CHAIN_CAPABILITIES.map((network) => statesByKey.get(network.key) || unavailableState(network));
  const nfts = uniqueNfts(results.flatMap((result) => result.nfts));
  const partialErrors = chains.some((state) => state.status === 'error');
  return {
    configured: true,
    selectedChain,
    nfts,
    chains,
    nextCursor: null as string | null,
    hasMore: chains.some((state) => state.hasMore),
    message: nfts.length
      ? partialErrors
        ? 'Available wallet NFTs are shown. One or more networks could not be fully loaded.'
        : 'Assets were discovered from the wallets attached to this Linkary profile.'
      : partialErrors
        ? 'NFT discovery could not be completed for one or more supported networks.'
        : 'No displayable NFTs were found in the attached wallets on the supported networks.',
  };
}

function nftChainFromUrl(url: URL): NftChainSelection {
  const requested = (url.searchParams.get('nftChain') || 'all').toLowerCase();
  if (requested === 'all') return 'all';
  if (!betaChain(requested)) throw new HttpError(400, 'Unsupported NFT network', 'invalid_nft_chain');
  return requested as BetaChainKey;
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
    ? await discoverNfts(env, embeddedWallets, destinations, nftChainFromUrl(url), url.searchParams.get('nftCursor'))
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
