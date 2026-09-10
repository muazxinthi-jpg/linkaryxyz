import assert from "node:assert/strict";
import test from "node:test";
import {
  isDirectVideoUrl,
  resolveFeaturedMedia,
  resolveFeaturedPreview,
  safeDirectImageUrl,
  safeHttpsUrl,
  youtubeThumbnail,
  youtubeVideoId,
} from "../src/profileMedia";

test("accepts direct image URLs", () => {
  assert.equal(
    safeDirectImageUrl("https://example.com/image.jpg"),
    "https://example.com/image.jpg",
  );
});

test("accepts X image CDN URLs that use a format query", () => {
  const url = "https://pbs.twimg.com/media/example?format=jpg&name=large";
  assert.equal(safeDirectImageUrl(url), url);
});

test("explicit HTTPS CDN media without an extension can be an image preview", () => {
  const url = "https://cdn.example.com/assets/abc123";
  assert.deepEqual(resolveFeaturedMedia(url, "https://example.com", "featured_image"), {
    kind: "image",
    src: url,
    youtube: false,
  });
});

test("resolves youtu.be thumbnails", () => {
  assert.equal(youtubeVideoId("https://youtu.be/abcdefghijk"), "abcdefghijk");
  assert.equal(
    youtubeThumbnail("https://youtu.be/abcdefghijk"),
    "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
  );
});

test("resolves normal YouTube watch URLs", () => {
  assert.equal(
    youtubeVideoId("https://www.youtube.com/watch?v=abcdefghijk"),
    "abcdefghijk",
  );
});

test("resolves YouTube Shorts and embed URLs", () => {
  assert.equal(
    youtubeVideoId("https://www.youtube.com/shorts/abcdefghijk"),
    "abcdefghijk",
  );
  assert.equal(
    youtubeVideoId("https://www.youtube.com/embed/abcdefghijk"),
    "abcdefghijk",
  );
});

test("detects direct HTTPS videos", () => {
  assert.equal(isDirectVideoUrl("https://cdn.example.com/demo.mp4"), true);
  assert.deepEqual(
    resolveFeaturedMedia("https://cdn.example.com/demo.mp4", "https://example.com", "featured_video"),
    { kind: "video", src: "https://cdn.example.com/demo.mp4", youtube: false },
  );
});

test("rejects non-HTTPS preview media", () => {
  assert.equal(safeHttpsUrl("http://example.com/image.jpg"), null);
  assert.equal(safeHttpsUrl("javascript:alert(1)"), null);
  assert.equal(resolveFeaturedMedia("http://example.com/image.jpg", "https://example.com", "featured_image"), null);
});

test("does not treat an ordinary featured destination as preview media", () => {
  assert.equal(
    resolveFeaturedMedia(null, "https://x.com/example/status/123", "featured_image"),
    null,
  );
});


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
