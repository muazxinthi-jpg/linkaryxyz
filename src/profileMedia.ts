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
