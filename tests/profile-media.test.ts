import assert from "node:assert/strict";
import test from "node:test";
import {
  isDirectVideoUrl,
  resolveFeaturedMedia,
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
