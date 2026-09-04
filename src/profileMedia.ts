import type { Env } from './env';

export type FeaturedMedia =
  | { kind: "image"; src: string; youtube: boolean }
  | { kind: "video"; src: string; youtube: false };

const IMAGE_EXTENSIONS = /\.(avif|gif|jpe?g|png|webp)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg)$/i;
const IMAGE_FORMATS = new Set(["avif", "gif", "jpeg", "jpg", "png", "webp"]);

export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function youtubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  return host === "youtube.com" || host === "youtube-nocookie.com";
}

export function youtubeVideoId(value: string | null | undefined): string | null {
  const safe = safeHttpsUrl(value);
  if (!safe) return null;
  try {
    const url = new URL(safe);
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    let id: string | null = null;

    if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] || null;
    } else if (youtubeHost(url.hostname)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      if (!id) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["shorts", "embed", "live"].includes(parts[0] || "")) id = parts[1] || null;
      }
    }

    return id && /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function youtubeThumbnail(value: string | null | undefined): string | null {
  const id = youtubeVideoId(value);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export function safeDirectImageUrl(value: string | null | undefined): string | null {
  const safe = safeHttpsUrl(value);
  if (!safe) return null;
  try {
    const url = new URL(safe);
    const path = url.pathname.toLowerCase();
    if (IMAGE_EXTENSIONS.test(path)) return safe;
    if (url.hostname.toLowerCase() === "i.ytimg.com") return safe;
    if (url.hostname.toLowerCase() === "pbs.twimg.com") {
      const format = (url.searchParams.get("format") || "").toLowerCase();
      if (IMAGE_FORMATS.has(format)) return safe;
    }
    return null;
  } catch {
    return null;
  }
}

export function isDirectVideoUrl(value: string | null | undefined): boolean {
  const safe = safeHttpsUrl(value);
  if (!safe) return false;
  try {
    return VIDEO_EXTENSIONS.test(new URL(safe).pathname.toLowerCase());
  } catch {
    return false;
  }
}

export function resolveFeaturedMedia(
  mediaUrl: string | null | undefined,
  destinationUrl: string | null | undefined,
  blockType: string,
): FeaturedMedia | null {
  const explicit = safeHttpsUrl(mediaUrl);
  if (explicit) {
    const youtubeImage = youtubeThumbnail(explicit);
    if (youtubeImage) return { kind: "image", src: youtubeImage, youtube: true };
    if (isDirectVideoUrl(explicit)) return { kind: "video", src: explicit, youtube: false };

    // mediaUrl is an explicit preview field. Any safe HTTPS URL is allowed as an
    // image candidate because many modern CDNs do not expose a file extension.
    // The public renderer supplies a visual fallback if the browser cannot load it.
    return { kind: "image", src: explicit, youtube: false };
  }

  if (blockType === "featured_video") {
    const youtubeImage = youtubeThumbnail(destinationUrl);
    if (youtubeImage) return { kind: "image", src: youtubeImage, youtube: true };
    const destination = safeHttpsUrl(destinationUrl);
    if (destination && isDirectVideoUrl(destination)) {
      return { kind: "video", src: destination, youtube: false };
    }
  }

  if (blockType === "featured_image") {
    const image = safeDirectImageUrl(destinationUrl);
    if (image) return { kind: "image", src: image, youtube: false };
  }

  return null;
}

function isPublicWebHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (/^(0|10|127|169\.254|172\.(1[6-9]|2\d|3[0-1])|192\.168)(\.|$)/.test(host)) return false;
  return true;
}

function isPageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return host === 'x.com' || host === 'twitter.com' || !IMAGE_EXTENSIONS.test(url.pathname) && !VIDEO_EXTENSIONS.test(url.pathname);
  } catch {
    return false;
  }
}

function metaContent(source: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1].replace(/&amp;/gi, '&');
  }
  return null;
}

type NftMetadataLocator = {
  chain: string;
  contractAddress: string;
  tokenId: string;
};

const ALCHEMY_NFT_HOSTS: Record<string, string> = {
  ethereum: 'eth-mainnet',
  eth: 'eth-mainnet',
  base: 'base-mainnet',
  abstract: 'abstract-mainnet',
  arbitrum: 'arb-mainnet',
  bsc: 'bnb-mainnet',
  bnb: 'bnb-mainnet',
  'bnb chain': 'bnb-mainnet',
  polygon: 'polygon-mainnet',
  optimism: 'opt-mainnet',
};

const EVM_PUBLIC_RPC: Record<string, string> = {
  ethereum: 'https://ethereum-rpc.publicnode.com',
  eth: 'https://ethereum-rpc.publicnode.com',
  base: 'https://mainnet.base.org',
  abstract: 'https://api.mainnet.abs.xyz',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  bsc: 'https://bsc-dataseed.binance.org',
  bnb: 'https://bsc-dataseed.binance.org',
  'bnb chain': 'https://bsc-dataseed.binance.org',
  polygon: 'https://polygon-rpc.com',
  optimism: 'https://mainnet.optimism.io',
};

function nftGatewayUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  if (raw.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${raw.slice(7).replace(/^ipfs\//, '')}`;
  if (raw.startsWith('ar://')) return `https://arweave.net/${raw.slice(5)}`;
  const safe = safeHttpsUrl(raw);
  if (!safe) return null;
  return isPublicWebHost(new URL(safe).hostname) ? safe : null;
}

function firstNftArtworkUrl(...values: unknown[]): string | null {
  for (const value of values) {
    const url = nftGatewayUrl(value);
    if (url) return url;
  }
  return null;
}

function parseOpenSeaNftItemUrl(value: string): NftMetadataLocator | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'opensea.io') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (!['item', 'assets'].includes(parts[0] || '') || parts.length < 4) return null;
    const chain = (parts[1] || '').toLowerCase();
    const contractAddress = parts[2] || '';
    const tokenId = parts[3] || '';
    if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress) || !tokenId) return null;
    return { chain, contractAddress, tokenId };
  } catch {
    return null;
  }
}

function metadataLocatorFromConfig(
  chain: string | null | undefined,
  contractAddress: string | null | undefined,
  tokenId: string | null | undefined,
): NftMetadataLocator | null {
  const contract = contractAddress?.trim() || '';
  const token = tokenId?.trim() || '';
  if (!/^0x[a-fA-F0-9]{40}$/.test(contract) || !token) return null;
  return { chain: (chain || 'ethereum').trim().toLowerCase(), contractAddress: contract, tokenId: token };
}

function solanaMintFromConfig(
  chain: string | null | undefined,
  contractAddress: string | null | undefined,
  tokenId: string | null | undefined,
): string | null {
  if ((chain || '').trim().toLowerCase() !== 'solana') return null;
  const mint = tokenId?.trim() || contractAddress?.trim() || '';
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) ? mint : null;
}

function decodeAbiString(value: unknown): string | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) return null;
  const hex = value.slice(2);
  if (hex.length < 128) return null;
  try {
    const offsetBytes = Number(BigInt('0x' + hex.slice(0, 64)));
    const offset = offsetBytes * 2;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + 64 > hex.length) return null;
    const lengthBytes = Number(BigInt('0x' + hex.slice(offset, offset + 64)));
    const start = offset + 64;
    const end = start + lengthBytes * 2;
    if (!Number.isSafeInteger(end) || end > hex.length) return null;
    const bytes = new Uint8Array(lengthBytes);
    for (let index = 0; index < lengthBytes; index += 1) {
      bytes[index] = Number.parseInt(hex.slice(start + index * 2, start + index * 2 + 2), 16);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function nftTokenCallData(selector: string, tokenId: string): string | null {
  try {
    const id = BigInt(tokenId);
    if (id < 0n) return null;
    return selector + id.toString(16).padStart(64, '0');
  } catch {
    return null;
  }
}

async function readRpcTokenUri(rpc: string, locator: NftMetadataLocator, selector: string): Promise<string | null> {
  const data = nftTokenCallData(selector, locator.tokenId);
  if (!data) return null;
  try {
    const response = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: locator.contractAddress, data }, 'latest'] }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { result?: unknown };
    return decodeAbiString(payload.result);
  } catch {
    return null;
  }
}

function parseInlineNftMetadata(uri: string): Record<string, unknown> | null {
  try {
    if (uri.startsWith('data:application/json;base64,')) {
      return JSON.parse(atob(uri.slice('data:application/json;base64,'.length))) as Record<string, unknown>;
    }
    if (uri.startsWith('data:application/json,')) {
      return JSON.parse(decodeURIComponent(uri.slice('data:application/json,'.length))) as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchNftMetadata(uri: string, tokenId: string): Promise<Record<string, unknown> | null> {
  let resolvedUri = uri.trim();
  if (!resolvedUri) return null;
  if (resolvedUri.includes('{id}')) {
    try { resolvedUri = resolvedUri.replaceAll('{id}', BigInt(tokenId).toString(16).padStart(64, '0')); }
    catch { return null; }
  }
  const inline = parseInlineNftMetadata(resolvedUri);
  if (inline) return inline;
  const metadataUrl = nftGatewayUrl(resolvedUri);
  if (!metadataUrl) return null;
  try {
    const response = await fetch(metadataUrl, { headers: { accept: 'application/json,application/*+json;q=0.9,*/*;q=0.2' }, redirect: 'follow' });
    if (!response.ok) return null;
    const finalUrl = safeHttpsUrl(response.url || metadataUrl);
    if (!finalUrl || !isPublicWebHost(new URL(finalUrl).hostname)) return null;
    return await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function resolveOnchainEvmNftArtwork(locator: NftMetadataLocator): Promise<string | null> {
  const rpc = EVM_PUBLIC_RPC[locator.chain];
  if (!rpc) return null;
  const tokenUri = await readRpcTokenUri(rpc, locator, '0xc87b56dd')
    || await readRpcTokenUri(rpc, locator, '0x0e89341c');
  if (!tokenUri) return null;
  const metadata = await fetchNftMetadata(tokenUri, locator.tokenId);
  if (!metadata) return null;
  return firstNftArtworkUrl(metadata.image, metadata.image_url, metadata.imageUrl);
}

async function resolveAlchemyNftArtwork(env: Pick<Env, 'ALCHEMY_API_KEY'>, locator: NftMetadataLocator): Promise<string | null> {
  const apiKey = env.ALCHEMY_API_KEY?.trim();
  const host = ALCHEMY_NFT_HOSTS[locator.chain];
  if (!apiKey || !host) return null;
  try {
    const endpoint = new URL(`https://${host}.g.alchemy.com/nft/v3/${encodeURIComponent(apiKey)}/getNFTMetadata`);
    endpoint.searchParams.set('contractAddress', locator.contractAddress);
    endpoint.searchParams.set('tokenId', locator.tokenId);
    const response = await fetch(endpoint.toString(), { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const payload = await response.json() as {
      image?: { originalUrl?: unknown; pngUrl?: unknown; cachedUrl?: unknown; thumbnailUrl?: unknown };
      raw?: { metadata?: { image?: unknown; image_url?: unknown } };
    };
    const image = payload.image || {};
    const metadata = payload.raw?.metadata || {};
    return firstNftArtworkUrl(image.originalUrl, image.pngUrl, image.cachedUrl, image.thumbnailUrl, metadata.image, metadata.image_url);
  } catch {
    return null;
  }
}

async function resolveAlchemySolanaNftArtwork(env: Pick<Env, 'ALCHEMY_API_KEY'>, mint: string): Promise<string | null> {
  const apiKey = env.ALCHEMY_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const response = await fetch(`https://solana-mainnet.g.alchemy.com/v2/${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: mint } }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as {
      result?: {
        content?: {
          links?: { image?: unknown };
          files?: Array<{ cdn_uri?: unknown; uri?: unknown }>;
          metadata?: { image?: unknown };
        };
      };
    };
    const content = payload.result?.content || {};
    const files = Array.isArray(content.files) ? content.files : [];
    return firstNftArtworkUrl(content.links?.image, files[0]?.cdn_uri, files[0]?.uri, content.metadata?.image);
  } catch {
    return null;
  }
}

async function resolveOpenSeaExactItemFallback(source: string): Promise<string | null> {
  const locator = parseOpenSeaNftItemUrl(source);
  if (!locator) return null;
  try {
    const itemUrl = new URL(source);
    const response = await fetch(itemUrl.toString(), {
      headers: { accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
      redirect: 'follow',
    });
    if (!response.ok) return null;
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('html')) return null;
    const html = (await response.text()).slice(0, 350_000);
    const rawImage = metaContent(html, 'og:image') || metaContent(html, 'twitter:image');
    const image = rawImage ? safeHttpsUrl(new URL(rawImage, response.url || itemUrl.toString()).toString()) : null;
    if (!image || !isPublicWebHost(new URL(image).hostname)) return null;

    const imageUrl = new URL(image);
    const imageHost = imageUrl.hostname.toLowerCase().replace(/^www\./, '');
    const itemPath = itemUrl.pathname.replace(/\/$/, '');
    if (imageHost !== 'opensea.io' || imageUrl.pathname !== `${itemPath}/opengraph-image`) return null;
    return image;
  } catch {
    return null;
  }
}

function isAlchemyNftCdn(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'nft-cdn.alchemy.com' || host.endsWith('.alchemy.com');
  } catch {
    return false;
  }
}

/** Resolve only the artwork for an NFT card. The click destination is deliberately
 * not accepted here, so a collection page can never become the NFT preview image. */
export async function resolveNftArtworkPreview(
  env: Pick<Env, 'ALCHEMY_API_KEY'>,
  artworkSource: string | null | undefined,
  chain?: string | null,
  nftContract?: string | null,
  nftTokenId?: string | null,
): Promise<FeaturedMedia | null> {
  const source = safeHttpsUrl(artworkSource);
  const openSeaItem = source ? parseOpenSeaNftItemUrl(source) : null;
  const locator = openSeaItem || metadataLocatorFromConfig(chain, nftContract, nftTokenId);
  const solanaMint = solanaMintFromConfig(chain, nftContract, nftTokenId);
  const preferMetadata = Boolean((locator || solanaMint) && (!source || openSeaItem || (source && isAlchemyNftCdn(source))));

  const resolveMetadata = async (): Promise<string | null> => {
    if (locator) {
      const artwork = await resolveAlchemyNftArtwork(env, locator);
      if (artwork) return artwork;
      return resolveOnchainEvmNftArtwork(locator);
    }
    if (solanaMint) return resolveAlchemySolanaNftArtwork(env, solanaMint);
    return null;
  };

  if (preferMetadata) {
    const artwork = await resolveMetadata();
    if (artwork) return { kind: 'image', src: artwork, youtube: false };
  }

  if (source) {
    const direct = safeDirectImageUrl(source);
    if (direct) return { kind: 'image', src: direct, youtube: false };
    if (openSeaItem) {
      const fallback = await resolveOpenSeaExactItemFallback(source);
      return fallback ? { kind: 'image', src: fallback, youtube: false } : null;
    }

    // Extensionless CDN artwork is common. Verify that the explicit artwork source
    // itself is an image, but never parse a marketplace collection page.
    try {
      const sourceUrl = new URL(source);
      if (isPublicWebHost(sourceUrl.hostname)) {
        const response = await fetch(source, { headers: { accept: 'image/avif,image/webp,image/*;q=0.9,*/*;q=0.2' }, redirect: 'follow' });
        if (response.ok) {
          const contentType = (response.headers.get('content-type') || '').toLowerCase();
          if (contentType.startsWith('image/')) return { kind: 'image', src: response.url, youtube: false };
        }
      }
    } catch {
      // Broken third-party artwork must never make the public profile unavailable.
    }
  }

  if (!preferMetadata && (locator || solanaMint)) {
    const artwork = await resolveMetadata();
    if (artwork) return { kind: 'image', src: artwork, youtube: false };
  }

  return null;
}

/** Resolve an Open Graph poster from a public feature page without ever exposing
 * the upstream HTML to visitors. Direct media remains the fast path. */
export async function resolveFeaturedPreview(
  mediaUrl: string | null | undefined,
  destinationUrl: string | null | undefined,
  blockType: string,
): Promise<FeaturedMedia | null> {
  const direct = resolveFeaturedMedia(mediaUrl, destinationUrl, blockType);
  if (direct && !isPageUrl(direct.src)) return direct;
  const candidates = [mediaUrl, destinationUrl]
    .map((value) => safeHttpsUrl(value))
    .filter((value): value is string => Boolean(value) && isPublicWebHost(new URL(value!).hostname));
  for (const candidate of [...new Set(candidates)]) {
    try {
      const response = await fetch(candidate, { headers: { accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/*;q=0.8,*/*;q=0.5' }, redirect: 'follow' });
      if (!response.ok) continue;
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.startsWith('image/')) return { kind: 'image', src: response.url, youtube: false };
      if (contentType.startsWith('video/')) return { kind: 'video', src: response.url, youtube: false };
      if (!contentType.includes('html')) continue;
      const source = (await response.text()).slice(0, 350_000);
      const image = metaContent(source, 'og:image') || metaContent(source, 'twitter:image');
      const resolved = image ? safeHttpsUrl(new URL(image, response.url).toString()) : null;
      if (resolved && isPublicWebHost(new URL(resolved).hostname)) return { kind: 'image', src: resolved, youtube: false };
    } catch {
      // A third-party site must never make a Linkary profile unavailable.
    }
  }
  return direct && direct.kind === 'video' ? direct : null;
}