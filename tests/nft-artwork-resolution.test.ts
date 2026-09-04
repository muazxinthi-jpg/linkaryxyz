import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNftArtworkPreview } from '../src/profileMedia';

test('OpenSea item artwork resolves through Alchemy token metadata without using OpenSea social preview HTML', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    assert.match(url, /^https:\/\/eth-mainnet\.g\.alchemy\.com\/nft\/v3\/test-key\/getNFTMetadata\?/);
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('contractAddress'), '0xb6a37b5d14d502c3ab0ae6f3a0e058bc9517786e');
    assert.equal(parsed.searchParams.get('tokenId'), '3986');
    return new Response(JSON.stringify({ image: { originalUrl: 'ipfs://bafy-example-token-artwork' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await resolveNftArtworkPreview(
      { ALCHEMY_API_KEY: 'test-key' },
      'https://opensea.io/item/ethereum/0xb6a37b5d14d502c3ab0ae6f3a0e058bc9517786e/3986',
    );
    assert.deepEqual(result, {
      kind: 'image',
      src: 'https://ipfs.io/ipfs/bafy-example-token-artwork',
      youtube: false,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls.some((url) => url.includes('opensea.io')), false, 'OpenSea fallback must not run while canonical metadata succeeds');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('NFT metadata identity resolves artwork even when no saved preview URL exists', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    assert.match(url, /^https:\/\/base-mainnet\.g\.alchemy\.com\/nft\/v3\/test-key\/getNFTMetadata\?/);
    return new Response(JSON.stringify({ image: { pngUrl: 'https://cdn.example.com/canonical-nft.png' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await resolveNftArtworkPreview(
      { ALCHEMY_API_KEY: 'test-key' },
      null,
      'Base',
      '0xb6a37b5d14d502c3ab0ae6f3a0e058bc9517786e',
      '3986',
    );
    assert.deepEqual(result, { kind: 'image', src: 'https://cdn.example.com/canonical-nft.png', youtube: false });
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenSea Abstract item identity overrides a stale saved chain and resolves canonical metadata', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    assert.match(url, /^https:\/\/abstract-mainnet\.g\.alchemy\.com\/nft\/v3\/test-key\/getNFTMetadata\?/);
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('contractAddress'), '0x7e3059b08e981a369f99db26487ab4cbffdfef29');
    assert.equal(parsed.searchParams.get('tokenId'), '3057');
    return new Response(JSON.stringify({ image: { originalUrl: 'https://kabu-public.s3.amazonaws.com/kabu/metadata/images/3057.jpg' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await resolveNftArtworkPreview(
      { ALCHEMY_API_KEY: 'test-key' },
      'https://opensea.io/item/abstract/0x7e3059b08e981a369f99db26487ab4cbffdfef29/3057',
      'Ethereum',
    );
    assert.deepEqual(result, {
      kind: 'image',
      src: 'https://kabu-public.s3.amazonaws.com/kabu/metadata/images/3057.jpg',
      youtube: false,
    });
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('JIRASAN-style fallback extracts exact raw artwork and never returns the OpenSea social card', async () => {
  const originalFetch = globalThis.fetch;
  const contract = '0x7fb2d396a3cc840f2c4213f044566ed400159b40';
  const item = `https://opensea.io/item/ethereum/${contract}/9967`;
  const socialCard = `${item}/opengraph-image?ts=29808031`;
  const rawArtwork = `https://i2c.seadn.io/ethereum/${contract}/fe563973e9f09cf020ffcd2ad34985/7efe563973e9f09cf020ffcd2ad34985.png`;
  const escapedRawArtwork = rawArtwork.replaceAll('/', '\\/');
  const calls: string[] = [];

  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url === 'https://ethereum-rpc.publicnode.com') {
      return new Response(JSON.stringify({ error: { code: -32000, message: 'metadata unavailable' } }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === item) {
      return new Response(
        `<html><head><meta property="og:image" content="${socialCard}"></head><body>`
          + `<script>"https:\\/\\/i2c.seadn.io\\/profiles\\/someone\\/avatar.png"</script>`
          + `<script>"${escapedRawArtwork}"</script></body></html>`,
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    }
    throw new Error('Unexpected fetch: ' + url);
  };

  try {
    const result = await resolveNftArtworkPreview({ ALCHEMY_API_KEY: undefined }, item);
    assert.deepEqual(result, { kind: 'image', src: rawArtwork, youtube: false });
    assert.equal(result?.src.includes('/opengraph-image'), false);
    assert.deepEqual(calls, ['https://ethereum-rpc.publicnode.com', 'https://ethereum-rpc.publicnode.com', item]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SNOOZIE-style fallback prefers exact raw2 artwork and ignores profile and collection images', async () => {
  const originalFetch = globalThis.fetch;
  const contract = '0x61a85534f124781231bab486b111534d9653f19a';
  const item = `https://opensea.io/item/base/${contract}/2038`;
  const path = `/base/${contract}/9e00dbafa3b683a8214f1ee8f5e75f/7a9e00dbafa3b683a8214f1ee8f5e75f.png`;
  const i2cArtwork = `https://i2c.seadn.io${path}`;
  const rawArtwork = `https://raw2.seadn.io${path}`;
  const calls: string[] = [];

  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url === 'https://mainnet.base.org') {
      return new Response(JSON.stringify({ error: { code: -32000, message: 'temporary rpc failure' } }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === item) {
      return new Response(
        `<html><body>`
          + `<script>"https://i2c.seadn.io/profiles/0xabc/avatar/profile.png"</script>`
          + `<script>"https://i2c.seadn.io/collection/snoozies/image_type_logo/logo.png"</script>`
          + `<script>"${i2cArtwork}"</script><script>"${rawArtwork}"</script>`
          + `</body></html>`,
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    }
    throw new Error('Unexpected fetch: ' + url);
  };

  try {
    const result = await resolveNftArtworkPreview({ ALCHEMY_API_KEY: undefined }, item);
    assert.deepEqual(result, { kind: 'image', src: rawArtwork, youtube: false });
    assert.deepEqual(calls, ['https://mainnet.base.org', 'https://mainnet.base.org', item]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenSea raw fallback fails closed when multiple same-contract token artwork paths are present', async () => {
  const originalFetch = globalThis.fetch;
  const contract = '0x7fb2d396a3cc840f2c4213f044566ed400159b40';
  const item = `https://opensea.io/item/ethereum/${contract}/9967`;

  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === 'https://ethereum-rpc.publicnode.com') {
      return new Response('{}', { status: 502, headers: { 'content-type': 'application/json' } });
    }
    if (url === item) {
      return new Response(
        `<html><body>`
          + `<script>"https://i2c.seadn.io/ethereum/${contract}/hash-one/art-one.png"</script>`
          + `<script>"https://i2c.seadn.io/ethereum/${contract}/hash-two/art-two.png"</script>`
          + `</body></html>`,
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    }
    throw new Error('Unexpected fetch: ' + url);
  };

  try {
    assert.equal(await resolveNftArtworkPreview({ ALCHEMY_API_KEY: undefined }, item), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('saved Alchemy CDN artwork is refreshed from canonical NFT metadata before public rendering', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url.includes('/getNFTMetadata?')) {
      return new Response(JSON.stringify({ image: { originalUrl: 'ipfs://bafy-refreshed-artwork' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`stale saved CDN URL should not be fetched first: ${url}`);
  };

  try {
    const result = await resolveNftArtworkPreview(
      { ALCHEMY_API_KEY: 'test-key' },
      'https://nft-cdn.alchemy.com/stale-preview.png',
      'Ethereum',
      '0xb6a37b5d14d502c3ab0ae6f3a0e058bc9517786e',
      '3986',
    );
    assert.deepEqual(result, { kind: 'image', src: 'https://ipfs.io/ipfs/bafy-refreshed-artwork', youtube: false });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].includes('nft-cdn.alchemy.com'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Solana NFT metadata resolves public artwork from saved mint even without media URL', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const mint = 'So11111111111111111111111111111111111111112';
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    assert.equal(url, 'https://solana-mainnet.g.alchemy.com/v2/test-key');
    const body = JSON.parse(String(init?.body || '{}')) as { method?: string; params?: { id?: string } };
    assert.equal(body.method, 'getAsset');
    assert.equal(body.params?.id, mint);
    return new Response(JSON.stringify({ result: { content: { links: { image: 'ipfs://bafy-solana-artwork' } } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const result = await resolveNftArtworkPreview(
      { ALCHEMY_API_KEY: 'test-key' },
      null,
      'Solana',
      mint,
      mint,
    );
    assert.deepEqual(result, { kind: 'image', src: 'https://ipfs.io/ipfs/bafy-solana-artwork', youtube: false });
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('direct NFT artwork URLs stay direct and do not require a metadata request', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error('fetch should not run for a direct image URL');
  };

  try {
    const result = await resolveNftArtworkPreview(
      { ALCHEMY_API_KEY: 'test-key' },
      'https://example.com/nft/3986.png',
      'Ethereum',
      '0xb6a37b5d14d502c3ab0ae6f3a0e058bc9517786e',
      '3986',
    );
    assert.deepEqual(result, { kind: 'image', src: 'https://example.com/nft/3986.png', youtube: false });
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function encodeAbiString(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const data = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const offset = '20'.padStart(64, '0');
  const length = bytes.length.toString(16).padStart(64, '0');
  const padded = data.padEnd(Math.ceil(data.length / 64) * 64, '0');
  return '0x' + offset + length + padded;
}

test('falls back to onchain tokenURI metadata when Alchemy is not configured', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    if (url === 'https://ethereum-rpc.publicnode.com') {
      const body = JSON.parse(String(init?.body || '{}')) as { method?: string; params?: Array<{ to?: string; data?: string }> };
      assert.equal(body.method, 'eth_call');
      assert.equal(body.params?.[0]?.to, '0xb6a37b5d14d502c3ab0ae6f3a0e058bc9517786e');
      assert.match(body.params?.[0]?.data || '', /^0xc87b56dd[0-9a-f]{64}$/);
      return new Response(JSON.stringify({ result: encodeAbiString('https://elementals-metadata.azuki.com/elemental/3986') }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === 'https://elementals-metadata.azuki.com/elemental/3986') {
      return new Response(JSON.stringify({ image: 'https://elementals-images.azuki.com/example-3986.png' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error('Unexpected fetch: ' + url);
  };

  try {
    const result = await resolveNftArtworkPreview(
      { ALCHEMY_API_KEY: undefined },
      'https://opensea.io/item/ethereum/0xb6a37b5d14d502c3ab0ae6f3a0e058bc9517786e/3986',
    );
    assert.deepEqual(result, {
      kind: 'image',
      src: 'https://elementals-images.azuki.com/example-3986.png',
      youtube: false,
    });
    assert.equal(calls.some((url) => url.includes('alchemy.com')), false);
    assert.equal(calls.some((url) => url.includes('opensea.io')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
