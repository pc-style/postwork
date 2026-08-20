import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  ensureActiveOrgViewer,
  forbidden,
  getOrgMembership,
  getViewerFromAuth,
  requireOrgId,
} from "./authUsers";
import { logAudit } from "./lib/audit";
import { claimableDomainError } from "./lib/emailDomains";
import { rateLimiter } from "./lib/rateLimit";

/**
 * Auto-join domains: sign-ups whose verified email matches a claimed domain
 * become active members of the org without an invite (JIT provisioning).
 * Claiming is admin-only and requires the admin's own email to live on the
 * domain; public providers are refused in lib/emailDomains.
 */

export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerFromAuth(ctx);
    if (!viewer?.orgId) return [];
    const orgId = requireOrgId(viewer);
    const membership = await getOrgMembership(ctx, orgId, viewer._id);
    if (
      !membership ||
      membership.status !== "active" ||
      membership.deactivatedAt ||
      membership.role !== "admin"
    ) {
      return [];
    }
    return await ctx.db
      .query("orgDomains")
      .withIndex("by_org_id", (q) => q.eq("orgId", orgId))
      .collect();
  },
});

export const add = mutation({
  args: { domain: v.string() },
  handler: async (ctx, args) => {
    const { viewer, orgId } = await ensureActiveOrgViewer(ctx, undefined, {
      admin: true,
    });
    await rateLimiter.limit(ctx, "governance", { key: viewer._id, throws: true });
    const domain = args.domain.trim().toLowerCase();
    const error = claimableDomainError(domain, viewer.email);
    if (error) {
      throw new ConvexError({ code: "INVALID_INPUT", message: error });
    }
    const existing = await ctx.db
      .query("orgDomains")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .unique();
    if (existing) {
      if (existing.orgId === orgId) return existing._id;
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "That domain is already claimed by another workspace.",
      });
    }
    const domainId = await ctx.db.insert("orgDomains", {
      orgId,
      domain,
      createdBy: viewer._id,
      createdAt: Date.now(),
    });
    await logAudit(ctx, {
      orgId,
      actorId: viewer._id,
      action: "org.domain_added",
      targetType: "orgDomain",
      targetId: domainId,
      metadata: { domain },
    });
    return domainId;
  },
});

export const remove = mutation({
  args: { domainId: v.id("orgDomains") },
  handler: async (ctx, args) => {
    const { viewer, orgId } = await ensureActiveOrgViewer(ctx, undefined, {
      admin: true,
    });
    const record = await ctx.db.get(args.domainId);
    if (!record || record.orgId !== orgId) {
      forbidden("Domain not found.");
    }
    await ctx.db.delete(args.domainId);
    await logAudit(ctx, {
      orgId,
      actorId: viewer._id,
      action: "org.domain_removed",
      targetType: "orgDomain",
      targetId: args.domainId,
      metadata: { domain: record.domain },
    });
  },
});
