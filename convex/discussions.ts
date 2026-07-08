import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { ensureViewerUser, getDefaultOrgId } from "./authUsers";
import { publicUser, type PublicUser } from "./users";

/**
 * Per-experiment "open discussion" threads.
 *
 * Unlike the rest of the app (a session-only overlay that never persists), the
 * flash-experiments discussion is a REAL Convex thread: reading is public, but
 * writing requires a shoo-authenticated identity (mirrors the voting flow in
 * `flashExperiments.ts`). Each experiment slug maps to exactly one backing post
 * (`posts.experimentSlug`), created on first use, with replies forming the
 * conversation via the normal post-replies workflow.
 */

const DISCUSSION_SPACE = "flow lab";

/** Find-or-create the single discussion post for an experiment slug. */
async function ensureThreadDoc(
  ctx: MutationCtx,
  slug: string,
  title: string,
  viewerId: Id<"users">,
): Promise<Id<"posts">> {
  const orgId = await getDefaultOrgId(ctx);
  const existing = await ctx.db
    .query("posts")
    .withIndex("by_org_id_and_experiment_slug", (q) =>
      q.eq("orgId", orgId).eq("experimentSlug", slug),
    )
    .first();
  if (existing) return existing._id;

  const now = Date.now();
  const postId = await ctx.db.insert("posts", {
    orgId,
    authorId: viewerId,
    title: `discussion · ${title}`,
    body: `open discussion for the "${title}" flash experiment. share what works, what doesn't, and what you'd change.`,
    space: DISCUSSION_SPACE,
    priority: "normal",
    pinned: false,
    createdAt: now,
    lastActivityAt: now,
    replyCount: 0,
    participantIds: [viewerId],
    experimentSlug: slug,
  });
  await ctx.db.insert("postReads", { orgId, userId: viewerId, postId, lastReadAt: now });
  return postId;
}

export type DiscussionReply = Doc<"replies"> & {
  author: PublicUser | null;
};

export type DiscussionThread = {
  post: (Doc<"posts"> & { author: PublicUser | null }) | null;
  replies: DiscussionReply[];
};

/** Public read: the full thread (post + flat, time-ordered replies). */
export const getThread = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }): Promise<DiscussionThread> => {
    const orgId = await getDefaultOrgId(ctx);
    const post = await ctx.db
      .query("posts")
      .withIndex("by_org_id_and_experiment_slug", (q) =>
        q.eq("orgId", orgId).eq("experimentSlug", slug),
      )
      .first();
    if (!post) return { post: null, replies: [] };

    const author = publicUser(await ctx.db.get(post.authorId));
    const replies = await ctx.db
      .query("replies")
      .withIndex("by_org_id_and_post_id_and_created_at", (q) =>
        q.eq("orgId", orgId).eq("postId", post._id),
      )
      .order("asc")
      .collect();

    const enriched = await Promise.all(
      replies.map(async (r) => ({
        ...r,
        author: publicUser(await ctx.db.get(r.authorId)),
      })),
    );
    return { post: { ...post, author }, replies: enriched };
  },
});

/** Public read: lightweight reply counts for the lab list (no thread body). */
export const listCounts = query({
  args: { slugs: v.array(v.string()) },
  handler: async (ctx, { slugs }) => {
    return await Promise.all(
      slugs.map(async (slug) => {
        const orgId = await getDefaultOrgId(ctx);
        const post = await ctx.db
          .query("posts")
          .withIndex("by_org_id_and_experiment_slug", (q) =>
            q.eq("orgId", orgId).eq("experimentSlug", slug),
          )
          .first();
        return { slug, replyCount: post?.replyCount ?? 0, exists: post !== null };
      }),
    );
  },
});

/** Auth-gated: create the discussion thread for an experiment (idempotent). */
export const ensureThread = mutation({
  args: { slug: v.string(), title: v.string() },
  handler: async (ctx, { slug, title }) => {
    const viewer = await ensureViewerUser(ctx, {
      unauthenticatedMessage: "Sign in to join the discussion.",
    });
    return await ensureThreadDoc(ctx, slug, title, viewer._id);
  },
});

/** Auth-gated: post a message (creating the thread on first use). */
export const addMessage = mutation({
  args: {
    slug: v.string(),
    title: v.string(),
    body: v.string(),
    parentId: v.optional(v.id("replies")),
  },
  handler: async (ctx, { slug, title, body, parentId }) => {
    const trimmed = body.trim();
    if (!trimmed) {
      throw new ConvexError({ code: "EMPTY", message: "Write something first." });
    }

    const viewer = await ensureViewerUser(ctx, {
      unauthenticatedMessage: "Sign in to join the discussion.",
    });
    const postId = await ensureThreadDoc(ctx, slug, title, viewer._id);

    if (parentId) {
      const parent = await ctx.db.get(parentId);
      if (!parent || parent.orgId !== viewer.orgId || parent.postId !== postId) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Parent reply not found." });
      }
    }

    const now = Date.now();
    const replyId = await ctx.db.insert("replies", {
      orgId: viewer.orgId,
      postId,
      parentId,
      authorId: viewer._id,
      body: trimmed,
      createdAt: now,
    });

    const post = await ctx.db.get(postId);
    if (post) {
      const participantIds = post.participantIds.includes(viewer._id)
        ? post.participantIds
        : [...post.participantIds, viewer._id];
      await ctx.db.patch(postId, {
        lastActivityAt: now,
        replyCount: post.replyCount + 1,
        participantIds,
      });
    }

    // The author has implicitly read the thread up to now.
    const read = await ctx.db
      .query("postReads")
      .withIndex("by_org_id_and_user_id_and_post_id", (q) =>
        q.eq("orgId", viewer.orgId).eq("userId", viewer._id).eq("postId", postId),
      )
      .unique();
    if (read) await ctx.db.patch(read._id, { lastReadAt: now });
    else
      await ctx.db.insert("postReads", {
        orgId: viewer.orgId,
        userId: viewer._id,
        postId,
        lastReadAt: now,
      });

    return replyId;
  },
});
