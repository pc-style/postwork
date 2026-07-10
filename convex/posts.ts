import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
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

/** Activity-bumped feed with optional space / priority / unread filtering. */
export const feed = query({
  args: {
    viewerId: v.optional(v.id("users")),
    space: v.optional(v.string()),
    priority: v.optional(priority),
    onlyUnread: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
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

    // Pinned posts float to the top, then by activity.
    posts.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.lastActivityAt - a.lastActivityAt;
    });

    let enriched = await Promise.all(
      posts.map((p) => enrich(ctx, p, args.viewerId)),
    );
    if (args.onlyUnread) enriched = enriched.filter((p) => p.unread);
    return enriched;
  },
});

/** Full-text search across post titles and bodies. */
export const search = query({
  args: { term: v.string(), viewerId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
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

    return await Promise.all(merged.map((p) => enrich(ctx, p, args.viewerId)));
  },
});

export const get = query({
  args: { postId: v.id("posts"), viewerId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) return null;
    return await enrich(ctx, post, args.viewerId);
  },
});

// NOTE: write paths (create post / reply / mark read) intentionally have no
// public Convex mutations here. Visitor writes live in the client's
// session-only overlay (`src/lib/store.tsx`); the shared demo DB stays
// read-only. The auth-gated exception is `discussions.ts`.
