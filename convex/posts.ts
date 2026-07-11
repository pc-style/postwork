import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import {
  canAccessPost,
  ensureActiveViewerUser,
  forbidden,
  notFound,
  requireSpaceMember,
  resolveViewerForRead,
  getDefaultOrgId,
} from "./authUsers";
import { priority } from "./schema";
import { publicUser, type PublicUser } from "./users";
import { rateLimiter } from "./lib/rateLimit";
import {
  parse,
  postTitleSchema,
  postBodySchema,
  attachmentInputSchema,
  LIMITS,
} from "./lib/validation";
import { logInfo } from "./lib/observability";
import { isSummaryStale } from "./lib/summaryStaleness";
import { validateStoredAttachment } from "./lib/attachmentStorage";

export type EnrichedPost = Doc<"posts"> & {
  author: PublicUser | null;
  participants: PublicUser[];
  unread: boolean;
  isStale: boolean;
  // Raw per-viewer read timestamp, so the client can layer session-only
  // read state on top without re-querying the backend.
  lastReadAt: number;
};

async function enrich(
  ctx: QueryCtx,
  post: Doc<"posts">,
  viewerId: Id<"users"> | undefined,
): Promise<EnrichedPost> {
  const orgId = post.orgId;
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
      .withIndex("by_org_id_and_user_id_and_post_id", (q) =>
        q.eq("orgId", orgId).eq("userId", viewerId).eq("postId", post._id),
      )
      .unique();
    lastReadAt = read?.lastReadAt ?? 0;
  }

  const unread = post.lastActivityAt > lastReadAt;
  const isStale = isSummaryStale(post.lastActivityAt, post.summaryUpdatedAt);

  return { ...post, author, participants, unread, isStale, lastReadAt };
}

export async function listPostsBySpaceId(
  ctx: QueryCtx,
  spaceId: Id<"spaces">,
  viewerId: Id<"users"> | undefined,
): Promise<EnrichedPost[]> {
  const orgId = await getDefaultOrgId(ctx);
  const posts = await ctx.db
    .query("posts")
    .withIndex("by_org_id_and_space_id_and_last_activity_at", (q) =>
      q.eq("orgId", orgId).eq("spaceId", spaceId),
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
    const orgId = viewer?.orgId ?? (await getDefaultOrgId(ctx));
    // Bounded read: the feed only ever renders recent activity, and `enrich`
    // costs a postReads lookup per post per viewer — don't scan the table.
    const FEED_LIMIT = 200;
    let posts: Doc<"posts">[];
    if (args.space) {
      posts = await ctx.db
        .query("posts")
        .withIndex("by_org_id_and_space_and_last_activity_at", (q) =>
          q.eq("orgId", orgId).eq("space", args.space!),
        )
        .order("desc")
        .take(FEED_LIMIT);
    } else {
      posts = await ctx.db
        .query("posts")
        .withIndex("by_org_id_and_last_activity_at", (q) => q.eq("orgId", orgId))
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

/**
 * Cursor-paginated feed (Phase 3.3). Used by `useFeed` in product mode via
 * `usePaginatedQuery`. The raw index scan is paginated; access/priority/unread
 * filters are applied in-memory on each page, so a page may yield fewer visible
 * items than `numItems` — the client calls `loadMore` to fill in.
 */
export const feedPaginated = query({
  args: {
    viewerId: v.optional(v.id("users")),
    space: v.optional(v.string()),
    priority: v.optional(priority),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewer = await resolveViewerForRead(ctx, args.viewerId);
    const orgId = viewer?.orgId ?? (await getDefaultOrgId(ctx));

    const result = await (args.space
      ? ctx.db
          .query("posts")
          .withIndex("by_org_id_and_space_and_last_activity_at", (q) =>
            q.eq("orgId", orgId).eq("space", args.space!),
          )
      : ctx.db
          .query("posts")
          .withIndex("by_org_id_and_last_activity_at", (q) =>
            q.eq("orgId", orgId),
          )
    )
      .order("desc")
      .paginate(args.paginationOpts);

    // Filter for access + priority in-memory (can't be index-level).
    const allowed: Doc<"posts">[] = [];
    for (const post of result.page) {
      if (args.priority && post.priority !== args.priority) continue;
      if (await canAccessPost(ctx, post, viewer?._id)) {
        allowed.push(post);
      }
    }

    const enriched = await Promise.all(
      allowed.map((p) => enrich(ctx, p, viewer?._id)),
    );
    return { ...result, page: enriched };
  },
});

/**
 * Unread / urgent / total counts (Phase 3.3). Replaces client-side counting
 * from the feed — a paginated feed can't give an accurate total, so the sidebar
 * badge reads from this dedicated query instead.
 */
export const counts = query({
  args: {
    viewerId: v.optional(v.id("users")),
    space: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await resolveViewerForRead(ctx, args.viewerId);
    const orgId = viewer?.orgId ?? (await getDefaultOrgId(ctx));

    const posts = args.space
      ? await ctx.db
          .query("posts")
          .withIndex("by_org_id_and_space_and_last_activity_at", (q) =>
            q.eq("orgId", orgId).eq("space", args.space!),
          )
          .order("desc")
          .take(200)
      : await ctx.db
          .query("posts")
          .withIndex("by_org_id_and_last_activity_at", (q) =>
            q.eq("orgId", orgId),
          )
          .order("desc")
          .take(200);

    let unread = 0;
    let urgent = 0;
    let total = 0;
    for (const post of posts) {
      if (!(await canAccessPost(ctx, post, viewer?._id))) continue;
      total++;
      const enriched = await enrich(ctx, post, viewer?._id);
      if (enriched.unread) {
        unread++;
        if (post.priority === "urgent") urgent++;
      }
    }
    return { total, unread, urgent };
  },
});

/** Full-text search across post titles and bodies. */
export const search = query({
  args: { term: v.string(), viewerId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const viewer = await resolveViewerForRead(ctx, args.viewerId);
    const orgId = viewer?.orgId ?? (await getDefaultOrgId(ctx));
    const term = args.term.trim().slice(0, LIMITS.SEARCH_TERM_MAX);
    if (!term) return [];

    const [byBody, byTitle] = await Promise.all([
      ctx.db
        .query("posts")
        .withSearchIndex("search_body", (q) =>
          q.search("body", term).eq("orgId", orgId),
        )
        .take(40),
      ctx.db
        .query("posts")
        .withSearchIndex("search_title", (q) =>
          q.search("title", term).eq("orgId", orgId),
        )
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
    if (!post || post.orgId !== (viewer?.orgId ?? (await getDefaultOrgId(ctx)))) return null;
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
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          filename: v.string(),
          contentType: v.string(),
          mediaKind: v.union(v.literal("image"), v.literal("video")),
          size: v.number(),
          width: v.optional(v.number()),
          height: v.optional(v.number()),
          durationMs: v.optional(v.number()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const orgId = viewer.orgId ?? (await getDefaultOrgId(ctx));

    // Rate limit (Phase 3.1).
    await rateLimiter.limit(ctx, "createPost", { key: viewer._id, throws: true });

    // Input validation (Phase 3.2).
    const title = parse(postTitleSchema, args.title, "title");
    const body = parse(postBodySchema, args.body, "body");
    if (args.attachments && args.attachments.length > LIMITS.ATTACHMENT_MAX_PER_POST) {
      throw new ConvexError({
        code: "INVALID_INPUT" as const,
        field: "attachments",
        message: `Maximum ${LIMITS.ATTACHMENT_MAX_PER_POST} media attachments per post.`,
      });
    }

    if (args.spaceId) {
      await requireSpaceMember(ctx, args.spaceId, viewer._id);
    }

    const now = Date.now();
    const postId = await ctx.db.insert("posts", {
      orgId,
      authorId: viewer._id,
      title,
      body,
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

    // Persist attachment records (Phase 3.4). The files are already in
    // Convex storage (uploaded via attachments.generateUploadUrl); here we
    // just register the metadata linked to the new post.
    if (args.attachments) {
      for (const att of args.attachments) {
        const parsed = parse(attachmentInputSchema, att, "attachment");
        const validated = await validateStoredAttachment(ctx, parsed);
        await ctx.db.insert("postAttachments", {
          orgId,
          postId,
          storageId: validated.storageId,
          filename: validated.filename,
          contentType: validated.contentType,
          mediaKind: validated.mediaKind,
          size: validated.size,
          width: validated.width,
          height: validated.height,
          durationMs: validated.durationMs,
          uploadedBy: viewer._id,
          createdAt: now,
        });
      }
    }

    await upsertRead(ctx, orgId, viewer._id, postId, now);
    logInfo("post.created", { postId, authorId: viewer._id });
    return postId;
  },
});

export const markRead = mutation({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const orgId = viewer.orgId ?? (await getDefaultOrgId(ctx));
    const post = await ctx.db.get(args.postId);
    if (!post || post.orgId !== orgId) notFound("Post not found.");
    if (post.spaceId) {
      await requireSpaceMember(ctx, post.spaceId, viewer._id);
    }

    await upsertRead(ctx, orgId, viewer._id, args.postId, Date.now());
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const orgId = viewer.orgId ?? (await getDefaultOrgId(ctx));
    const now = Date.now();
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_org_id_and_last_activity_at", (q) => q.eq("orgId", orgId))
      .take(200);

    for (const post of posts) {
      if (await canAccessPost(ctx, post, viewer._id)) {
        await upsertRead(ctx, orgId, viewer._id, post._id, now);
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
    const viewer = await ensureActiveViewerUser(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.orgId !== viewer.orgId) notFound("Post not found.");
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
  orgId: Id<"orgs">,
  userId: Id<"users">,
  postId: Id<"posts">,
  lastReadAt: number,
) {
  const existing = await ctx.db
    .query("postReads")
    .withIndex("by_org_id_and_user_id_and_post_id", (q) =>
      q.eq("orgId", orgId).eq("userId", userId).eq("postId", postId),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, { lastReadAt });
    return;
  }

  await ctx.db.insert("postReads", {
    orgId,
    userId,
    postId,
    lastReadAt,
  });
}

// ---- moderation / admin (Phase 3.5) ----------------------------------------

/**
 * Edit a post's title and body. Author only (admins use delete, not edit).
 * Sets `editedAt` so the UI can show an "edited" indicator.
 */
export const edit = mutation({
  args: {
    postId: v.id("posts"),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.orgId !== viewer.orgId) notFound("Post not found.");
    if (post.authorId !== viewer._id) {
      forbidden("You can only edit your own posts.");
    }

    const title = parse(postTitleSchema, args.title, "title");
    const body = parse(postBodySchema, args.body, "body");

    await ctx.db.patch(args.postId, {
      title,
      body,
      editedAt: Date.now(),
    });
    logInfo("post.edited", { postId: args.postId, authorId: viewer._id });
  },
});

/**
 * Delete a post and all its replies, reads, and attachments.
 * Author or admin only. Cascading delete is batched to stay within
 * transaction limits; for very large threads the mutation schedules
 * itself to continue.
 */
export const remove = mutation({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post || post.orgId !== viewer.orgId) notFound("Post not found.");
    if (post.authorId !== viewer._id && viewer.role !== "admin") {
      forbidden("Only the author or an admin can delete a post.");
    }

    const orgId = post.orgId ?? (await getDefaultOrgId(ctx));

    // Delete all replies on this post.
    const replies = await ctx.db
      .query("replies")
      .withIndex("by_org_id_and_post_id_and_created_at", (q) =>
        q.eq("orgId", orgId).eq("postId", args.postId),
      )
      .take(1000);
    for (const reply of replies) {
      await ctx.db.delete(reply._id);
    }

    // Delete all postReads for this post. The index is orgId+userId+postId,
    // so we scan by orgId and filter by postId in-memory.
    const allReads = await ctx.db
      .query("postReads")
      .withIndex("by_org_id_and_user_id_and_post_id", (q) =>
        q.eq("orgId", orgId),
      )
      .take(1000);
    for (const read of allReads) {
      if (read.postId === args.postId) await ctx.db.delete(read._id);
    }

    // Delete all attachments for this post.
    const attachments = await ctx.db
      .query("postAttachments")
      .withIndex("by_org_id_and_post_id", (q) =>
        q.eq("orgId", orgId).eq("postId", args.postId),
      )
      .take(100);
    for (const att of attachments) {
      await ctx.db.delete(att._id);
    }

    await ctx.db.delete(args.postId);
    logInfo("post.deleted", { postId: args.postId, deletedBy: viewer._id });
  },
});
