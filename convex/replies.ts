import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  canAccessPost,
  ensureViewerUser,
  getViewerFromAuth,
  notFound,
  requireSpaceMember,
} from "./authUsers";
import { publicUser, type PublicUser } from "./users";

export type EnrichedReply = Doc<"replies"> & {
  author: PublicUser | null;
};

/** Flat, time-ordered list of replies. The client assembles the nesting tree. */
export const listForPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args): Promise<EnrichedReply[]> => {
    const viewer = await getViewerFromAuth(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post) return [];
    if (!(await canAccessPost(ctx, post, viewer?._id))) {
      return [];
    }

    const replies = await ctx.db
      .query("replies")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .order("asc")
      .collect();

    return await Promise.all(
      replies.map(async (r) => ({
        ...r,
        author: publicUser(await ctx.db.get(r.authorId)),
      })),
    );
  },
});

export const create = mutation({
  args: {
    postId: v.id("posts"),
    body: v.string(),
    parentId: v.optional(v.id("replies")),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureViewerUser(ctx);
    const post = await ctx.db.get(args.postId);
    if (!post) notFound("Post not found.");
    if (post.spaceId) {
      await requireSpaceMember(ctx, post.spaceId, viewer._id);
    }

    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.postId !== args.postId) {
        notFound("Parent reply not found.");
      }
    }

    const now = Date.now();
    const replyId = await ctx.db.insert("replies", {
      postId: args.postId,
      parentId: args.parentId,
      authorId: viewer._id,
      body: args.body,
      createdAt: now,
    });

    const participantIds = post.participantIds.includes(viewer._id)
      ? post.participantIds
      : [...post.participantIds, viewer._id];

    // Bump the post to the top of the feed.
    await ctx.db.patch(args.postId, {
      lastActivityAt: now,
      replyCount: post.replyCount + 1,
      participantIds,
    });

    // The replier has implicitly read everything up to now.
    const existing = await ctx.db
      .query("postReads")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", viewer._id).eq("postId", args.postId),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, { lastReadAt: now });
    else
      await ctx.db.insert("postReads", {
        userId: viewer._id,
        postId: args.postId,
        lastReadAt: now,
      });

    return replyId;
  },
});
