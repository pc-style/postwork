import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  ensureActiveOrgViewer,
  ensureViewerUser,
  getOrgMembership,
  getViewerFromAuth,
  forbidden,
} from "./authUsers";
import { logAudit } from "./admin";
import { rateLimiter } from "./lib/rateLimit";
import { logInfo } from "./lib/observability";

export const RESERVED_ORG_SLUGS = new Set([
  "www", "app", "api", "demo", "admin", "postwork", "beta", "staging",
]);

const DEFAULT_SPACES = [
  { name: "Engineering", slug: "engineering" },
  { name: "Product", slug: "product" },
  { name: "Design", slug: "design" },
  { name: "Company", slug: "company" },
] as const;

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
  if (value.length < 3 || value.length > 32) return "Workspace slug must be between 3 and 32 characters.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) return "Workspace slug may only contain lowercase letters, numbers, and internal hyphens.";
  if (RESERVED_ORG_SLUGS.has(value)) return "That workspace slug is reserved.";
  return null;
}

function invalidInput(message: string): never {
  throw new ConvexError({ code: "INVALID_INPUT", message });
}

async function slugOwner(
  ctx: Parameters<typeof ensureViewerUser>[0],
  slug: string,
): Promise<Id<"orgs"> | null> {
  const org = await ctx.db
    .query("orgs")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (org) return org._id;
  const alias = await ctx.db
    .query("orgSlugAliases")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  return alias?.orgId ?? null;
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerFromAuth(ctx);
    if (!viewer) return [];
    const memberships = await ctx.db
      .query("orgMemberships")
      .withIndex("by_user_id_and_status", (q) =>
        q.eq("userId", viewer._id).eq("status", "active"),
      )
      .collect();
    if (memberships.length === 0 && viewer.orgId) {
      const org = await ctx.db.get(viewer.orgId);
      return org && !viewer.deactivatedAt
        ? [{
            org,
            membership: {
              role: viewer.role ?? "member",
              status: viewer.status ?? "active",
              deactivatedAt: viewer.deactivatedAt,
            },
          }]
        : [];
    }
    const result = [];
    for (const membership of memberships) {
      if (membership.deactivatedAt) continue;
      const org = await ctx.db.get(membership.orgId);
      if (org) result.push({ org, membership });
    }
    return result.sort((a, b) => a.org.name.localeCompare(b.org.name));
  },
});

export const getContext = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const viewer = await getViewerFromAuth(ctx);
    if (!viewer) return null;
    const canonical = await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    const alias = canonical
      ? null
      : await ctx.db
          .query("orgSlugAliases")
          .withIndex("by_slug", (q) => q.eq("slug", args.slug))
          .unique();
    const org = canonical ?? (alias ? await ctx.db.get(alias.orgId) : null);
    if (!org) return null;
    const membership = await getOrgMembership(ctx, org._id, viewer._id);
    if (
      !membership ||
      membership.status !== "active" ||
      membership.deactivatedAt
    ) {
      return null;
    }
    return {
      org,
      membership,
      viewerId: viewer._id,
      redirectedFromAlias: alias ? args.slug : null,
    };
  },
});

/**
 * Switch the account's active workspace. The legacy client scopes every
 * query through `users.orgId`, so flipping it (with the membership's role
 * and status mirrored) moves the whole session to the selected org.
 */
export const switchActive = mutation({
  args: { orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    const viewer = await ensureViewerUser(ctx);
    await rateLimiter.limit(ctx, "governance", { key: viewer._id, throws: true });
    const membership = await getOrgMembership(ctx, args.orgId, viewer._id);
    if (
      !membership ||
      membership.status !== "active" ||
      membership.deactivatedAt
    ) {
      forbidden("You do not have access to this organization.");
    }
    await ctx.db.patch(viewer._id, {
      orgId: args.orgId,
      role: membership.role,
      status: membership.status,
      deactivatedAt: membership.deactivatedAt,
    });
    return { ok: true as const };
  },
});

export const create = mutation({
  args: { name: v.string(), slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const viewer = await ensureViewerUser(ctx);
    await rateLimiter.limit(ctx, "governance", { key: viewer._id, throws: true });
    const name = args.name.trim();
    if (name.length < 2 || name.length > 64) {
      invalidInput("Organization name must be between 2 and 64 characters.");
    }

    const slug = args.slug === undefined ? defaultOrgSlug(name) : args.slug.trim();
    const validationError = orgSlugError(slug);
    if (validationError) invalidInput(validationError);
    if (await slugOwner(ctx, slug)) invalidInput("That workspace slug is already in use.");

    const now = Date.now();
    const orgId = await ctx.db.insert("orgs", { name, slug, createdAt: now });
    await ctx.db.insert("orgMemberships", {
      orgId,
      userId: viewer._id,
      role: "admin",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    for (const defaultSpace of DEFAULT_SPACES) {
      const spaceId = await ctx.db.insert("spaces", {
        orgId,
        name: defaultSpace.name,
        slug: defaultSpace.slug,
        visibility: "public",
        createdBy: viewer._id,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("spaceMemberships", {
        orgId,
        spaceId,
        userId: viewer._id,
        role: "manager",
        createdAt: now,
      });
    }

    // Preserve the old client during the additive rollout. The first org
    // remains its fallback workspace, while new clients use the URL context.
    if (!viewer.orgId) {
      await ctx.db.patch(viewer._id, {
        orgId,
        role: "admin",
        status: "active",
        deactivatedAt: undefined,
      });
    }

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

export const update = mutation({
  args: {
    orgId: v.id("orgs"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { viewer } = await ensureActiveOrgViewer(ctx, args.orgId, {
      admin: true,
    });
    const org = await ctx.db.get(args.orgId);
    if (!org) forbidden("Organization not found.");

    const patch: { name?: string; slug?: string } = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2 || name.length > 64) {
        invalidInput("Organization name must be between 2 and 64 characters.");
      }
      patch.name = name;
    }
    if (args.slug !== undefined) {
      const slug = args.slug.trim();
      const validationError = orgSlugError(slug);
      if (validationError) invalidInput(validationError);
      const owner = await slugOwner(ctx, slug);
      if (owner && owner !== args.orgId) {
        invalidInput("That workspace slug is already in use.");
      }
      if (org.slug && org.slug !== slug) {
        const oldAlias = await ctx.db
          .query("orgSlugAliases")
          .withIndex("by_slug", (q) => q.eq("slug", org.slug!))
          .unique();
        if (!oldAlias) {
          await ctx.db.insert("orgSlugAliases", {
            orgId: args.orgId,
            slug: org.slug,
            createdAt: Date.now(),
          });
        }
      }
      patch.slug = slug;
    }
    if (Object.keys(patch).length > 0) await ctx.db.patch(args.orgId, patch);
    await logAudit(ctx, {
      orgId: args.orgId,
      actorId: viewer._id,
      action: "org.updated",
      targetType: "org",
      targetId: args.orgId,
      metadata: patch,
    });
    return { name: patch.name ?? org.name, slug: patch.slug ?? org.slug };
  },
});

// Compatibility for the existing settings form.
export const setSlug = mutation({
  args: { slug: v.string(), orgId: v.optional(v.id("orgs")) },
  handler: async (ctx, args) => {
    const viewer = await ensureViewerUser(ctx);
    const orgId = args.orgId ?? viewer.orgId;
    if (!orgId) forbidden("Organization not found.");
    const membership = await getOrgMembership(ctx, orgId, viewer._id);
    if (membership?.role !== "admin") {
      forbidden("Only organization admins can change the workspace slug.");
    }
    const slug = args.slug.trim();
    const validationError = orgSlugError(slug);
    if (validationError) invalidInput(validationError);
    const existing = await slugOwner(ctx, slug);
    if (existing && existing !== orgId) invalidInput("That workspace slug is already in use.");
    const org = await ctx.db.get(orgId);
    if (!org) forbidden("Organization not found.");
    if (org.slug && org.slug !== slug) {
      const oldAlias = await ctx.db
        .query("orgSlugAliases")
        .withIndex("by_slug", (q) => q.eq("slug", org.slug!))
        .unique();
      if (!oldAlias) {
        await ctx.db.insert("orgSlugAliases", {
          orgId,
          slug: org.slug,
          createdAt: Date.now(),
        });
      }
    }
    await ctx.db.patch(orgId, { slug });
    await logAudit(ctx, {
      orgId,
      actorId: viewer._id,
      action: "org.slug_updated",
      targetType: "org",
      targetId: orgId,
      metadata: { slug },
    });
    return { slug };
  },
});
