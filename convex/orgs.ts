import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { ensureViewerUser, forbidden } from "./authUsers";
import { logAudit } from "./admin";
import { logInfo } from "./lib/observability";

export const RESERVED_ORG_SLUGS = new Set([
  "www",
  "app",
  "api",
  "demo",
  "admin",
  "postwork",
  "beta",
  "staging",
]);

export function defaultOrgSlug(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  if (!slug) return "org";
  return slug.length < 3 ? `${slug}-org` : slug;
}

export function orgSlugError(value: string): string | null {
  if (value.length < 3 || value.length > 32)
    return "Workspace slug must be between 3 and 32 characters.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
    return "Workspace slug may only contain lowercase letters, numbers, and internal hyphens.";
  if (RESERVED_ORG_SLUGS.has(value)) return "That workspace slug is reserved.";
  return null;
}

function invalidInput(message: string): never {
  throw new ConvexError({ code: "INVALID_INPUT", message });
}

/**
 * Organization onboarding for authenticated users who do not yet belong to
 * an organization.
 */

export const create = mutation({
  args: { name: v.string(), slug: v.optional(v.string()) },
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

    const slug = args.slug === undefined ? defaultOrgSlug(name) : args.slug.trim();
    const validationError = orgSlugError(slug);
    if (validationError) invalidInput(validationError);
    if (
      await ctx.db
        .query("orgs")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique()
    ) {
      invalidInput("That workspace slug is already in use.");
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

export const setSlug = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const viewer = await ensureViewerUser(ctx);
    if (!viewer.orgId || viewer.role !== "admin")
      forbidden("Only organization admins can change the workspace slug.");
    const slug = args.slug.trim();
    const validationError = orgSlugError(slug);
    if (validationError) invalidInput(validationError);
    const existing = await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing && existing._id !== viewer.orgId)
      invalidInput("That workspace slug is already in use.");
    await ctx.db.patch(viewer.orgId, { slug });
    await logAudit(ctx, {
      orgId: viewer.orgId,
      actorId: viewer._id,
      action: "org.slug_updated",
      targetType: "org",
      targetId: viewer.orgId,
      metadata: { slug },
    });
    return { slug };
  },
});
