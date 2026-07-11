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

export const agentTaskStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export const aiGenerationKind = v.union(
  v.literal("postSummary"),
  v.literal("agentTask"),
);

export default defineSchema({
  orgs: defineTable({
    name: v.string(),
    slug: v.string(),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),

  users: defineTable({
    orgId: v.optional(v.id("orgs")),
    name: v.string(),
    title: v.string(),
    avatarColor: v.string(),
    initials: v.string(),
    role: v.optional(v.union(v.literal("admin"), v.literal("member"))),
    status: v.optional(v.union(v.literal("pending"), v.literal("active"))),
    profileCompletedAt: v.optional(v.number()),
    avatarStorageId: v.optional(v.id("_storage")),
    avatarUrl: v.optional(v.string()),
    providerAvatarUrl: v.optional(v.string()),
    avatarRemoved: v.optional(v.boolean()),
    // AI coding agents (Cursor, Codex, Claude Code, …) post as teammates too.
    isAgent: v.optional(v.boolean()),
    // Set for real, shoo-authenticated members (maps the canonical auth token
    // identifier to a `users` doc so they can author posts/replies). Seed
    // personas leave this undefined. `subject` is retained only as legacy data.
    tokenIdentifier: v.optional(v.string()),
    subject: v.optional(v.string()),
    // Moderation: set when an admin deactivates a user. Deactivated users
    // cannot write; their existing content stays.
    deactivatedAt: v.optional(v.number()),
  })
    .index("by_org_id_and_token_identifier", ["orgId", "tokenIdentifier"])
    .index("by_org_id_and_subject", ["orgId", "subject"])
    .index("by_org_id_and_role", ["orgId", "role"]),

  spaces: defineTable({
    orgId: v.optional(v.id("orgs")),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_org_id_and_slug", ["orgId", "slug"]),

  spaceMemberships: defineTable({
    orgId: v.optional(v.id("orgs")),
    spaceId: v.id("spaces"),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org_id_and_space_id", ["orgId", "spaceId"])
    .index("by_org_id_and_user_id", ["orgId", "userId"])
    .index("by_org_id_and_space_id_and_user_id", ["orgId", "spaceId", "userId"]),

  posts: defineTable({
    orgId: v.optional(v.id("orgs")),
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
    // Moderation: set when the author (or admin) edits the post body/title.
    editedAt: v.optional(v.number()),
  })
    .index("by_org_id_and_last_activity_at", ["orgId", "lastActivityAt"])
    .index("by_org_id_and_space_and_last_activity_at", ["orgId", "space", "lastActivityAt"])
    .index("by_org_id_and_space_id_and_last_activity_at", ["orgId", "spaceId", "lastActivityAt"])
    .index("by_org_id_and_wall_owner_id_and_last_activity_at", ["orgId", "wallOwnerId", "lastActivityAt"])
    .index("by_org_id_and_experiment_slug", ["orgId", "experimentSlug"])
    .searchIndex("search_body", {
      searchField: "body",
      filterFields: ["orgId", "space", "priority"],
    })
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["orgId", "space", "priority"],
    }),

  replies: defineTable({
    orgId: v.optional(v.id("orgs")),
    postId: v.id("posts"),
    parentId: v.optional(v.id("replies")), // null/undefined = top-level reply
    authorId: v.id("users"),
    body: v.string(),
    createdAt: v.number(),
    // Moderation: set when the author edits the reply body.
    editedAt: v.optional(v.number()),
  })
    .index("by_org_id_and_post_id_and_created_at", ["orgId", "postId", "createdAt"])
    .index("by_org_id_and_parent_id", ["orgId", "parentId"]),

  postReads: defineTable({
    orgId: v.optional(v.id("orgs")),
    userId: v.id("users"),
    postId: v.id("posts"),
    lastReadAt: v.number(),
  }).index("by_org_id_and_user_id_and_post_id", ["orgId", "userId", "postId"]),

  // Stable, org-scoped outbound notification choices. In-app postReads remain
  // the canonical unread state; this row only controls projections of it.
  notificationPreferences: defineTable({
    orgId: v.id("orgs"),
    userId: v.id("users"),
    outboundEnabled: v.boolean(),
    immediateUrgentEnabled: v.boolean(),
    digestEnabled: v.boolean(),
    quietHoursEnabled: v.boolean(),
    quietHoursStart: v.string(),
    quietHoursEnd: v.string(),
    quietHoursTimeZone: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org_id_and_user_id", ["orgId", "userId"]),

  // Durable record of agent work requested from a post/reply. The task row is
  // machine state (status, links, errors); human-readable milestones/results
  // are still written back as normal replies by the agent user.
  agentTasks: defineTable({
    orgId: v.optional(v.id("orgs")),
    postId: v.id("posts"),
    sourceReplyId: v.optional(v.id("replies")),
    agentId: v.id("users"),
    requestedById: v.id("users"),
    status: agentTaskStatus,
    prompt: v.string(),
    result: v.optional(v.string()),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    resultReplyId: v.optional(v.id("replies")),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_org_id_and_post_id", ["orgId", "postId"])
    .index("by_org_id_and_agent_id_and_created_at", ["orgId", "agentId", "createdAt"])
    .index("by_org_id_and_created_at", ["orgId", "createdAt"]),

  // Org-level AI model choices. These are intentionally just model IDs; API
  // keys stay in Convex env vars. A setting row pins one generation path to an
  // OpenRouter model, while absence falls back to the deployment env provider.
  aiGenerationSettings: defineTable({
    orgId: v.optional(v.id("orgs")),
    kind: aiGenerationKind,
    modelId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedById: v.id("users"),
  }).index("by_org_id_and_kind", ["orgId", "kind"]),

  // Image and video attachments. Product mode only — the demo overlay can't
  // hold files. An attachment belongs to a post (replyId = undefined) or to a
  // specific reply (replyId set). postId is always set for org-scoping and to
  // fetch all attachments in a thread in one query.
  postAttachments: defineTable({
    orgId: v.optional(v.id("orgs")),
    postId: v.id("posts"),
    replyId: v.optional(v.id("replies")),
    storageId: v.id("_storage"),
    filename: v.string(),
    contentType: v.string(),
    // Optional for compatibility with existing image rows. All new writes set it.
    mediaKind: v.optional(v.union(v.literal("image"), v.literal("video"), v.literal("file"))),
    size: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    uploadedBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org_id_and_post_id", ["orgId", "postId"])
    .index("by_org_id_and_reply_id", ["orgId", "replyId"])
    .index("by_storage_id", ["storageId"]),

  // A generated attachment upload URL is bound to the authenticated member.
  // After the browser POST completes, its resulting storage ID is claimed here
  // before it can be attached to a post or reply.
  attachmentUploadTickets: defineTable({
    orgId: v.optional(v.id("orgs")),
    userId: v.id("users"),
    storageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_expires_at", ["expiresAt"])
    .index("by_storage_id", ["storageId"]),

  // Access control plane (invite + approval onboarding).
  //
  // invites: admin-minted codes. A code admits `maxUses` sign-ups (0 = ∞).
  // Revoking sets `revokedAt`; expiry is optional. Redemption is recorded by
  // bumping `usedCount` and audit-logging the redeemer.
  invites: defineTable({
    orgId: v.optional(v.id("orgs")),
    code: v.string(),
    note: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    maxUses: v.number(),
    usedCount: v.number(),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    // "Hot" invites are reserved for a specific person: a github handle or
    // email. On sign-in a pending user auto-claims a matching invite (no code
    // entry), and the code itself only redeems for the targeted identity.
    targetKind: v.optional(v.union(v.literal("github"), v.literal("email"))),
    targetValue: v.optional(v.string()),
  })
    .index("by_org_id_and_code", ["orgId", "code"])
    .index("by_org_id_and_created_at", ["orgId", "createdAt"])
    .index("by_org_id_and_target", ["orgId", "targetKind", "targetValue"]),

  // accessRequests: the "no invite? ask to join" path. Public mutation
  // creates a pending row; admins approve (which mints a single-use invite)
  // or deny. `email` is the join key shown to admins.
  accessRequests: defineTable({
    orgId: v.optional(v.id("orgs")),
    email: v.string(),
    name: v.optional(v.string()),
    message: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
    ),
    createdAt: v.number(),
    resolvedBy: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
    // set when approving: the invite minted for this requester
    inviteId: v.optional(v.id("invites")),
  })
    .index("by_org_id_and_status_and_created_at", ["orgId", "status", "createdAt"])
    .index("by_org_id_and_email", ["orgId", "email"]),

  // auditLog: append-only record of control-plane actions. `actorId` is
  // undefined for anonymous/public actions (e.g. an access request landing).
  auditLog: defineTable({
    orgId: v.optional(v.id("orgs")),
    actorId: v.optional(v.id("users")),
    action: v.string(), // e.g. "invite.created", "user.deactivated"
    targetType: v.optional(v.string()), // "user" | "invite" | "accessRequest" | …
    targetId: v.optional(v.string()),
    metadata: v.optional(v.string()), // JSON-encoded details
    createdAt: v.number(),
  }).index("by_org_id_and_created_at", ["orgId", "createdAt"]),

  flashExperimentVotes: defineTable({
    slug: v.string(),
    voterSubject: v.string(),
    vote: v.union(v.literal("up"), v.literal("down")),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_slug_voter", ["slug", "voterSubject"]),
});
