import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import {
  DEMO_ORG_SLUG,
  PRODUCT_ORG_SLUG,
  ensureViewerUser,
  forbidden,
} from "./authUsers";
import { logAudit } from "./admin";
import { logInfo } from "./lib/observability";

/**
 * Organization onboarding for authenticated users who do not yet belong to
 * an organization.
 */

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const viewer = await ensureViewerUser(ctx);
    if (viewer.deactivatedAt) forbidden("Your account has been deactivated. Contact an admin.");
    if (viewer.orgId) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "You already belong to an organization.",
      });
    }

    const name = args.name.trim();
    if (name.length < 2 || name.length > 64) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Organization name must be between 2 and 64 characters.",
      });
    }

    const baseSlug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)
        .replace(/-+$/g, "") || "org";
    const reservedSlugs = new Set([DEMO_ORG_SLUG, PRODUCT_ORG_SLUG]);
    let slug = baseSlug;
    let suffix = 2;
    while (
      reservedSlugs.has(slug) ||
      await ctx.db.query("orgs").withIndex("by_slug", (q) => q.eq("slug", slug)).unique()
    ) {
      const suffixText = `-${suffix++}`;
      slug = `${baseSlug.slice(0, 48 - suffixText.length).replace(/-+$/g, "")}${suffixText}`;
    }

    const orgId = await ctx.db.insert("orgs", {
      name,
      slug,
      createdAt: Date.now(),
    });
    await ctx.db.patch(viewer._id, {
      orgId,
      role: "admin",
      status: "active",
    });
    await logAudit(ctx, {
      orgId,
      actorId: viewer._id,
      action: "org.created",
      targetType: "org",
      targetId: orgId,
      metadata: { slug },
    });
    logInfo("org.created", { orgId, userId: viewer._id });
    return { orgId, slug };
  },
});
