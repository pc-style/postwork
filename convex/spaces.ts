import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  canAccessSpace,
  ensureActiveViewerUser,
  getDefaultOrgId,
  resolveViewerForRead,
} from "./authUsers";
import { listPostsBySpaceId } from "./posts";

const SPACE_LIMITS = {
  member: 1,
  tester: 3,
} as const;

function creationLimit(role: Doc<"users">["role"]): number | null {
  if (role === "admin") return null;
  return role === "tester" ? SPACE_LIMITS.tester : SPACE_LIMITS.member;
}

async function countCreatedSpaces(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  userId: Id<"users">,
  limit: number,
) {
  return (
    await ctx.db
      .query("spaces")
      .withIndex("by_org_id_and_created_by", (q) =>
        q.eq("orgId", orgId).eq("createdBy", userId),
      )
      .take(limit)
  ).length;
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64)
      .replace(/-+$/g, "") || "space"
  );
}

export const creationStatus = query({
  args: { viewerId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const viewer = await resolveViewerForRead(ctx, args.viewerId);
    if (!viewer || viewer.deactivatedAt || viewer.status === "pending") return null;
    const orgId = viewer.orgId ?? (await getDefaultOrgId(ctx));

    const limit = creationLimit(viewer.role);
    if (limit === null) {
      return { limit, createdCount: 0, canCreate: true };
    }

    const createdCount = (
      await ctx.db
        .query("spaces")
        .withIndex("by_org_id_and_created_by", (q) =>
          q.eq("orgId", orgId).eq("createdBy", viewer._id),
        )
        .take(limit)
    ).length;
    return { limit, createdCount, canCreate: createdCount < limit };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx, {
      unauthenticatedMessage: "Sign in to create a space.",
    });
    const orgId = viewer.orgId ?? (await getDefaultOrgId(ctx));
    const name = args.name.trim();
    const description = args.description?.trim() || undefined;

    if (!name || name.length > 80) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        field: "name",
        message: "Space name must be between 1 and 80 characters.",
      });
    }
    if (description && description.length > 240) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        field: "description",
        message: "Space description must be 240 characters or fewer.",
      });
    }

    const limit = creationLimit(viewer.role);
    if (limit !== null) {
      const createdCount = await countCreatedSpaces(ctx, orgId, viewer._id, limit);
      if (createdCount >= limit) {
        throw new ConvexError({
          code: "SPACE_LIMIT_REACHED",
          message: `Your role can create up to ${limit} ${limit === 1 ? "space" : "spaces"}.`,
        });
      }
    }

    const slugBase = slugify(name);
    let slug = slugBase;
    let suffix = 2;
    while (
      await ctx.db
        .query("spaces")
        .withIndex("by_org_id_and_slug", (q) =>
          q.eq("orgId", orgId).eq("slug", slug),
        )
        .unique()
    ) {
      slug = `${slugBase}-${suffix}`;
      suffix += 1;
    }

    const now = Date.now();
    const spaceId = await ctx.db.insert("spaces", {
      orgId,
      name,
      slug,
      description,
      createdBy: viewer._id,
      createdAt: now,
    });
    await ctx.db.insert("spaceMemberships", {
      orgId,
      spaceId,
      userId: viewer._id,
      createdAt: now,
    });

    return { spaceId, slug };
  },
});

export const list = query({
  args: { viewerId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const viewer = await resolveViewerForRead(ctx, args.viewerId);
    const orgId = viewer?.orgId ?? (await getDefaultOrgId(ctx));
    const spaces = await ctx.db
      .query("spaces")
      .withIndex("by_org_id_and_slug", (q) => q.eq("orgId", orgId))
      .collect();

    const visible: Doc<"spaces">[] = [];
    for (const space of spaces) {
      if (await canAccessSpace(ctx, space._id, viewer?._id)) {
        visible.push(space);
      }
    }

    return await Promise.all(
      visible.map(async (space) => {
        const memberships = await ctx.db
          .query("spaceMemberships")
          .withIndex("by_org_id_and_space_id", (q) =>
            q.eq("orgId", orgId).eq("spaceId", space._id),
          )
          .collect();
        const posts = await ctx.db
          .query("posts")
          .withIndex("by_org_id_and_space_id_and_last_activity_at", (q) =>
            q.eq("orgId", orgId).eq("spaceId", space._id),
          )
          .order("desc")
          .collect();
        const latestPost = posts[0];

        return {
          ...space,
          memberCount: memberships.length,
          postCount: posts.length,
          latestActivityAt: latestPost?.lastActivityAt ?? space.createdAt,
        };
      }),
    );
  },
});

export const getBySlug = query({
  args: { slug: v.string(), viewerId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const viewer = await resolveViewerForRead(ctx, args.viewerId);
    const orgId = viewer?.orgId ?? (await getDefaultOrgId(ctx));
    const space = await ctx.db
      .query("spaces")
      .withIndex("by_org_id_and_slug", (q) =>
        q.eq("orgId", orgId).eq("slug", args.slug),
      )
      .unique();
    if (!space) return null;
    if (!(await canAccessSpace(ctx, space._id, viewer?._id))) return null;

    const memberships = await ctx.db
      .query("spaceMemberships")
      .withIndex("by_org_id_and_space_id", (q) =>
            q.eq("orgId", orgId).eq("spaceId", space._id),
          )
      .collect();

    return {
      ...space,
      memberCount: memberships.length,
    };
  },
});

export const membershipsForSpace = query({
  args: { spaceId: v.id("spaces"), viewerId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const viewer = await resolveViewerForRead(ctx, args.viewerId);
    const orgId = viewer?.orgId ?? (await getDefaultOrgId(ctx));
    if (!(await canAccessSpace(ctx, args.spaceId, viewer?._id))) {
      return [];
    }

    const memberships = await ctx.db
      .query("spaceMemberships")
      .withIndex("by_org_id_and_space_id", (q) =>
        q.eq("orgId", orgId).eq("spaceId", args.spaceId),
      )
      .collect();

    return await Promise.all(
      memberships.map(async (membership) => ({
        ...membership,
        user: await ctx.db.get(membership.userId),
      })),
    );
  },
});

export const postsForSpace = query({
  args: {
    spaceId: v.id("spaces"),
    viewerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const viewer = await resolveViewerForRead(ctx, args.viewerId);
    if (!(await canAccessSpace(ctx, args.spaceId, viewer?._id))) {
      return [];
    }

    return await listPostsBySpaceId(ctx, args.spaceId, viewer?._id);
  },
});
