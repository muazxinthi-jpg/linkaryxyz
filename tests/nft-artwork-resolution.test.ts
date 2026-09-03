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
    assert.equal(calls.some((url) => url.includes('opensea.io')), false, 'OpenSea HTML/social cards must not be used as NFT artwork');
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
