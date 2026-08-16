import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import {
  composeXDigest,
  type XPulseMetricItem,
} from "./lib/xPulseDigest";
import { localDateKey, minutesInTimeZone } from "./lib/outboundSchedule";
import { logInfo } from "./lib/observability";

/**
 * X Pulse analytics layer. The cross-post sync (xSync.ts) mirrors a handle's
 * new posts into Postwork; this worker adds the analytics loop on the same
 * proxy: hourly metric snapshots into xPulseItems/xPulseAccountSnapshots and
 * a daily digest post authored by the connector agent — "the thing you check
 * Twitter for lives in Postwork".
 */

const DEFAULT_API_BASE = "https://x.pcstyle.dev";
const DEFAULT_DIGEST_LOCAL_TIME = "09:00";
const COLLECT_POST_LIMIT = 20;
const SNAPSHOT_LOOKBACK_MS = 20 * 60 * 60 * 1000;

type ProxyStatus = {
  type?: string;
  id?: string;
  url?: string;
  text?: string;
  replying_to?: unknown;
  created_timestamp?: number;
  views?: number;
  likes?: number;
  reposts?: number;
  replies?: number;
  quotes?: number;
  bookmarks?: number;
  author?: { screen_name?: string };
};

type ProxyProfilePayload = {
  profile?: { followers?: number; following?: number };
  posts?: ProxyStatus[];
};

type ConfiguredPulse = {
  connectorId: Id<"connectors">;
  orgId: Id<"orgs"> | undefined;
  handle: string;
  agentId: Id<"users">;
  destinationSpaceId: Id<"spaces"> | null;
  digestLocalTime: string;
  digestTimeZone: string;
  lastDigestLocalDate: string | null;
};

export const listConfigured = internalQuery({
  args: {},
  handler: async (ctx): Promise<ConfiguredPulse[]> => {
    const connectors = await ctx.db.query("connectors").collect();
    return connectors
      .filter(
        (connector): connector is Doc<"connectors"> & { xSyncHandle: string } =>
          connector.capability === "inboundEvents" &&
          connector.revokedAt === undefined &&
          connector.xSyncHandle !== undefined,
      )
      .map((connector) => ({
        connectorId: connector._id,
        orgId: connector.orgId,
        handle: connector.xSyncHandle,
        agentId: connector.agentId,
        destinationSpaceId: connector.xDestinationSpaceId ?? null,
        digestLocalTime: connector.xDigestLocalTime ?? DEFAULT_DIGEST_LOCAL_TIME,
        digestTimeZone: connector.xDigestTimeZone ?? "UTC",
        lastDigestLocalDate: connector.xLastDigestLocalDate ?? null,
      }));
  },
});

export const recordObservations = internalMutation({
  args: {
    connectorId: v.id("connectors"),
    followers: v.optional(v.number()),
    following: v.optional(v.number()),
    items: v.array(
      v.object({
        externalId: v.string(),
        text: v.string(),
        url: v.string(),
        sourceCreatedAt: v.number(),
        views: v.optional(v.number()),
        likes: v.optional(v.number()),
        reposts: v.optional(v.number()),
        replies: v.optional(v.number()),
        quotes: v.optional(v.number()),
        bookmarks: v.optional(v.number()),
      }),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<null> => {
    const connector = await ctx.db.get(args.connectorId);
    if (!connector?.orgId || !connector.xSyncHandle) return null;
    const now = Date.now();

    if (args.error !== undefined) {
      await ctx.db.patch(args.connectorId, {
        xLastPollAt: now,
        xLastError: args.error,
        xLastErrorAt: now,
      });
      return null;
    }

    if (args.followers !== undefined || args.following !== undefined) {
      await ctx.db.insert("xPulseAccountSnapshots", {
        orgId: connector.orgId,
        connectorId: args.connectorId,
        followers: args.followers,
        following: args.following,
        observedAt: now,
      });
    }

    for (const item of args.items) {
      const existing = await ctx.db
        .query("xPulseItems")
        .withIndex("by_connector_id_and_external_id", (q) =>
          q.eq("connectorId", args.connectorId).eq("externalId", item.externalId),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          views: item.views,
          likes: item.likes,
          reposts: item.reposts,
          replies: item.replies,
          quotes: item.quotes,
          bookmarks: item.bookmarks,
          observedAt: now,
        });
      } else {
        await ctx.db.insert("xPulseItems", {
          orgId: connector.orgId,
          connectorId: args.connectorId,
          externalId: item.externalId,
          kind: "original",
          authorHandle: connector.xSyncHandle,
          text: item.text,
          url: item.url,
          sourceCreatedAt: item.sourceCreatedAt,
          views: item.views,
          likes: item.likes,
          reposts: item.reposts,
          replies: item.replies,
          quotes: item.quotes,
          bookmarks: item.bookmarks,
          observedAt: now,
        });
      }
    }

    await ctx.db.patch(args.connectorId, {
      xLastPollAt: now,
      xLastSuccessAt: now,
      xLastError: undefined,
      xLastErrorAt: undefined,
    });
    return null;
  },
});

type DigestInputs = {
  items: XPulseMetricItem[];
  followersNow: number | undefined;
  followersPrev: number | undefined;
};

export const digestInputs = internalQuery({
  args: { connectorId: v.id("connectors"), since: v.number() },
  handler: async (ctx, args): Promise<DigestInputs> => {
    const items = await ctx.db
      .query("xPulseItems")
      .withIndex("by_connector_id_and_source_created_at", (q) =>
        q.eq("connectorId", args.connectorId).gte("sourceCreatedAt", args.since),
      )
      .collect();
    const snapshots = await ctx.db
      .query("xPulseAccountSnapshots")
      .withIndex("by_connector_id_and_observed_at", (q) =>
        q.eq("connectorId", args.connectorId),
      )
      .order("desc")
      .take(50);
    const latest = snapshots[0] ?? null;
    const previous =
      snapshots.find(
        (snapshot) =>
          latest !== null &&
          snapshot.observedAt <= latest.observedAt - SNAPSHOT_LOOKBACK_MS,
      ) ?? snapshots[snapshots.length - 1] ?? null;
    return {
      items: items.map((item) => ({
        externalId: item.externalId,
        text: item.text,
        url: item.url,
        sourceCreatedAt: item.sourceCreatedAt,
        views: item.views,
        likes: item.likes,
        reposts: item.reposts,
        replies: item.replies,
        quotes: item.quotes,
        bookmarks: item.bookmarks,
      })),
      followersNow: latest?.followers,
      followersPrev: previous === latest ? undefined : previous?.followers,
    };
  },
});

export const publishDigest = internalMutation({
  args: {
    connectorId: v.id("connectors"),
    localDate: v.string(),
    title: v.string(),
    body: v.string(),
    summary: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ published: boolean; postId?: Id<"posts"> }> => {
    const connector = await ctx.db.get(args.connectorId);
    if (!connector?.orgId) return { published: false as const };
    // Re-check inside the transaction so two racing actions cannot double-post.
    if (connector.xLastDigestLocalDate === args.localDate) {
      return { published: false as const };
    }
    const agent = await ctx.db.get(connector.agentId);
    if (!agent) return { published: false as const };
    const space = connector.xDestinationSpaceId
      ? await ctx.db.get(connector.xDestinationSpaceId)
      : null;
    const validSpace =
      space && space.orgId === connector.orgId && !space.archivedAt
        ? space
        : null;

    const now = Date.now();
    const postId = await ctx.db.insert("posts", {
      orgId: connector.orgId,
      authorId: connector.agentId,
      title: args.title,
      body: args.body,
      space: validSpace?.name ?? "x pulse",
      spaceId: validSpace?._id,
      priority: "normal",
      pinned: false,
      createdAt: now,
      lastActivityAt: now,
      replyCount: 0,
      participantIds: [connector.agentId],
      summary: args.summary,
      summaryModel: "connector/x-pulse",
      summaryUpdatedAt: now,
    });
    await ctx.db.patch(args.connectorId, {
      xLastDigestAt: now,
      xLastDigestLocalDate: args.localDate,
    });
    const undigested = await ctx.db
      .query("xPulseItems")
      .withIndex("by_connector_id_and_digested_at", (q) =>
        q.eq("connectorId", args.connectorId).eq("digestedAt", undefined),
      )
      .collect();
    for (const item of undigested) {
      await ctx.db.patch(item._id, { digestedAt: now });
    }
    return { published: true as const, postId };
  },
});

async function collectForConnector(
  ctx: ActionCtx,
  configured: { connectorId: Id<"connectors">; handle: string },
): Promise<void> {
  const base = process.env.X_SYNC_API_BASE?.trim() || DEFAULT_API_BASE;
  try {
    const response = await fetch(
      `${base}/${encodeURIComponent(configured.handle)}?limit=${COLLECT_POST_LIMIT}`,
      { headers: { accept: "application/json" } },
    );
    if (!response.ok) {
      throw new Error(`X proxy responded ${response.status}.`);
    }
    const payload = (await response.json()) as ProxyProfilePayload;
    const posts = Array.isArray(payload.posts) ? payload.posts : [];
    const items = posts
      .filter(
        (post): post is ProxyStatus & { id: string; text: string; url: string } =>
          typeof post.id === "string" &&
          typeof post.text === "string" &&
          typeof post.url === "string" &&
          post.replying_to == null &&
          (post.author?.screen_name === undefined ||
            post.author.screen_name.toLowerCase() ===
              configured.handle.toLowerCase()),
      )
      .map((post) => ({
        externalId: post.id,
        text: post.text,
        url: post.url,
        sourceCreatedAt:
          typeof post.created_timestamp === "number"
            ? post.created_timestamp * 1000
            : Date.now(),
        views: post.views,
        likes: post.likes,
        reposts: post.reposts,
        replies: post.replies,
        quotes: post.quotes,
        bookmarks: post.bookmarks,
      }));
    await ctx.runMutation(internal.xPulse.recordObservations, {
      connectorId: configured.connectorId,
      followers: payload.profile?.followers,
      following: payload.profile?.following,
      items,
    });
  } catch (error) {
    await ctx.runMutation(internal.xPulse.recordObservations, {
      connectorId: configured.connectorId,
      items: [],
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<{ collected: number; digests: number }> => {
    const configured = await ctx.runQuery(internal.xPulse.listConfigured, {});
    if (configured.length === 0) {
      return { collected: 0, digests: 0 };
    }
    let digests = 0;
    const now = new Date();
    for (const connector of configured) {
      await collectForConnector(ctx, connector);

      const [releaseHour, releaseMinute] = connector.digestLocalTime
        .split(":")
        .map(Number);
      const releaseMinutes =
        (Number.isFinite(releaseHour) ? releaseHour : 9) * 60 +
        (Number.isFinite(releaseMinute) ? releaseMinute : 0);
      const localDate = localDateKey(now, connector.digestTimeZone);
      if (
        connector.lastDigestLocalDate === localDate ||
        minutesInTimeZone(now, connector.digestTimeZone) < releaseMinutes
      ) {
        continue;
      }
      const inputs = await ctx.runQuery(internal.xPulse.digestInputs, {
        connectorId: connector.connectorId,
        since: Date.now() - 24 * 60 * 60 * 1000,
      });
      const composed = composeXDigest({
        handle: connector.handle,
        localDate,
        followersNow: inputs.followersNow,
        followersPrev: inputs.followersPrev,
        items: inputs.items as XPulseMetricItem[],
      });
      const result = await ctx.runMutation(internal.xPulse.publishDigest, {
        connectorId: connector.connectorId,
        localDate,
        ...composed,
      });
      if (result.published) {
        digests += 1;
        logInfo("xPulse.digestPublished", {
          connectorId: connector.connectorId,
          postId: result.postId,
        });
      }
    }
    if (digests === 0) {
      logInfo("xPulse.collected", { connectors: configured.length });
    }
    return { collected: configured.length, digests };
  },
});
