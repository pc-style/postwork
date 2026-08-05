import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";

const MAX_URLS = 5;
const MAX_URL_LENGTH = 2_000;
const RETRY_AFTER_MS = 24 * 60 * 60 * 1_000;
const MAX_HTML_BYTES = 500 * 1_024;
const FETCH_TIMEOUT_MS = 8_000;

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host === "::1" ||
    host === "0:0:0:0:0:0:0:1"
  )
    return true;
  if (/^(?:0|10|127)(?:\.|$)/.test(host) || /^192\.168(?:\.|$)/.test(host)) return true;
  const match172 = host.match(/^172\.(\d+)(?:\.|$)/);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return true;
  if (/^169\.254(?:\.|$)/.test(host) || /^(?:fc|fd|fe[89ab])[0-9a-f]*:/i.test(host)) return true;
  return false;
}

export function normalizePreviewUrl(value: string): string | null {
  if (value.length === 0 || value.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      isPrivateHostname(url.hostname)
    )
      return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function clean(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const result = decodeEntities(value).replace(/\s+/g, " ").trim();
  return result ? result.slice(0, 1_000) : undefined;
}

function metaContent(html: string, property: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const propertyMatch = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i);
    if (propertyMatch?.[1]?.toLowerCase() !== property) continue;
    return tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
  }
  return undefined;
}

export function parseOpenGraph(html: string, baseUrl: string) {
  const image = clean(metaContent(html, "og:image"));
  let imageUrl: string | undefined;
  if (image) {
    try {
      const resolved = new URL(image, baseUrl);
      if (resolved.protocol === "https:") imageUrl = resolved.toString();
    } catch {
      // Ignore malformed images.
    }
  }
  const titleFallback = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    title: clean(metaContent(html, "og:title") ?? titleFallback),
    description: clean(metaContent(html, "og:description")),
    imageUrl,
    siteName: clean(metaContent(html, "og:site_name")),
  };
}

export const get = query({
  args: { urls: v.array(v.string()) },
  handler: async (ctx, { urls }) => {
    if (urls.length > MAX_URLS) throw new ConvexError("At most 5 link previews can be requested");
    const normalized = [
      ...new Set(urls.map(normalizePreviewUrl).filter((url): url is string => url !== null)),
    ];
    return Promise.all(
      normalized.map((url) =>
        ctx.db
          .query("linkPreviews")
          .withIndex("by_url", (q) => q.eq("url", url))
          .unique(),
      ),
    );
  },
});

export const request = mutation({
  args: { urls: v.array(v.string()) },
  handler: async (ctx, { urls }) => {
    if (urls.length > MAX_URLS) throw new ConvexError("At most 5 link previews can be requested");
    const now = Date.now();
    const normalized = [
      ...new Set(
        urls.map((value) => {
          const url = normalizePreviewUrl(value);
          if (!url) throw new ConvexError("Invalid or unsafe preview URL");
          return url;
        }),
      ),
    ];
    for (const url of normalized) {
      const existing = await ctx.db
        .query("linkPreviews")
        .withIndex("by_url", (q) => q.eq("url", url))
        .unique();
      if (existing && (existing.status !== "failed" || now - existing.fetchedAt < RETRY_AFTER_MS))
        continue;
      if (existing) await ctx.db.patch(existing._id, { status: "pending", fetchedAt: now });
      else await ctx.db.insert("linkPreviews", { url, status: "pending", fetchedAt: now });
      await ctx.scheduler.runAfter(0, internal.linkPreviews.fetchPreview, { url });
    }
    return normalized;
  },
});

export const storePreview = internalMutation({
  args: {
    url: v.string(),
    status: v.union(v.literal("ok"), v.literal("failed")),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    siteName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("linkPreviews")
      .withIndex("by_url", (q) => q.eq("url", args.url))
      .unique();
    const value = { ...args, fetchedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, value);
    else await ctx.db.insert("linkPreviews", value);
    return null;
  },
});

async function readLimited(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("HTML response is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export const fetchPreview = internalAction({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    try {
      let current = normalizePreviewUrl(url);
      if (!current) throw new Error("Unsafe URL");
      let response: Response | undefined;
      const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
      for (let redirects = 0; redirects <= 3; redirects += 1) {
        response = await fetch(current, {
          redirect: "manual",
          signal,
          headers: { "User-Agent": "PostworkBot/1.0 (+https://postwork.pcstyle.dev)" },
        });
        if (response.status < 300 || response.status >= 400) break;
        const location = response.headers.get("location");
        if (!location) throw new Error("Redirect has no location");
        current = normalizePreviewUrl(new URL(location, current).toString());
        if (!current) throw new Error("Unsafe redirect");
      }
      if (!response?.ok) throw new Error(`Fetch failed (${response?.status ?? 0})`);
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("text/html")) throw new Error("Not HTML");
      const parsed = parseOpenGraph(await readLimited(response), current);
      await ctx.runMutation(internal.linkPreviews.storePreview, { url, status: "ok", ...parsed });
    } catch {
      await ctx.runMutation(internal.linkPreviews.storePreview, { url, status: "failed" });
    }
    return null;
  },
});
