import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  canAccessPost,
  ensureViewerUser,
  notFound,
  requireSpaceMember,
  resolveViewerForRead,
} from "./authUsers";
import { priority } from "./schema";
import { publicUser, type PublicUser } from "./users";

export type EnrichedPost = Doc<"posts"> & {
  author: PublicUser | null;
  participants: PublicUser[];
  unread: boolean;
  // Raw per-viewer read timestamp, so the client can layer session-only
  // read state on top without re-querying the backend.
  lastReadAt: number;
};

async function enrich(
  ctx: QueryCtx,
  post: Doc<"posts">,
  viewerId: Id<"users"> | undefined,
): Promise<EnrichedPost> {
  const author = publicUser(await ctx.db.get(post.authorId));
  const participants = (
    await Promise.all(post.participantIds.map((id) => ctx.db.get(id)))
  )
    .filter((u): u is Doc<"users"> => u !== null)
    .map((u) => publicUser(u));

  let lastReadAt = 0;
  if (viewerId) {
    const read = await ctx.db
      .query("postReads")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", viewerId).eq("postId", post._id),
      )
      .unique();
    lastReadAt = read?.lastReadAt ?? 0;
  }

  const unread = post.lastActivityAt > lastReadAt;

  return { ...post, author, participants, unread, lastReadAt };
}

export async function listPostsBySpaceId(
  ctx: QueryCtx,
  spaceId: Id<"spaces">,
  viewerId: Id<"users"> | undefined,
): Promise<EnrichedPost[]> {
  const posts = await ctx.db
    .query("posts")
    .withIndex("by_space_id_and_last_activity_at", (q) =>
      q.eq("spaceId", spaceId),
    )
    .order("desc")
    .take(200);

  const enriched = await Promise.all(posts.map((post) => enrich(ctx, post, viewerId)));
  enriched.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastActivityAt - a.lastActivityAt;
  });
  return enriched;
}

/** Activity-bumped feed with optional space / priority / unread filtering. */
export const feed = query({
  args: {
    viewerId: v.optional(v.id("users")),
    space: v.optional(v.string()),
    priority: v.optional(priority),
    onlyUnread: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const viewer = await resolveViewerForRead(ctx, args.viewerId);
    // Bounded read: the feed only ever renders recent activity, and `enrich`
    // costs a postReads lookup per post per viewer — don't scan the table.
    const FEED_LIMIT = 200;
    let posts: Doc<"posts">[];
    if (args.space) {
      posts = await ctx.db
        .query("posts")
        .withIndex("by_space", (q) => q.eq("space", args.space!))
        .order("desc")
        .take(FEED_LIMIT);
    } else {
      posts = await ctx.db
        .query("posts")
        .withIndex("by_activity")
        .order("desc")
        .take(FEED_LIMIT);
    }

    if (args.priority) {
      posts = posts.filter((p) => p.priority === args.priority);
    }

    const allowed: Doc<"posts">[] = [];
    for (const post of posts) {
      if (await canAccessPost(ctx, post, viewer?._id)) {
        allowed.push(post);
      }
    }

    // Pinned posts float to the top, then by activity.
    allowed.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.lastActivityAt - a.lastActivityAt;
    });

    let enriched = await Promise.all(
      allowed.map((p) => enrich(ctx, p, viewer?._id)),
    );
    if (args.onlyUnread) enriched = enriched.filter((p) => p.unread);
    return enriched;
  },
});

/** Full-text search across post titles and bodies. */
export const search = query({
  args: { term: v.string(), viewerId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const viewer = await resolveViewerForRead(ctx, args.viewerId);
    const term = args.term.trim();
    if (!term) return [];

    const [byBody, byTitle] = await Promise.all([
      ctx.db
        .query("posts")
        .withSearchIndex("search_body", (q) => q.search("body", term))
        .take(40),
      ctx.db
        .query("posts")
        .withSearchIndex("search_title", (q) => q.search("title", term))
        .take(40),
    ]);

    const seen = new Set<string>();
    const merged: Doc<"posts">[] = [];
    for (const p of [...byTitle, ...byBody]) {
      if (seen.has(p._id)) continue;
      seen.add(p._id);
      merged.push(p);
    }

    const allowed: Doc<"posts">[] = [];
    for (const post of merged) {
      if (await canAccessPost(ctx, post, viewer?._id)) {
        allowed.push(post);
      }
    }

    return await Promise.all(allowed.map((p) => enrich(ctx, p, viewer?._id)));
  },
});

export const get = query({
  args: { postId: v.id("posts"), viewerId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const viewer = await resolveViewerForRead(ctx, args.viewerId);
    const post = await ctx.db.get(args.postId);
    if (!post) return null;
    if (!(await canAccessPost(ctx, post, viewer?._id))) {
      return null;
    }
    return await enrich(ctx, post, viewer?._id);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    body: v.string(),
    space: v.string(),
    spaceId: v.optional(v.id("spaces")),
    priority: priority,
    wallOwnerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureViewerUser(ctx);
    if (args.spaceId) {
      await requireSpaceMember(ctx, args.spaceId, viewer._id);
    }

    const now = Date.now();
    const postId = await ctx.db.insert("posts", {
      authorId: viewer._id,
      title: args.title,
      body: args.body,
      space: args.space,
      spaceId: args.spaceId,
      priority: args.priority,
      pinned: false,
      createdAt: now,
      lastActivityAt: now,
      replyCount: 0,
      participantIds: [viewer._id],
      wallOwnerId: args.wallOwnerId,
    });

    await upsertRead(ctx, viewer._id, postId, now);
    return postId;
  },
});

export const markRead = mutation({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureViewerUser(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post) notFound("Post not found.");
    if (post.spaceId) {
      await requireSpaceMember(ctx, post.spaceId, viewer._id);
    }

    await upsertRead(ctx, viewer._id, args.postId, Date.now());
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await ensureViewerUser(ctx);
    const now = Date.now();
    const posts = await ctx.db.query("posts").withIndex("by_activity").take(200);

    for (const post of posts) {
      if (await canAccessPost(ctx, post, viewer._id)) {
        await upsertRead(ctx, viewer._id, post._id, now);
      }
    }
  },
});

export const storeSummary = mutation({
  args: {
    postId: v.id("posts"),
    summary: v.string(),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureViewerUser(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post) notFound("Post not found.");
    if (post.spaceId) {
      await requireSpaceMember(ctx, post.spaceId, viewer._id);
    }

    await ctx.db.patch(args.postId, {
      summary: args.summary,
      summaryModel: args.model,
      summaryUpdatedAt: Date.now(),
    });
  },
});

async function upsertRead(
  ctx: MutationCtx,
  userId: Id<"users">,
  postId: Id<"posts">,
  lastReadAt: number,
) {
  const existing = await ctx.db
    .query("postReads")
    .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", postId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, { lastReadAt });
    return;
  }

  await ctx.db.insert("postReads", {
    userId,
    postId,
    lastReadAt,
  });
}
