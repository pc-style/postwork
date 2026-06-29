import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

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

// Deterministic warm-ish palette for auto-provisioned member avatars. Kept
// muted so it never competes with the page's single wine accent.
const AVATAR_PALETTE = [
  "#8c1862",
  "#b53a82",
  "#2e7d52",
  "#9a7d2e",
  "#3a6ea5",
  "#7d5ba6",
];

function unauthenticated(): never {
  throw new ConvexError({
    code: "UNAUTHENTICATED",
    message: "Sign in to join the discussion.",
  });
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/**
 * Resolve the shoo identity to a real `users` doc (created on first write).
 * Throws UNAUTHENTICATED when not signed in.
 */
async function getOrCreateViewer(ctx: MutationCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) unauthenticated();

  const existing = await ctx.db
    .query("users")
    .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
    .first();
  if (existing) return existing._id;

  const name =
    identity.name ??
    identity.nickname ??
    identity.preferredUsername ??
    identity.email ??
    "member";

  return await ctx.db.insert("users", {
    name,
    title: "community",
    avatarColor: colorFor(identity.subject),
    initials: initialsFrom(name),
    subject: identity.subject,
  });
}

/** Find-or-create the single discussion post for an experiment slug. */
async function ensureThreadDoc(
  ctx: MutationCtx,
  slug: string,
  title: string,
  viewerId: Id<"users">,
): Promise<Id<"posts">> {
  const existing = await ctx.db
    .query("posts")
    .withIndex("by_experiment_slug", (q) => q.eq("experimentSlug", slug))
    .first();
  if (existing) return existing._id;

  const now = Date.now();
  const postId = await ctx.db.insert("posts", {
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
  await ctx.db.insert("postReads", { userId: viewerId, postId, lastReadAt: now });
  return postId;
}

export type DiscussionReply = Doc<"replies"> & {
  author: Doc<"users"> | null;
};

export type DiscussionThread = {
  post: (Doc<"posts"> & { author: Doc<"users"> | null }) | null;
  replies: DiscussionReply[];
};

/** Public read: the full thread (post + flat, time-ordered replies). */
export const getThread = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }): Promise<DiscussionThread> => {
    const post = await ctx.db
      .query("posts")
      .withIndex("by_experiment_slug", (q) => q.eq("experimentSlug", slug))
      .first();
    if (!post) return { post: null, replies: [] };

    const author = await ctx.db.get(post.authorId);
    const replies = await ctx.db
      .query("replies")
      .withIndex("by_post", (q) => q.eq("postId", post._id))
      .order("asc")
      .collect();

    const enriched = await Promise.all(
      replies.map(async (r) => ({ ...r, author: await ctx.db.get(r.authorId) })),
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
        const post = await ctx.db
          .query("posts")
          .withIndex("by_experiment_slug", (q) => q.eq("experimentSlug", slug))
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
    const viewerId = await getOrCreateViewer(ctx);
    return await ensureThreadDoc(ctx, slug, title, viewerId);
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

    const viewerId = await getOrCreateViewer(ctx);
    const postId = await ensureThreadDoc(ctx, slug, title, viewerId);

    const now = Date.now();
    const replyId = await ctx.db.insert("replies", {
      postId,
      parentId,
      authorId: viewerId,
      body: trimmed,
      createdAt: now,
    });

    const post = await ctx.db.get(postId);
    if (post) {
      const participantIds = post.participantIds.includes(viewerId)
        ? post.participantIds
        : [...post.participantIds, viewerId];
      await ctx.db.patch(postId, {
        lastActivityAt: now,
        replyCount: post.replyCount + 1,
        participantIds,
      });
    }

    // The author has implicitly read the thread up to now.
    const read = await ctx.db
      .query("postReads")
      .withIndex("by_user_post", (q) =>
        q.eq("userId", viewerId).eq("postId", postId),
      )
      .unique();
    if (read) await ctx.db.patch(read._id, { lastReadAt: now });
    else
      await ctx.db.insert("postReads", {
        userId: viewerId,
        postId,
        lastReadAt: now,
      });

    return replyId;
  },
});
