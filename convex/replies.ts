import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { publicUser, type PublicUser } from "./users";

export type EnrichedReply = Doc<"replies"> & {
  author: PublicUser | null;
};

/** Flat, time-ordered list of replies. The client assembles the nesting tree. */
export const listForPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args): Promise<EnrichedReply[]> => {
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
    authorId: v.id("users"),
    body: v.string(),
    parentId: v.optional(v.id("replies")),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");

    const now = Date.now();
    const replyId = await ctx.db.insert("replies", {
      postId: args.postId,
      parentId: args.parentId,
      authorId: args.authorId,
      body: args.body,
      createdAt: now,
    });

    const participantIds = post.participantIds.includes(args.authorId)
      ? post.participantIds
      : [...post.participantIds, args.authorId];

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
        q.eq("userId", args.authorId).eq("postId", args.postId),
      )
      .unique();
    if (existing) await ctx.db.patch(existing._id, { lastReadAt: now });
    else
      await ctx.db.insert("postReads", {
        userId: args.authorId,
        postId: args.postId,
        lastReadAt: now,
      });

    return replyId;
  },
});
