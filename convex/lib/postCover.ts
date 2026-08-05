/**
 * Pure helpers for deriving a feed card's cover visual from a post body.
 *
 * The feed shows at most one cover per post: the first post-level image
 * attachment wins (resolved in `convex/posts.ts`), otherwise these helpers
 * find the first body URL that yields a thumbnail without any extra fetch —
 * a trusted direct-image URL, a deterministic YouTube thumbnail, or a cached
 * `linkPreviews` og:image looked up by the caller.
 */

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/giu;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function withoutCode(text: string): string {
  return text
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/`[^`\n]*`/g, " ");
}

function trimUrlPunctuation(value: string): string {
  const result = value.replace(/[.,!?;:]+$/g, "");
  // Count parentheses once and decrement the close count while trimming, so a
  // crafted body ending in thousands of ")" stays linear instead of rescanning
  // the whole string per trimmed character.
  let opens = 0;
  let closes = 0;
  for (const ch of result) {
    if (ch === "(") opens += 1;
    else if (ch === ")") closes += 1;
  }
  let end = result.length;
  while (end > 0 && result[end - 1] === ")" && closes > opens) {
    end -= 1;
    closes -= 1;
  }
  return end === result.length ? result : result.slice(0, end);
}

/**
 * First few http(s) URLs in a post body, code spans excluded, deduped.
 *
 * Keep in sync with the sibling body-URL parsers: `extractUrls` /
 * `normalizeRichUrl` in `src/lib/richEmbeds.ts` (the post-body preview parser)
 * and `normalizePreviewUrl` in `convex/linkPreviews.ts`. They can't share code
 * directly — richEmbeds is client-bundle code — so this mirrors their safety
 * checks: http(s) only, and no credential- or port-bearing URLs.
 */
export function extractBodyUrls(text: string, max: number): string[] {
  const matches = withoutCode(text).match(URL_PATTERN) ?? [];
  const unique = new Set<string>();
  for (const match of matches) {
    if (unique.size >= max) break;
    const candidate = trimUrlPunctuation(match);
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
      if (parsed.username || parsed.password || parsed.port) continue;
      unique.add(parsed.toString());
    } catch {
      // Malformed URLs stay plain body text.
    }
  }
  return [...unique];
}

/**
 * Deterministic thumbnail for a YouTube link. YouTube serves
 * `i.ytimg.com/vi/<id>/hqdefault.jpg` for every video, so the feed gets a
 * cover without waiting for a link-preview fetch.
 */
export function youtubeThumbnailUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    const pathMatch = url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)\/?$/);
    if (pathMatch?.[1]) id = pathMatch[1];
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Trusted direct-image URLs (Giphy CDN) usable as a cover verbatim. */
export function directImageCoverUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  const trustedHost = /^media\d*\.giphy\.com$/.test(host) || host === "i.giphy.com";
  if (!trustedHost || !/\.(?:gif|webp|png)$/i.test(url.pathname)) return null;
  return url.toString();
}
