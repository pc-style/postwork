import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { PRODUCT_ORG_NAME, PRODUCT_ORG_SLUG, notFound } from "./authUsers";

export const ensureProductOrg = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("orgs").withIndex("by_slug", (q) => q.eq("slug", PRODUCT_ORG_SLUG)).unique();
    if (existing) return existing._id;
    return await ctx.db.insert("orgs", { name: PRODUCT_ORG_NAME, slug: PRODUCT_ORG_SLUG, createdAt: Date.now() });
  },
});

export const activateFirstProductAdmin = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const org = await ctx.db.query("orgs").withIndex("by_slug", (q) => q.eq("slug", PRODUCT_ORG_SLUG)).unique();
    if (!org) notFound("Product organization not found. Run migrations:ensureProductOrg first.");
    const admins = await ctx.db.query("users").withIndex("by_org_id_and_role", (q) => q.eq("orgId", org._id).eq("role", "admin")).collect();
    if (admins.some((user) => user.status === "active" && !user.deactivatedAt)) return { activated: false as const };
    const user = await ctx.db.get(args.userId);
    if (!user || user.orgId !== org._id || !user.tokenIdentifier || user.isAgent) {
      notFound("Specified Clerk product user not found.");
    }
    await ctx.db.patch(user._id, { role: "admin", status: "active", deactivatedAt: undefined });
    await ctx.db.insert("auditLog", {
      orgId: org._id,
      actorId: user._id,
      action: "product.first_admin_activated",
      targetType: "user",
      targetId: user._id,
      createdAt: Date.now(),
    });
    return { activated: true as const };
  },
});

/**
 * Additive multi-workspace rollout: create an orgMemberships row for every
 * user that only has legacy org fields. Idempotent — safe to re-run.
 */
export const backfillOrgMemberships = internalMutation({
  args: {},
  handler: async (ctx) => {
    let created = 0;
    let skipped = 0;
    for (const user of await ctx.db.query("users").collect()) {
      if (!user.orgId) {
        skipped += 1;
        continue;
      }
      const existing = await ctx.db
        .query("orgMemberships")
        .withIndex("by_org_id_and_user_id", (q) =>
          q.eq("orgId", user.orgId!).eq("userId", user._id),
        )
        .unique();
      if (existing) {
        skipped += 1;
        continue;
      }
      const now = Date.now();
      await ctx.db.insert("orgMemberships", {
        orgId: user.orgId,
        userId: user._id,
        role: user.role ?? "member",
        status: user.status ?? "active",
        deactivatedAt: user.deactivatedAt,
        createdAt: now,
        updatedAt: now,
      });
      created += 1;
    }
    return { created, skipped };
  },
});

/**
 * Delete agent tasks whose post is missing or belongs to another org —
 * broken references from early testing. Idempotent.
 */
export const repairCrossOrgAgentTasks = internalMutation({
  args: {},
  handler: async (ctx) => {
    let deleted = 0;
    for (const row of await ctx.db.query("agentTasks").collect()) {
      const post = await ctx.db.get(row.postId);
      if (!post || post.orgId !== row.orgId) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }
    return { deleted };
  },
});

export const auditTenantOwnership = internalQuery({
  args: {},
  handler: async (ctx) => {
    const missingOrg: string[] = [];
    const crossOrg: string[] = [];
    // Membership-aware "does this user belong to this org" — the membership
    // row is authoritative; legacy users.orgId covers seed/agent rows.
    const userInOrg = async (
      userId: Id<"users">,
      orgId: Id<"orgs"> | undefined,
    ): Promise<boolean> => {
      if (!orgId) return false;
      const user = await ctx.db.get(userId);
      if (!user) return false;
      if (user.orgId === orgId) return true;
      const membership = await ctx.db
        .query("orgMemberships")
        .withIndex("by_org_id_and_user_id", (q) =>
          q.eq("orgId", orgId).eq("userId", userId),
        )
        .unique();
      return membership !== null;
    };
    for (const table of ["users", "spaces", "spaceMemberships", "posts", "replies", "postReads", "notificationPreferences", "notificationDeliveries", "agentTasks", "connectors", "connectorEvents", "aiGenerationSettings", "postAttachments", "attachmentUploadTickets", "invites", "accessRequests", "auditLog"] as const) {
      for (const row of await ctx.db.query(table).collect()) {
        if (row.orgId) continue;
        // Auth-created accounts legitimately start org-less until an invite
        // or domain join places them.
        if (table === "users") {
          const user = row as Doc<"users">;
          if (user.tokenIdentifier !== undefined) continue;
        }
        missingOrg.push(`${table}:${row._id}`);
      }
    }
    for (const row of await ctx.db.query("posts").collect()) {
      const author = await ctx.db.get(row.authorId);
      const space = row.spaceId ? await ctx.db.get(row.spaceId) : null;
      if (!author || !(await userInOrg(row.authorId, row.orgId))) crossOrg.push(`posts:${row._id}:authorId`);
      if (row.spaceId && (!space || space.orgId !== row.orgId)) crossOrg.push(`posts:${row._id}:spaceId`);
      for (const participantId of row.participantIds) {
        if (!(await userInOrg(participantId, row.orgId))) crossOrg.push(`posts:${row._id}:participantIds`);
      }
    }
    for (const row of await ctx.db.query("replies").collect()) {
      const post = await ctx.db.get(row.postId);
      const parent = row.parentId ? await ctx.db.get(row.parentId) : null;
      if (!post || post.orgId !== row.orgId) crossOrg.push(`replies:${row._id}:postId`);
      if (!(await userInOrg(row.authorId, row.orgId))) crossOrg.push(`replies:${row._id}:authorId`);
      if (row.parentId && (!parent || parent.orgId !== row.orgId || parent.postId !== row.postId)) crossOrg.push(`replies:${row._id}:parentId`);
    }
    for (const row of await ctx.db.query("spaceMemberships").collect()) {
      const space = await ctx.db.get(row.spaceId);
      if (!space || space.orgId !== row.orgId) crossOrg.push(`spaceMemberships:${row._id}:spaceId`);
      if (!(await userInOrg(row.userId, row.orgId))) crossOrg.push(`spaceMemberships:${row._id}:userId`);
    }
    for (const row of await ctx.db.query("postReads").collect()) {
      const post = await ctx.db.get(row.postId);
      if (!post || post.orgId !== row.orgId) crossOrg.push(`postReads:${row._id}:postId`);
      if (!(await userInOrg(row.userId, row.orgId))) crossOrg.push(`postReads:${row._id}:userId`);
    }
    for (const row of await ctx.db.query("postAttachments").collect()) {
      const post = await ctx.db.get(row.postId);
      const reply = row.replyId ? await ctx.db.get(row.replyId) : null;
      if (!post || post.orgId !== row.orgId) crossOrg.push(`postAttachments:${row._id}:postId`);
      if (!(await userInOrg(row.uploadedBy, row.orgId))) crossOrg.push(`postAttachments:${row._id}:uploadedBy`);
      if (row.replyId && (!reply || reply.orgId !== row.orgId || reply.postId !== row.postId)) crossOrg.push(`postAttachments:${row._id}:replyId`);
    }
    for (const row of await ctx.db.query("agentTasks").collect()) {
      const [post, agent] = await Promise.all([
        ctx.db.get(row.postId),
        ctx.db.get(row.agentId),
      ]);
      if (!post || post.orgId !== row.orgId) crossOrg.push(`agentTasks:${row._id}:postId`);
      if (!agent || agent.orgId !== row.orgId) crossOrg.push(`agentTasks:${row._id}:agentId`);
      if (!(await userInOrg(row.requestedById, row.orgId))) crossOrg.push(`agentTasks:${row._id}:requestedById`);
      if (row.connectorId) {
        const connector = await ctx.db.get(row.connectorId);
        if (!connector || connector.orgId !== row.orgId || connector.agentId !== row.agentId) crossOrg.push(`agentTasks:${row._id}:connectorId`);
      }
    }
    for (const row of await ctx.db.query("connectors").collect()) {
      const agent = await ctx.db.get(row.agentId);
      if (!agent?.isAgent || agent.orgId !== row.orgId) crossOrg.push(`connectors:${row._id}:agentId`);
      if (!(await userInOrg(row.createdById, row.orgId))) crossOrg.push(`connectors:${row._id}:createdById`);
    }
    for (const row of await ctx.db.query("connectorEvents").collect()) {
      const connector = await ctx.db.get(row.connectorId);
      if (!connector || connector.orgId !== row.orgId) crossOrg.push(`connectorEvents:${row._id}:connectorId`);
    }
    return {
      ok: missingOrg.length === 0 && crossOrg.length === 0,
      missingOrg,
      crossOrg,
      globalTables: ["flashExperimentVotes"],
    };
  },
});
