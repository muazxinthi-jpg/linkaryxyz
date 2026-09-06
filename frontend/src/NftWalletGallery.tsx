import { useEffect, useMemo, useState } from 'react';
import './nft-wallet-gallery.css';

export type WalletOwnedNft = {
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

type ChainKey = 'all' | 'ethereum' | 'base' | 'bnb' | 'solana' | 'robinhood';
type ChainState = {
  key: Exclude<ChainKey, 'all'>;
  label: string;
  status: 'ok' | 'empty' | 'unavailable' | 'error';
  loadedCount: number;
  hasMore: boolean;
  message: string;
};
type WalletNftResponse = {
  nftDiscovery?: {
    configured: boolean;
    selectedChain: ChainKey;
    nfts: WalletOwnedNft[];
    chains: ChainState[];
    nextCursor: string | null;
    hasMore: boolean;
    message: string;
  };
};

type Props = {
  profileId: string;
  compact?: boolean;
  selectedImage?: string;
  onSelect: (nft: WalletOwnedNft) => void;
};

const CHAINS: Array<{ key: ChainKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'ethereum', label: 'Ethereum' },
  { key: 'base', label: 'Base' },
  { key: 'bnb', label: 'BNB Chain' },
  { key: 'solana', label: 'Solana' },
  { key: 'robinhood', label: 'Robinhood' },
];

function preferenceKey(profileId: string) {
  return `linkary.nft.chain.${profileId}`;
}

function storedChain(profileId: string): ChainKey {
  const value = window.localStorage.getItem(preferenceKey(profileId));
  return CHAINS.some((chain) => chain.key === value) ? value as ChainKey : 'all';
}

async function fetchNfts(profileId: string, chain: ChainKey, cursor?: string | null): Promise<WalletNftResponse> {
  const params = new URLSearchParams({ profileId, includeNfts: '1', nftChain: chain });
  if (cursor) params.set('nftCursor', cursor);
  const response = await fetch(`/api/profile-wallets?${params.toString()}`, { credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({})) as WalletNftResponse & { message?: string };
  if (!response.ok) throw new Error(payload.message || 'NFT discovery request failed');
  return payload;
}

export default function NftWalletGallery({ profileId, compact = false, selectedImage = '', onSelect }: Props) {
  const [chain, setChain] = useState<ChainKey>(() => storedChain(profileId));
  const [nfts, setNfts] = useState<WalletOwnedNft[]>([]);
  const [chainStates, setChainStates] = useState<ChainState[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const counts = useMemo(() => new Map(chainStates.map((state) => [state.key, state.loadedCount])), [chainStates]);

  async function load(nextChain = chain, append = false) {
    if (loading) return;
    setLoading(true);
    if (!append) setMessage('');
    try {
      const result = await fetchNfts(profileId, nextChain, append ? cursor : null);
      const discovery = result.nftDiscovery;
      setConfigured(Boolean(discovery?.configured));
      setChainStates(discovery?.chains || []);
      setCursor(discovery?.nextCursor || null);
      setHasMore(Boolean(discovery?.hasMore && discovery?.nextCursor));
      setMessage(discovery?.message || 'NFT discovery is unavailable.');
      setNfts((current) => {
        const incoming = discovery?.nfts || [];
        const combined = append ? [...current, ...incoming] : incoming;
        return Array.from(new Map(combined.map((nft) => [nft.id, nft])).values());
      });
    } catch {
      if (!append) setNfts([]);
      setCursor(null);
      setHasMore(false);
      setMessage('NFTs could not be loaded from your profile wallets.');
    } finally {
      setLoading(false);
    }
  }

  function selectChain(nextChain: ChainKey) {
    if (nextChain === chain && nfts.length) return;
    setChain(nextChain);
    window.localStorage.setItem(preferenceKey(profileId), nextChain);
    setNfts([]);
    setCursor(null);
    setHasMore(false);
    void load(nextChain, false);
  }

  useEffect(() => {
    setChain(storedChain(profileId));
    setNfts([]);
    setCursor(null);
    setHasMore(false);
    setConfigured(null);
    setMessage('');
  }, [profileId]);

  return (
    <div className={`nft-wallet-gallery${compact ? ' compact' : ''}`}>
      <div className="nft-wallet-gallery-head">
        <div><strong>Wallet NFTs</strong><small>Choose the network you want to browse. Assets are loaded only when this picker is used.</small></div>
        <button type="button" onClick={() => void load(chain, false)} disabled={loading}>{loading ? 'Loading...' : nfts.length ? 'Refresh' : 'Load NFTs'}</button>
      </div>

      <div className="nft-wallet-chain-picker" aria-label="NFT network">
        {CHAINS.map((option) => {
          const count = option.key === 'all' ? nfts.length : counts.get(option.key as Exclude<ChainKey, 'all'>);
          return <button type="button" key={option.key} className={chain === option.key ? 'active' : ''} onClick={() => selectChain(option.key)} disabled={loading}>{option.label}{typeof count === 'number' && count > 0 ? <span>{count}</span> : null}</button>;
        })}
      </div>

      {message && <p className="nft-wallet-gallery-message">{message}</p>}
      {configured === false && <small className="nft-wallet-gallery-note">Automatic discovery needs the production Alchemy configuration. Manual NFT showcase entries still work.</small>}

      {nfts.length > 0 && <div className={`profile-beta-nft-grid${compact ? ' compact' : ''}`}>{nfts.map((nft) => <button type="button" key={nft.id} className={selectedImage === nft.imageUrl ? 'selected' : ''} onClick={() => onSelect(nft)}><img src={nft.imageUrl} alt="" loading="lazy" /><span>{nft.name}</span><small>{nft.collection && nft.collection !== nft.chain ? `${nft.collection} · ${nft.chain}` : nft.chain}</small></button>)}</div>}

      {chain !== 'all' && hasMore && <div className="nft-wallet-gallery-more"><button type="button" onClick={() => void load(chain, true)} disabled={loading}>{loading ? 'Loading...' : `Load more ${CHAINS.find((item) => item.key === chain)?.label || 'NFTs'}`}</button></div>}
      {chain === 'all' && chainStates.some((state) => state.hasMore) && <small className="nft-wallet-gallery-note">More assets are available. Select a network above to continue loading that network.</small>}
    </div>
  );
}
