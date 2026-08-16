import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  canAccessSpace,
  canManageSpace,
  ensureActiveOrgViewer,
  ensureActiveViewerUser,
  forbidden,
  getOrgMembership,
  resolveReadScope,
  requireOrgId,
} from "./authUsers";
import { logAudit } from "./admin";
import { spaceMemberRole, spaceVisibility } from "./schema";
import { listPostsBySpaceId } from "./posts";

async function requireManageableSpace(
  ctx: MutationCtx,
  spaceId: Id<"spaces">,
  viewerId: Id<"users">,
): Promise<Doc<"spaces"> & { orgId: Id<"orgs"> }> {
  const space = await ctx.db.get(spaceId);
  if (!space?.orgId || !(await canManageSpace(ctx, spaceId, viewerId))) {
    forbidden("Only space managers or organization admins can do that.");
  }
  return space as Doc<"spaces"> & { orgId: Id<"orgs"> };
}

async function findSpaceMembership(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  spaceId: Id<"spaces">,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("spaceMemberships")
    .withIndex("by_org_id_and_space_id_and_user_id", (q) =>
      q.eq("orgId", orgId).eq("spaceId", spaceId).eq("userId", userId),
    )
    .unique();
}

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
    const viewer = (await resolveReadScope(ctx, args.viewerId)).viewer;
    if (!viewer || viewer.deactivatedAt || viewer.status === "pending") return null;
    const orgId = requireOrgId(viewer);
    const membership = await getOrgMembership(ctx, orgId, viewer._id);

    const limit = creationLimit(membership?.role ?? viewer.role);
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
    visibility: v.optional(spaceVisibility),
  },
  handler: async (ctx, args) => {
    const { viewer, orgId, membership } = await ensureActiveOrgViewer(ctx, undefined, {
      unauthenticatedMessage: "Sign in to create a space.",
    });
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

    const limit = creationLimit(membership.role);
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
      visibility: args.visibility ?? "public",
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

    return { spaceId, slug };
  },
});

export const list = query({
  args: { viewerId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const scope = await resolveReadScope(ctx, args.viewerId);
    const viewer = scope.viewer;
    const orgId = scope.orgId;
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
        const viewerMembership = viewer
          ? memberships.find((m) => m.userId === viewer._id) ?? null
          : null;

        return {
          ...space,
          memberCount: memberships.length,
          postCount: posts.length,
          latestActivityAt: latestPost?.lastActivityAt ?? space.createdAt,
          viewerIsMember: viewerMembership !== null,
          viewerRole: viewerMembership ? viewerMembership.role ?? "member" : null,
        };
      }),
    );
  },
});

export const getBySlug = query({
  args: { slug: v.string(), viewerId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const scope = await resolveReadScope(ctx, args.viewerId);
    const viewer = scope.viewer;
    const orgId = scope.orgId;
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
    const viewerMembership = viewer
      ? memberships.find((m) => m.userId === viewer._id) ?? null
      : null;

    return {
      ...space,
      memberCount: memberships.length,
      viewerIsMember: viewerMembership !== null,
      viewerRole: viewerMembership ? viewerMembership.role ?? "member" : null,
      viewerCanManage: viewer ? await canManageSpace(ctx, space._id, viewer._id) : false,
    };
  },
});

export const membershipsForSpace = query({
  args: { spaceId: v.id("spaces"), viewerId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const scope = await resolveReadScope(ctx, args.viewerId);
    const viewer = scope.viewer;
    const orgId = scope.orgId;
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
    includeCovers: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const viewer = (await resolveReadScope(ctx, args.viewerId)).viewer;
    if (!(await canAccessSpace(ctx, args.spaceId, viewer?._id))) {
      return [];
    }

    return await listPostsBySpaceId(
      ctx,
      args.spaceId,
      viewer?._id,
      args.includeCovers ?? false,
    );
  },
});

export const update = mutation({
  args: {
    spaceId: v.id("spaces"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    visibility: v.optional(spaceVisibility),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const space = await requireManageableSpace(ctx, args.spaceId, viewer._id);

    const patch: Partial<Doc<"spaces">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name || name.length > 80) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          field: "name",
          message: "Space name must be between 1 and 80 characters.",
        });
      }
      patch.name = name;
    }
    if (args.description !== undefined) {
      const description = args.description.trim();
      if (description.length > 240) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          field: "description",
          message: "Space description must be 240 characters or fewer.",
        });
      }
      patch.description = description || undefined;
    }
    if (args.visibility !== undefined) patch.visibility = args.visibility;

    await ctx.db.patch(args.spaceId, patch);
    await logAudit(ctx, {
      orgId: space.orgId,
      actorId: viewer._id,
      action: "space.updated",
      targetType: "space",
      targetId: args.spaceId,
      metadata: {
        ...(patch.name ? { name: patch.name } : {}),
        ...(args.visibility ? { visibility: args.visibility } : {}),
      },
    });
  },
});

export const archive = mutation({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const space = await requireManageableSpace(ctx, args.spaceId, viewer._id);
    if (space.archivedAt) return;
    await ctx.db.patch(args.spaceId, {
      archivedAt: Date.now(),
      archivedBy: viewer._id,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      orgId: space.orgId,
      actorId: viewer._id,
      action: "space.archived",
      targetType: "space",
      targetId: args.spaceId,
    });
  },
});

export const unarchive = mutation({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const space = await requireManageableSpace(ctx, args.spaceId, viewer._id);
    if (!space.archivedAt) return;
    await ctx.db.patch(args.spaceId, {
      archivedAt: undefined,
      archivedBy: undefined,
      updatedAt: Date.now(),
    });
    await logAudit(ctx, {
      orgId: space.orgId,
      actorId: viewer._id,
      action: "space.unarchived",
      targetType: "space",
      targetId: args.spaceId,
    });
  },
});

/** Self-serve join for public spaces. Private spaces require a manager add. */
export const join = mutation({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const space = await ctx.db.get(args.spaceId);
    if (!space?.orgId) forbidden("Space not found.");
    const membership = await getOrgMembership(ctx, space.orgId, viewer._id);
    if (!membership || membership.status !== "active" || membership.deactivatedAt) {
      forbidden("You do not have access to this space.");
    }
    if (space.archivedAt) forbidden("Archived spaces are read-only.");
    if (space.visibility === "private" && membership.role !== "admin") {
      forbidden("A space manager must add you to this private space.");
    }
    const existing = await findSpaceMembership(ctx, space.orgId, args.spaceId, viewer._id);
    if (existing) return;
    await ctx.db.insert("spaceMemberships", {
      orgId: space.orgId,
      spaceId: args.spaceId,
      userId: viewer._id,
      role: "member",
      createdAt: Date.now(),
    });
  },
});

export const leave = mutation({
  args: { spaceId: v.id("spaces") },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const space = await ctx.db.get(args.spaceId);
    if (!space?.orgId) forbidden("Space not found.");
    const existing = await findSpaceMembership(ctx, space.orgId, args.spaceId, viewer._id);
    if (!existing) return;
    if (space.visibility === "private" && existing.role === "manager") {
      const memberships = await ctx.db
        .query("spaceMemberships")
        .withIndex("by_org_id_and_space_id", (q) =>
          q.eq("orgId", space.orgId!).eq("spaceId", args.spaceId),
        )
        .collect();
      const otherManagers = memberships.filter(
        (m) => m.role === "manager" && m.userId !== viewer._id,
      );
      if (otherManagers.length === 0) {
        forbidden("Assign another manager before leaving this private space.");
      }
    }
    await ctx.db.delete(existing._id);
  },
});

export const addMember = mutation({
  args: { spaceId: v.id("spaces"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const space = await requireManageableSpace(ctx, args.spaceId, viewer._id);
    const targetMembership = await getOrgMembership(ctx, space.orgId, args.userId);
    if (
      !targetMembership ||
      targetMembership.status !== "active" ||
      targetMembership.deactivatedAt
    ) {
      forbidden("That person is not an active member of this organization.");
    }
    const existing = await findSpaceMembership(ctx, space.orgId, args.spaceId, args.userId);
    if (existing) return;
    await ctx.db.insert("spaceMemberships", {
      orgId: space.orgId,
      spaceId: args.spaceId,
      userId: args.userId,
      role: "member",
      createdAt: Date.now(),
    });
    await logAudit(ctx, {
      orgId: space.orgId,
      actorId: viewer._id,
      action: "space.member_added",
      targetType: "user",
      targetId: args.userId,
      metadata: { spaceId: args.spaceId },
    });
  },
});

export const removeMember = mutation({
  args: { spaceId: v.id("spaces"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const space = await requireManageableSpace(ctx, args.spaceId, viewer._id);
    const existing = await findSpaceMembership(ctx, space.orgId, args.spaceId, args.userId);
    if (!existing) return;
    await ctx.db.delete(existing._id);
    await logAudit(ctx, {
      orgId: space.orgId,
      actorId: viewer._id,
      action: "space.member_removed",
      targetType: "user",
      targetId: args.userId,
      metadata: { spaceId: args.spaceId },
    });
  },
});

export const setMemberRole = mutation({
  args: {
    spaceId: v.id("spaces"),
    userId: v.id("users"),
    role: spaceMemberRole,
  },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const space = await requireManageableSpace(ctx, args.spaceId, viewer._id);
    const existing = await findSpaceMembership(ctx, space.orgId, args.spaceId, args.userId);
    if (!existing) forbidden("That person is not a member of this space.");
    if (existing.role === args.role) return;
    await ctx.db.patch(existing._id, { role: args.role });
    await logAudit(ctx, {
      orgId: space.orgId,
      actorId: viewer._id,
      action: "space.member_role_changed",
      targetType: "user",
      targetId: args.userId,
      metadata: { spaceId: args.spaceId, role: args.role },
    });
  },
});
