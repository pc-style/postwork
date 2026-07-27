import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// Server-side X → Postwork cross-posting. Polls the read-only x.pcstyle.dev
// proxy for a handle's recent original posts and mirrors new ones into
// Postwork through the connector pipe. No X API keys, no browser extension.
//
// Configure with Convex env vars:
//   X_SYNC_HANDLE        — the X handle to mirror (without @)
//   X_SYNC_CONNECTOR_ID  — an inboundEvents connector id (its agent authors the posts)
//   X_SYNC_API_BASE      — optional, defaults to https://x.pcstyle.dev

const DEFAULT_API_BASE = "https://x.pcstyle.dev";
const MAX_POSTS_PER_RUN = 10;

type ProxyPost = {
  type?: string;
  id?: string;
  url?: string;
  text?: string;
  replying_to?: unknown;
  author?: { screen_name?: string };
};

export const run = internalAction({
  args: {
    handle: v.optional(v.string()),
    connectorId: v.optional(v.id("connectors")),
  },
  handler: async (ctx, args) => {
    const handle = (args.handle ?? process.env.X_SYNC_HANDLE)
      ?.trim()
      .replace(/^@/, "");
    let connectorId = (args.connectorId ??
      process.env.X_SYNC_CONNECTOR_ID) as Id<"connectors"> | undefined;
    if (!connectorId) {
      const found = await ctx.runQuery(internal.connectors.findXSyncConnector, {});
      connectorId = found?.connectorId;
    }
    if (!handle || !connectorId) {
      return {
        skipped: true as const,
        reason:
          "Set X_SYNC_HANDLE and provision an inboundEvents connector with slug \"x\" (or set X_SYNC_CONNECTOR_ID).",
      };
    }

    const base = process.env.X_SYNC_API_BASE?.trim() || DEFAULT_API_BASE;
    const response = await fetch(
      `${base}/${encodeURIComponent(handle)}?limit=${MAX_POSTS_PER_RUN}`,
      { headers: { accept: "application/json" } },
    );
    if (!response.ok) {
      throw new Error(`X proxy responded ${response.status} for @${handle}.`);
    }
    const payload = (await response.json()) as { posts?: ProxyPost[] };
    const posts = Array.isArray(payload.posts) ? payload.posts : [];

    // Oldest first so Postwork's activity feed orders mirrors naturally.
    // Skip replies and anything not authored by the watched handle (the
    // profile feed is already original posts, but stay defensive).
    const candidates = posts
      .filter(
        (post): post is ProxyPost & { id: string; text: string } =>
          typeof post.id === "string" &&
          typeof post.text === "string" &&
          post.text.trim().length > 0 &&
          post.replying_to == null &&
          (post.author?.screen_name === undefined ||
            post.author.screen_name.toLowerCase() === handle.toLowerCase()),
      )
      .slice(0, MAX_POSTS_PER_RUN)
      .reverse();

    let created = 0;
    let duplicates = 0;
    for (const post of candidates) {
      const receipt = await ctx.runMutation(
        internal.connectors.recordXCrossPostFromSync,
        {
          connectorId,
          tweet: {
            id: post.id,
            handle,
            text: post.text,
            url: post.url,
          },
        },
      );
      if (receipt.duplicate) duplicates++;
      else created++;
    }
    return { skipped: false as const, handle, created, duplicates };
  },
});
