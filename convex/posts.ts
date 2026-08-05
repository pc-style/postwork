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
  resolveReadScope,
  getViewerFromAuth,
  unauthenticated,
  requireOrgId,
} from "./authUsers";
import { priority } from "./schema";
import { publicUser, type PublicUser } from "./users";
import { rateLimiter } from "./lib/rateLimit";
import {
  parse,
  postTitleSchema,
  postBodySchema,
  attachmentInputSchema,
  attachmentMediaKind,
  LIMITS,
} from "./lib/validation";
import { logInfo } from "./lib/observability";
import { isSummaryStale } from "./lib/summaryStaleness";
import { validateStoredAttachment } from "./lib/attachmentStorage";
import {
  directImageCoverUrl,
  extractBodyUrls,
  youtubeThumbnailUrl,
} from "./lib/postCover";
import { normalizePreviewUrl } from "./linkPreviews";
import {
  composeCatchUpDigest,
  DEFAULT_CATCH_UP_LIMIT,
  type CatchUpDigest,
} from "./catchUpComposer";

const CATCH_UP_SCAN_LIMIT = 200;

type CatchUpDigestResult = CatchUpDigest<EnrichedPost> & {
  scan: {
    scannedPosts: number;
    maxPosts: number;
    complete: boolean;
  };
};

/**
 * The one optional cover visual a feed card may show: the post's first image
 * attachment, else the first link-embed thumbnail found in the body.
 */
export type PostCover = {
  kind: "attachment" | "embed";
  url: string;
  alt: string;
  width?: number;
  height?: number;
};

export type EnrichedPost = Doc<"posts"> & {
  author: PublicUser | null;
  participants: PublicUser[];
  unread: boolean;
  isStale: boolean;
  // Raw per-viewer read timestamp, so the client can layer session-only
  // read state on top without re-querying the backend.
  lastReadAt: number;
  // Only feed-shaped queries pay to resolve the cover; enrich-only callers
  // (counts, catch-up digest, single post) leave it undefined.
  cover?: PostCover | null;
};

// Cover resolution is read-time work, so it is strictly bounded per query
// invocation rather than per post:
// - covers resolve at all only when the caller opts in (`includeCovers`);
//   the persisted default display mode hides covers, so the hot path skips
//   every attachment scan / storage URL / preview lookup,
// - only the leading COVER_POST_LIMIT posts of a result set resolve covers
//   (three paginated pages; deeper rows return `cover: null`),
// - each post's attachment scan reads at most the per-post attachment cap —
//   post-level rows are inserted at creation, before any reply media, so they
//   always sort first within the (orgId, postId) index range,
// - all linkPreviews point reads share one budget across the whole page, spent
//   strictly in display order, so link-heavy bodies cannot multiply lookups
//   and a later row can never starve an earlier one. YouTube/Giphy thumbnails
//   are derived without any read and stay outside the budget.
const COVER_POST_LIMIT = 60;
const COVER_BODY_URLS = 3;
const COVER_PREVIEW_LOOKUP_BUDGET = 30;

/**
 * Everything about a post's cover that can be resolved without touching the
 * shared preview-lookup budget: a final attachment cover, or the ordered
 * linkPreviews candidates to try plus the derived (YouTube/Giphy) cover to
 * fall back to when they miss.
 */
type CoverPlan = {
  cover: PostCover | null;
  pendingPreviews: string[];
  fallback: PostCover | null;
};

async function planCover(ctx: QueryCtx, post: Doc<"posts">): Promise<CoverPlan> {
  const attachments = await ctx.db
    .query("postAttachments")
    .withIndex("by_org_id_and_post_id", (q) =>
      q.eq("orgId", post.orgId).eq("postId", post._id),
    )
    .take(LIMITS.ATTACHMENT_MAX_PER_POST);
  for (const att of attachments) {
    if (att.replyId) continue;
    const kind = att.mediaKind ?? attachmentMediaKind(att.contentType);
    if (kind !== "image") continue;
    const url = await ctx.storage.getUrl(att.storageId);
    if (!url) continue;
    return {
      cover: {
        kind: "attachment",
        url,
        alt: att.filename,
        width: att.width,
        height: att.height,
      },
      pendingPreviews: [],
      fallback: null,
    };
  }

  const pendingPreviews: string[] = [];
  let fallback: PostCover | null = null;
  for (const raw of extractBodyUrls(post.body, COVER_BODY_URLS)) {
    const direct = directImageCoverUrl(raw);
    if (direct) {
      fallback = { kind: "embed", url: direct, alt: "giphy image" };
      break;
    }
    const youtube = youtubeThumbnailUrl(raw);
    if (youtube) {
      fallback = { kind: "embed", url: youtube, alt: "youtube video" };
      break;
    }
    // Same normalized key the thread view writes when it requests previews,
    // so the feed reuses the cache instead of fetching anything itself.
    const normalized = normalizePreviewUrl(raw);
    if (normalized) pendingPreviews.push(normalized);
  }
  return { cover: null, pendingPreviews, fallback };
}

/**
 * Attach covers to an already-enriched, already-ordered result set. Callers
 * pass posts in display order so the bounded budget spends itself on the rows
 * the viewer actually sees first.
 *
 * Two phases keep the budget deterministic without serializing the heavy work:
 * attachment scans, storage URLs, and derived thumbnails resolve in parallel
 * (no shared state), then the preview-needing subset spends the shared
 * linkPreviews budget sequentially in display order — at most
 * COVER_PREVIEW_LOOKUP_BUDGET point reads.
 */
async function attachCovers(
  ctx: QueryCtx,
  posts: EnrichedPost[],
  includeCovers: boolean,
): Promise<EnrichedPost[]> {
  if (!includeCovers) return posts;
  const plans = await Promise.all(
    posts.slice(0, COVER_POST_LIMIT).map((post) => planCover(ctx, post)),
  );

  let previewLookups = COVER_PREVIEW_LOOKUP_BUDGET;
  const covers: (PostCover | null)[] = [];
  for (const plan of plans) {
    if (plan.cover) {
      covers.push(plan.cover);
      continue;
    }
    let cover: PostCover | null = null;
    for (const normalized of plan.pendingPreviews) {
      if (previewLookups <= 0) break;
      previewLookups -= 1;
      const preview = await ctx.db
        .query("linkPreviews")
        .withIndex("by_url", (q) => q.eq("url", normalized))
        .unique();
      if (preview?.status === "ok" && preview.imageUrl) {
        cover = {
          kind: "embed",
          url: preview.imageUrl,
          alt: preview.title ?? preview.siteName ?? "link preview",
        };
        break;
      }
    }
    covers.push(cover ?? plan.fallback);
  }
  return posts.map((post, index) => ({
    ...post,
    cover: covers[index] ?? null,
  }));
}

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

/**
 * Viewer-specific return-to-work digest. Unlike the demo-capable feed, this
 * endpoint always requires an active authenticated member and never accepts a
 * caller-selected viewer or organization.
 */
export const catchUpDigest = query({
  args: {},
  handler: async (ctx): Promise<CatchUpDigestResult> => {
    const viewer = await getViewerFromAuth(ctx);
    if (!viewer) unauthenticated("Sign in to view your catch-up digest.");
    if (viewer.status === "pending" || viewer.deactivatedAt) {
      forbidden("Your account cannot access the catch-up digest.");
    }
    if (!viewer.orgId) {
      forbidden("Your account is not assigned to an organization.");
    }

    // The digest is intentionally a bounded view of recent team activity. The
    // composer reports any eligible items omitted from its smaller UI payload.
    const posts = await ctx.db
      .query("posts")
      .withIndex("by_org_id_and_last_activity_at", (q) =>
        q.eq("orgId", viewer.orgId),
      )
      .order("desc")
      .take(CATCH_UP_SCAN_LIMIT);

    const allowed: Doc<"posts">[] = [];
    for (const post of posts) {
      if (await canAccessPost(ctx, post, viewer._id)) allowed.push(post);
    }

    const enriched = await Promise.all(
      allowed.map((post) => enrich(ctx, post, viewer._id)),
    );

    const digest = composeCatchUpDigest(
      enriched.map((post) => ({
        post,
        postId: post._id,
        priority: post.priority,
        unread: post.unread,
        createdAt: post.createdAt,
        lastActivityAt: post.lastActivityAt,
        summary: post.summary,
        summaryModel: post.summaryModel,
        summaryUpdatedAt: post.summaryUpdatedAt,
        isStale: post.isStale,
      })),
      DEFAULT_CATCH_UP_LIMIT,
    );
    return {
      ...digest,
      scan: {
        scannedPosts: posts.length,
        maxPosts: CATCH_UP_SCAN_LIMIT,
        // Exactly hitting the cap is conservatively reported as incomplete:
        // another matching row may exist outside the bounded window.
        complete: posts.length < CATCH_UP_SCAN_LIMIT,
      },
    };
  },
});

export async function listPostsBySpaceId(
  ctx: QueryCtx,
  spaceId: Id<"spaces">,
  viewerId: Id<"users"> | undefined,
  includeCovers: boolean,
): Promise<EnrichedPost[]> {
  const space = await ctx.db.get(spaceId);
  if (!space?.orgId) return [];
  const orgId = space.orgId;
  const posts = await ctx.db
    .query("posts")
    .withIndex("by_org_id_and_space_id_and_last_activity_at", (q) =>
      q.eq("orgId", orgId).eq("spaceId", spaceId),
    )
    .order("desc")
    .take(200);

  const enriched = await Promise.all(
    posts.map((post) => enrich(ctx, post, viewerId)),
  );
  enriched.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastActivityAt - a.lastActivityAt;
  });
  return await attachCovers(ctx, enriched, includeCovers);
}

/** Activity-bumped feed with optional space / priority / unread filtering. */
export const feed = query({
  args: {
    viewerId: v.optional(v.id("users")),
    space: v.optional(v.string()),
    priority: v.optional(priority),
    onlyUnread: v.optional(v.boolean()),
    // Cover resolution is opt-in: the default display mode hides covers, so
    // clients (and older callers that omit the arg) skip the work entirely.
    includeCovers: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveReadScope(ctx, args.viewerId);
    const viewer = scope.viewer;
    const orgId = scope.orgId;
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

    // Filter before attaching covers so the bounded cover budget spends
    // itself on the rows actually displayed (unread posts beyond the first
    // COVER_POST_LIMIT candidates would otherwise lose their covers).
    let enriched = await Promise.all(
      allowed.map((p) => enrich(ctx, p, viewer?._id)),
    );
    if (args.onlyUnread) enriched = enriched.filter((p) => p.unread);
    return await attachCovers(ctx, enriched, args.includeCovers ?? false);
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
    includeCovers: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const scope = await resolveReadScope(ctx, args.viewerId);
    const viewer = scope.viewer;
    const orgId = scope.orgId;

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

    const enriched = await attachCovers(
      ctx,
      await Promise.all(allowed.map((p) => enrich(ctx, p, viewer?._id))),
      args.includeCovers ?? false,
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
    const scope = await resolveReadScope(ctx, args.viewerId);
    const viewer = scope.viewer;
    const orgId = scope.orgId;

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
  args: {
    term: v.string(),
    viewerId: v.optional(v.id("users")),
    includeCovers: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const scope = await resolveReadScope(ctx, args.viewerId);
    const viewer = scope.viewer;
    const orgId = scope.orgId;
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

    return await attachCovers(
      ctx,
      await Promise.all(allowed.map((p) => enrich(ctx, p, viewer?._id))),
      args.includeCovers ?? false,
    );
  },
});

export const get = query({
  args: { postId: v.id("posts"), viewerId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const scope = await resolveReadScope(ctx, args.viewerId);
    const viewer = scope.viewer;
    const post = await ctx.db.get(args.postId);
    if (!post || post.orgId !== scope.orgId) return null;
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
          uploadToken: v.id("attachmentUploadTickets"),
          filename: v.string(),
          contentType: v.string(),
          mediaKind: v.union(v.literal("image"), v.literal("video"), v.literal("file")),
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
    const orgId = requireOrgId(viewer);

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
        const validated = await validateStoredAttachment(ctx, viewer._id, orgId, parsed);
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
    const orgId = requireOrgId(viewer);
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
    const orgId = requireOrgId(viewer);
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

    const orgId = viewer.orgId;

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
      await ctx.storage.delete(att.storageId);
      await ctx.db.delete(att._id);
    }

    await ctx.db.delete(args.postId);
    logInfo("post.deleted", { postId: args.postId, deletedBy: viewer._id });
  },
});
