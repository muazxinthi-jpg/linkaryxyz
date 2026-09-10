from pathlib import Path

media_path = Path('src/profileMedia.ts')
media = media_path.read_text()

anchor = '''function metaContent(source: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
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
'''

addition = anchor + '''
function itempropContent(source: string, itemprop: string): string | null {
  const escaped = itemprop.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+itemprop=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+itemprop=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1].replace(/&amp;/gi, '&');
  }
  return null;
}

function linkRelHref(source: string, rel: string): string | null {
  const escaped = rel.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
  const patterns = [
    new RegExp(`<link[^>]+rel=["'][^"']*\\\\b${escaped}\\\\b[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*\\\\b${escaped}\\\\b[^"']*["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1].replace(/&amp;/gi, '&');
  }
  return null;
}

function pagePreviewImage(source: string, baseUrl: string): string | null {
  const image = metaContent(source, 'og:image:secure_url')
    || metaContent(source, 'og:image')
    || metaContent(source, 'twitter:image')
    || metaContent(source, 'twitter:image:src')
    || itempropContent(source, 'image')
    || linkRelHref(source, 'image_src');
  if (!image) return null;
  try {
    const resolved = safeHttpsUrl(new URL(image, baseUrl).toString());
    return resolved && isPublicWebHost(new URL(resolved).hostname) ? resolved : null;
  } catch {
    return null;
  }
}

const LINKARY_CANONICAL_PREVIEW = 'https://linkary.xyz/assets/brand/linkary-banner.jpeg';

function ownedPublicSitePreview(value: string): string | null {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\\./, '');
    // linkary.xyz is served by a Worker route on the same Cloudflare zone. Avoid
    // a same-zone self-subrequest and use the public site's canonical social card.
    return host === 'linkary.xyz' ? LINKARY_CANONICAL_PREVIEW : null;
  } catch {
    return null;
  }
}
'''

if anchor not in media:
    raise SystemExit('metaContent anchor not found')
media = media.replace(anchor, addition, 1)

old_resolver = '''  for (const candidate of [...new Set(candidates)]) {
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
'''

new_resolver = '''  for (const candidate of [...new Set(candidates)]) {
    const ownedPreview = ownedPublicSitePreview(candidate);
    if (ownedPreview) return { kind: 'image', src: ownedPreview, youtube: false };
    try {
      const response = await fetch(candidate, { headers: { accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/*;q=0.8,*/*;q=0.5' }, redirect: 'follow' });
      if (!response.ok) continue;
      const finalUrl = safeHttpsUrl(response.url || candidate);
      if (!finalUrl || !isPublicWebHost(new URL(finalUrl).hostname)) continue;
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.startsWith('image/')) return { kind: 'image', src: finalUrl, youtube: false };
      if (contentType.startsWith('video/')) return { kind: 'video', src: finalUrl, youtube: false };
      if (!contentType.includes('html')) continue;
      const source = (await response.text()).slice(0, 350_000);
      const resolved = pagePreviewImage(source, finalUrl);
      if (resolved) return { kind: 'image', src: resolved, youtube: false };
    } catch {
      // A third-party site must never make a Linkary profile unavailable.
    }
  }
'''

if old_resolver not in media:
    raise SystemExit('resolver anchor not found')
media = media.replace(old_resolver, new_resolver, 1)
media_path.write_text(media)

test_path = Path('tests/profile-media.test.ts')
test = test_path.read_text()
test = test.replace('''  resolveFeaturedMedia,\n''', '''  resolveFeaturedMedia,\n  resolveFeaturedPreview,\n''', 1)

test += r'''

test("uses the canonical Linkary preview without a same-zone self-fetch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("self fetch should not run"); }) as typeof fetch;
  try {
    assert.deepEqual(
      await resolveFeaturedPreview(null, "https://linkary.xyz/", "featured_article"),
      { kind: "image", src: "https://linkary.xyz/assets/brand/linkary-banner.jpeg", youtube: false },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolves Open Graph images for external public sites", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    '<html><head><meta property="og:image" content="/social-card.jpg"></head></html>',
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  )) as typeof fetch;
  try {
    assert.deepEqual(
      await resolveFeaturedPreview(null, "https://example.com/article", "featured_article"),
      { kind: "image", src: "https://example.com/social-card.jpg", youtube: false },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolves schema.org itemprop image when Open Graph is absent", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    '<html><head><meta itemprop="image" content="https://cdn.example.com/schema-card.webp"></head></html>',
    { status: 200, headers: { "content-type": "text/html" } },
  )) as typeof fetch;
  try {
    assert.deepEqual(
      await resolveFeaturedPreview(null, "https://example.com/post", "featured_image"),
      { kind: "image", src: "https://cdn.example.com/schema-card.webp", youtube: false },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolves image_src links as a conservative website preview fallback", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    '<html><head><link href="/hero.png" rel="image_src"></head></html>',
    { status: 200, headers: { "content-type": "text/html" } },
  )) as typeof fetch;
  try {
    assert.deepEqual(
      await resolveFeaturedPreview(null, "https://example.com/landing", "featured_image"),
      { kind: "image", src: "https://example.com/hero.png", youtube: false },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not resolve private-host page previews", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response("", { status: 200 }); }) as typeof fetch;
  try {
    assert.equal(await resolveFeaturedPreview(null, "https://127.0.0.1/private", "featured_image"), null);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
'''

test_path.write_text(test)

regression = Path('tests/public-profile-preview-resolution.test.ts')
regression.write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const media = readFileSync("src/profileMedia.ts", "utf8");
const renderer = readFileSync("src/routes/profiles.ts", "utf8");

test("shared preview resolver covers owned-site and standard external metadata", () => {
  assert.match(media, /LINKARY_CANONICAL_PREVIEW/);
  assert.match(media, /ownedPublicSitePreview\(candidate\)/);
  assert.match(media, /metaContent\(source, 'og:image:secure_url'\)/);
  assert.match(media, /metaContent\(source, 'twitter:image:src'\)/);
  assert.match(media, /itempropContent\(source, 'image'\)/);
  assert.match(media, /linkRelHref\(source, 'image_src'\)/);
});

test("known-good public profile renderer stays on the resolved-media path", () => {
  assert.match(renderer, /await resolveFeaturedPreview\(config\.mediaUrl, block\.url, block\.block_type\)/);
  assert.match(renderer, /resolved\?\.kind === 'video'/);
  assert.match(renderer, /resolved\?\.kind === 'image'/);
});
''')
