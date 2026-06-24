import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Postwork data model — posts are the top-level unit (not channels).
 *
 *   users      → team members (in-app switcher, no real auth for the MVP)
 *   posts      → top-level threads. Bumped via `lastActivityAt`.
 *   replies    → nested replies (self-referential via `parentId`)
 *   postReads  → per-user read state, drives unread badges
 */
export const priority = v.union(
  v.literal("urgent"),
  v.literal("high"),
  v.literal("normal"),
);

/** Lifecycle of an agent investigation task (Group A). */
export const agentTaskStatus = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
);

/** Who can see a post inside a (possibly cross-org) space (Group B). */
export const postVisibility = v.union(
  v.literal("space"), // everyone in the space (all linked orgs)
  v.literal("org"), // only the author's own org
  v.literal("public"),
);

export default defineSchema({
  users: defineTable({
    name: v.string(),
    title: v.string(),
    avatarColor: v.string(),
    initials: v.string(),
    // AI coding agents (Cursor, Codex, Claude Code, …) post as teammates too.
    isAgent: v.optional(v.boolean()),
  }),

  posts: defineTable({
    authorId: v.id("users"),
    title: v.string(),
    body: v.string(),
    space: v.string(), // lightweight grouping label e.g. "Engineering", "Company"
    priority: priority,
    pinned: v.boolean(),
    createdAt: v.number(),
    lastActivityAt: v.number(), // activity bumping sort key
    replyCount: v.number(),
    participantIds: v.array(v.id("users")),
    // Agent-summary slot:
    summary: v.optional(v.string()),
    summaryModel: v.optional(v.string()),
    summaryUpdatedAt: v.optional(v.number()),
    // Group B — intercompany shared spaces. When set, the post belongs to a
    // structured space (which may span multiple orgs) instead of the legacy
    // free-text `space` label. `visibility` is meaningful only alongside
    // `spaceId` (it scopes cross-org readers); the two travel together.
    spaceId: v.optional(v.id("spaces")),
    visibility: v.optional(postVisibility),
    // Group C — per-user walls. null/undefined = normal space post; set = a
    // post written on this user's wall.
    //
    // INVARIANT: `spaceId` and `wallOwnerId` are mutually exclusive — a post is
    // either a space post or a wall post, never both. Convex validators can't
    // express cross-field constraints, so this is enforced at the write path
    // (the session-overlay `createPost`, which only ever sets `wallOwnerId`).
    wallOwnerId: v.optional(v.id("users")),
  })
    .index("by_activity", ["lastActivityAt"])
    .index("by_space", ["space", "lastActivityAt"])
    .index("by_space_id", ["spaceId", "lastActivityAt"])
    .index("by_wall", ["wallOwnerId", "lastActivityAt"])
    .searchIndex("search_body", {
      searchField: "body",
      filterFields: ["space", "priority"],
    })
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["space", "priority"],
    }),

  replies: defineTable({
    postId: v.id("posts"),
    parentId: v.optional(v.id("replies")), // null/undefined = top-level reply
    authorId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
  })
    .index("by_post", ["postId", "createdAt"])
    .index("by_parent", ["parentId"]),

  postReads: defineTable({
    userId: v.id("users"),
    postId: v.id("posts"),
    lastReadAt: v.number(),
  }).index("by_user_post", ["userId", "postId"]),

  // ---- Group A: agent control plane ---------------------------------------
  // A teammate dispatches an AI coding agent to investigate a post/subthread;
  // the agent reports back (status + result, and a nested reply on completion).
  agentTasks: defineTable({
    postId: v.id("posts"),
    sourceReplyId: v.optional(v.id("replies")), // subthread the agent explores
    agentId: v.id("users"), // the agent teammate (isAgent user)
    requestedById: v.optional(v.id("users")),
    status: agentTaskStatus,
    prompt: v.string(),
    result: v.optional(v.string()),
    model: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_post", ["postId"])
    .index("by_agent", ["agentId"])
    .index("by_status", ["status"]),

  // ---- Group B: intercompany shared spaces --------------------------------
  // `handle` must be unique (it's the @handle used for invites); `by_handle`
  // backs both lookups and the overlay's resolve-or-create dedup.
  orgs: defineTable({
    name: v.string(),
    handle: v.string(), // @handle used to invite an external org
    initials: v.string(),
    color: v.string(),
  }).index("by_handle", ["handle"]),

  // `slug` must be unique (it's the /spaces/$slug route key); the overlay's
  // createSpace de-duplicates slugs on write.
  spaces: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    ownerOrgId: v.id("orgs"),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),

  // At most one membership per (spaceId, orgId); `by_space_org` backs that
  // uniqueness check (the overlay's inviteOrg rejects duplicates).
  spaceMemberships: defineTable({
    spaceId: v.id("spaces"),
    orgId: v.id("orgs"),
    role: v.union(v.literal("owner"), v.literal("member")),
    status: v.union(
      v.literal("active"),
      v.literal("invited"),
      v.literal("declined"),
    ),
    createdAt: v.number(),
  })
    .index("by_space", ["spaceId"])
    .index("by_org", ["orgId"])
    .index("by_space_org", ["spaceId", "orgId"]),
});
