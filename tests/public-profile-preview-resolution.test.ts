import assert from "node:assert/strict";
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
