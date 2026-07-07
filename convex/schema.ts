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

export default defineSchema({
  users: defineTable({
    name: v.string(),
    title: v.string(),
    avatarColor: v.string(),
    initials: v.string(),
    role: v.optional(v.union(v.literal("admin"), v.literal("member"))),
    // AI coding agents (Cursor, Codex, Claude Code, …) post as teammates too.
    isAgent: v.optional(v.boolean()),
    // Set for real, shoo-authenticated members (maps the canonical auth token
    // identifier to a `users` doc so they can author posts/replies). Seed
    // personas leave this undefined. `subject` is retained only as legacy data.
    tokenIdentifier: v.optional(v.string()),
    subject: v.optional(v.string()),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_subject", ["subject"])
    .index("by_role", ["role"]),

  spaces: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),

  spaceMemberships: defineTable({
    spaceId: v.id("spaces"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_space_id", ["spaceId"])
    .index("by_user_id", ["userId"])
    .index("by_space_id_and_user_id", ["spaceId", "userId"]),

  posts: defineTable({
    authorId: v.id("users"),
    title: v.string(),
    body: v.string(),
    space: v.string(), // lightweight grouping label e.g. "Engineering", "Company"
    spaceId: v.optional(v.id("spaces")),
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
    // Group C — per-user walls. null/undefined = normal space post; set = a
    // post written on this user's wall.
    //
    // INVARIANT: a post is either a normal space post or a wall post, never both.
    // This is enforced at the write path (the session-overlay `createPost`,
    // which only ever sets `wallOwnerId`).
    wallOwnerId: v.optional(v.id("users")),
    // Flash-experiments discussion: when set, this post is the canonical
    // "open discussion" thread for the experiment with this slug. One post
    // per slug (enforced at the write path in `discussions.ts`).
    experimentSlug: v.optional(v.string()),
  })
    .index("by_activity", ["lastActivityAt"])
    .index("by_space", ["space", "lastActivityAt"])
    .index("by_space_id_and_last_activity_at", ["spaceId", "lastActivityAt"])
    .index("by_wall", ["wallOwnerId", "lastActivityAt"])
    .index("by_experiment_slug", ["experimentSlug"])
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

  flashExperimentVotes: defineTable({
    slug: v.string(),
    voterSubject: v.string(),
    vote: v.union(v.literal("up"), v.literal("down")),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_slug_voter", ["slug", "voterSubject"]),
});
