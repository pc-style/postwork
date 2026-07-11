import { query, mutation, internalMutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  canAccessPost,
  ensureActiveViewerUser,
  forbidden,
  notFound,
  requireSpaceMember,
  resolveViewerForRead,
  getDefaultOrgId,
} from "./authUsers";
import { publicUser, type PublicUser } from "./users";
import { rateLimiter } from "./lib/rateLimit";
import {
  parse,
  replyBodySchema,
  attachmentInputSchema,
  LIMITS,
} from "./lib/validation";
import { logInfo } from "./lib/observability";
import { validateStoredAttachment } from "./lib/attachmentStorage";

export type EnrichedReply = Doc<"replies"> & {
  author: PublicUser | null;
  unread: boolean;
  // The parent post's per-viewer read watermark. The client combines this with
  // demo-only session reads so collapsed branches can reliably surface new work.
  lastReadAt: number;
};

async function enrichReplies(
  ctx: QueryCtx,
  post: Doc<"posts">,
  replies: Doc<"replies">[],
  viewerId: Id<"users"> | undefined,
): Promise<EnrichedReply[]> {
  let lastReadAt = 0;
  if (viewerId) {
    const read = await ctx.db
      .query("postReads")
      .withIndex("by_org_id_and_user_id_and_post_id", (q) =>
        q.eq("orgId", post.orgId).eq("userId", viewerId).eq("postId", post._id),
      )
      .unique();
    lastReadAt = read?.lastReadAt ?? 0;
  }

  return await Promise.all(
    replies.map(async (reply) => ({
      ...reply,
      author: publicUser(await ctx.db.get(reply.authorId)),
      unread: reply.createdAt > lastReadAt,
      lastReadAt,
    })),
  );
}

async function insertReplyAndBumpPost(
  ctx: MutationCtx,
  args: {
    orgId: Id<"orgs"> | undefined;
    post: Doc<"posts">;
    authorId: Id<"users">;
    body: string;
    parentId?: Id<"replies">;
  },
): Promise<Id<"replies">> {
  const now = Date.now();
  const replyId = await ctx.db.insert("replies", {
    orgId: args.orgId,
    postId: args.post._id,
    parentId: args.parentId,
    authorId: args.authorId,
    body: args.body,
    createdAt: now,
  });

  const participantIds = args.post.participantIds.includes(args.authorId)
    ? args.post.participantIds
    : [...args.post.participantIds, args.authorId];

  await ctx.db.patch(args.post._id, {
    lastActivityAt: now,
    replyCount: args.post.replyCount + 1,
    participantIds,
  });

  return replyId;
}

/** Flat, time-ordered list of replies. The client assembles the nesting tree. */
export const listForPost = query({
  args: {
    postId: v.id("posts"),
    viewerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<EnrichedReply[]> => {
    const viewer = await resolveViewerForRead(ctx, args.viewerId);
    const post = await ctx.db.get(args.postId);
    if (!post) return [];
    if (!(await canAccessPost(ctx, post, viewer?._id))) {
      return [];
    }

    const replies = await ctx.db
      .query("replies")
      .withIndex("by_org_id_and_post_id_and_created_at", (q) =>
        q.eq("orgId", post.orgId).eq("postId", args.postId),
      )
      .order("asc")
      .collect();

    return await enrichReplies(ctx, post, replies, viewer?._id);
  },
});

/**
 * Cursor-paginated replies (Phase 3.3). Ordered ascending by creation time so
 * the first page is the oldest replies (the top of the thread). `loadMore`
 * fetches the next batch chronologically.
 */
export const listForPostPaginated = query({
  args: {
    postId: v.id("posts"),
    viewerId: v.optional(v.id("users")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewer = await resolveViewerForRead(ctx, args.viewerId);
    const post = await ctx.db.get(args.postId);
    if (!post || !(await canAccessPost(ctx, post, viewer?._id))) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("replies")
      .withIndex("by_org_id_and_post_id_and_created_at", (q) =>
        q.eq("orgId", post.orgId).eq("postId", args.postId),
      )
      .order("asc")
      .paginate(args.paginationOpts);

    const page = await enrichReplies(ctx, post, result.page, viewer?._id);
    return { ...result, page };
  },
});

export const create = mutation({
  args: {
    postId: v.id("posts"),
    body: v.string(),
    parentId: v.optional(v.id("replies")),
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
    const post = await ctx.db.get(args.postId);
    if (!post || post.orgId !== viewer.orgId) notFound("Post not found.");
    if (post.spaceId) {
      await requireSpaceMember(ctx, post.spaceId, viewer._id);
    }

    // Rate limit (Phase 3.1).
    await rateLimiter.limit(ctx, "createReply", { key: viewer._id, throws: true });

    // Input validation (Phase 3.2).
    const body = parse(replyBodySchema, args.body, "body");
    if (args.attachments && args.attachments.length > LIMITS.ATTACHMENT_MAX_PER_POST) {
      throw new ConvexError({
        code: "INVALID_INPUT" as const,
        field: "attachments",
        message: `Maximum ${LIMITS.ATTACHMENT_MAX_PER_POST} media attachments per reply.`,
      });
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.orgId !== viewer.orgId || parent.postId !== args.postId) {
        notFound("Parent reply not found.");
      }
    }

    const replyId = await insertReplyAndBumpPost(ctx, {
      orgId: viewer.orgId,
      post,
      parentId: args.parentId,
      authorId: viewer._id,
      body,
    });
    const now = Date.now();

    // Persist attachment records (Phase 3.4).
    if (args.attachments) {
      for (const att of args.attachments) {
        const parsed = parse(attachmentInputSchema, att, "attachment");
        const validated = await validateStoredAttachment(ctx, parsed);
        await ctx.db.insert("postAttachments", {
          orgId: viewer.orgId,
          postId: args.postId,
          replyId,
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

    // The replier has implicitly read everything up to now.
    const existing = await ctx.db
      .query("postReads")
      .withIndex("by_org_id_and_user_id_and_post_id", (q) =>
        q.eq("orgId", viewer.orgId).eq("userId", viewer._id).eq("postId", args.postId),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, { lastReadAt: now });
    else
      await ctx.db.insert("postReads", {
        orgId: viewer.orgId,
        userId: viewer._id,
        postId: args.postId,
        lastReadAt: now,
      });

    logInfo("reply.created", { replyId, postId: args.postId, authorId: viewer._id });
    return replyId;
  },
});

export const createAsAgent = internalMutation({
  args: {
    postId: v.id("posts"),
    body: v.string(),
    authorId: v.id("users"),
    parentId: v.optional(v.id("replies")),
  },
  handler: async (ctx, args) => {
    const author = await ctx.db.get(args.authorId);
    if (!author?.isAgent) notFound("Agent not found.");

    const post = await ctx.db.get(args.postId);
    if (!post || post.orgId !== author.orgId) notFound("Post not found.");

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.orgId !== author.orgId || parent.postId !== args.postId) {
        notFound("Parent reply not found.");
      }
    }

    const body = parse(replyBodySchema, args.body, "body");
    const replyId = await insertReplyAndBumpPost(ctx, {
      orgId: author.orgId,
      post,
      parentId: args.parentId,
      authorId: args.authorId,
      body,
    });
    logInfo("reply.agentCreated", {
      replyId,
      postId: args.postId,
      authorId: args.authorId,
    });
    return replyId;
  },
});

// ---- moderation / admin (Phase 3.5) ----------------------------------------

/** Edit a reply's body. Author only. Sets `editedAt`. */
export const edit = mutation({
  args: {
    replyId: v.id("replies"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const reply = await ctx.db.get(args.replyId);
    if (!reply || reply.orgId !== viewer.orgId) notFound("Reply not found.");
    if (reply.authorId !== viewer._id) {
      forbidden("You can only edit your own replies.");
    }

    const body = parse(replyBodySchema, args.body, "body");

    await ctx.db.patch(args.replyId, {
      body,
      editedAt: Date.now(),
    });
    logInfo("reply.edited", { replyId: args.replyId, authorId: viewer._id });
  },
});

/**
 * Delete a reply and its child replies (recursive). Author or admin only.
 * Decrements the parent post's replyCount.
 */
export const remove = mutation({
  args: { replyId: v.id("replies") },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const reply = await ctx.db.get(args.replyId);
    if (!reply || reply.orgId !== viewer.orgId) notFound("Reply not found.");
    if (reply.authorId !== viewer._id && viewer.role !== "admin") {
      forbidden("Only the author or an admin can delete a reply.");
    }

    const postId = reply.postId;
    const orgId = reply.orgId ?? (await getDefaultOrgId(ctx));

    // Recursively collect child reply ids (BFS).
    const toDelete: Id<"replies">[] = [args.replyId];
    let frontier: Id<"replies">[] = [args.replyId];
    while (frontier.length > 0) {
      const children: Id<"replies">[] = [];
      for (const parentId of frontier) {
        const kids = await ctx.db
          .query("replies")
          .withIndex("by_org_id_and_parent_id", (q) =>
            q.eq("orgId", orgId).eq("parentId", parentId),
          )
          .take(100);
        for (const kid of kids) children.push(kid._id);
      }
      toDelete.push(...children);
      frontier = children;
    }

    // Delete all collected replies + their attachments.
    let deletedCount = 0;
    for (const id of toDelete) {
      const atts = await ctx.db
        .query("postAttachments")
        .withIndex("by_org_id_and_reply_id", (q) =>
          q.eq("orgId", orgId).eq("replyId", id),
        )
        .take(20);
      for (const att of atts) await ctx.db.delete(att._id);
      await ctx.db.delete(id);
      deletedCount++;
    }

    // Decrement the post's replyCount.
    const post = await ctx.db.get(postId);
    if (post) {
      await ctx.db.patch(postId, {
        replyCount: Math.max(0, post.replyCount - deletedCount),
      });
    }

    logInfo("reply.deleted", {
      replyId: args.replyId,
      deletedBy: viewer._id,
      cascadeCount: deletedCount,
    });
  },
});
