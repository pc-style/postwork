import { v } from "convex/values";
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

export const auditTenantOwnership = internalQuery({
  args: {},
  handler: async (ctx) => {
    const missingOrg: string[] = [];
    const crossOrg: string[] = [];
    for (const table of ["users", "spaces", "spaceMemberships", "posts", "replies", "postReads", "notificationPreferences", "notificationDeliveries", "agentTasks", "aiGenerationSettings", "postAttachments", "attachmentUploadTickets", "invites", "accessRequests", "auditLog"] as const) {
      for (const row of await ctx.db.query(table).collect()) if (!row.orgId) missingOrg.push(`${table}:${row._id}`);
    }
    for (const row of await ctx.db.query("posts").collect()) {
      const author = await ctx.db.get(row.authorId);
      const space = row.spaceId ? await ctx.db.get(row.spaceId) : null;
      if (!author || author.orgId !== row.orgId) crossOrg.push(`posts:${row._id}:authorId`);
      if (row.spaceId && (!space || space.orgId !== row.orgId)) crossOrg.push(`posts:${row._id}:spaceId`);
      for (const participantId of row.participantIds) {
        const participant = await ctx.db.get(participantId);
        if (!participant || participant.orgId !== row.orgId) crossOrg.push(`posts:${row._id}:participantIds`);
      }
    }
    for (const row of await ctx.db.query("replies").collect()) {
      const post = await ctx.db.get(row.postId);
      const author = await ctx.db.get(row.authorId);
      const parent = row.parentId ? await ctx.db.get(row.parentId) : null;
      if (!post || post.orgId !== row.orgId) crossOrg.push(`replies:${row._id}:postId`);
      if (!author || author.orgId !== row.orgId) crossOrg.push(`replies:${row._id}:authorId`);
      if (row.parentId && (!parent || parent.orgId !== row.orgId || parent.postId !== row.postId)) crossOrg.push(`replies:${row._id}:parentId`);
    }
    for (const row of await ctx.db.query("spaceMemberships").collect()) {
      const space = await ctx.db.get(row.spaceId);
      const user = await ctx.db.get(row.userId);
      if (!space || space.orgId !== row.orgId) crossOrg.push(`spaceMemberships:${row._id}:spaceId`);
      if (!user || user.orgId !== row.orgId) crossOrg.push(`spaceMemberships:${row._id}:userId`);
    }
    for (const row of await ctx.db.query("postReads").collect()) {
      const post = await ctx.db.get(row.postId);
      const user = await ctx.db.get(row.userId);
      if (!post || post.orgId !== row.orgId) crossOrg.push(`postReads:${row._id}:postId`);
      if (!user || user.orgId !== row.orgId) crossOrg.push(`postReads:${row._id}:userId`);
    }
    for (const row of await ctx.db.query("postAttachments").collect()) {
      const post = await ctx.db.get(row.postId);
      const uploader = await ctx.db.get(row.uploadedBy);
      const reply = row.replyId ? await ctx.db.get(row.replyId) : null;
      if (!post || post.orgId !== row.orgId) crossOrg.push(`postAttachments:${row._id}:postId`);
      if (!uploader || uploader.orgId !== row.orgId) crossOrg.push(`postAttachments:${row._id}:uploadedBy`);
      if (row.replyId && (!reply || reply.orgId !== row.orgId || reply.postId !== row.postId)) crossOrg.push(`postAttachments:${row._id}:replyId`);
    }
    for (const row of await ctx.db.query("agentTasks").collect()) {
      const [post, agent, requester] = await Promise.all([
        ctx.db.get(row.postId),
        ctx.db.get(row.agentId),
        ctx.db.get(row.requestedById),
      ]);
      if (!post || post.orgId !== row.orgId) crossOrg.push(`agentTasks:${row._id}:postId`);
      if (!agent || agent.orgId !== row.orgId) crossOrg.push(`agentTasks:${row._id}:agentId`);
      if (!requester || requester.orgId !== row.orgId) crossOrg.push(`agentTasks:${row._id}:requestedById`);
    }
    return {
      ok: missingOrg.length === 0 && crossOrg.length === 0,
      missingOrg,
      crossOrg,
      globalTables: ["flashExperimentVotes"],
    };
  },
});
