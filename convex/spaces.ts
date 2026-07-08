import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { canAccessSpace, getDefaultOrgId, resolveViewerForRead } from "./authUsers";
import { listPostsBySpaceId } from "./posts";

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
