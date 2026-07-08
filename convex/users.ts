import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  ensureViewerUser,
  findUserForIdentity,
  getDefaultOrgId,
} from "./authUsers";
import { rateLimiter } from "./lib/rateLimit";
import {
  parse,
  profileNameSchema,
  profileTitleSchema,
  profileInitialsSchema,
} from "./lib/validation";
import { logInfo } from "./lib/observability";

export type PublicUser = Omit<Doc<"users">, "tokenIdentifier" | "subject">;

export function publicUser(user: Doc<"users">): PublicUser;
export function publicUser(user: Doc<"users"> | null): PublicUser | null;
export function publicUser(user: Doc<"users"> | null): PublicUser | null {
  if (!user) return null;
  const {
    tokenIdentifier: _tokenIdentifier,
    subject: _subject,
    ...rest
  } = user;
  return rest;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const orgId = await getDefaultOrgId(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_org_id_and_role", (q) => q.eq("orgId", orgId))
      .collect();
    return users.map((u) => publicUser(u));
  },
});

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await findUserForIdentity(ctx, identity);
    return publicUser(user);
  },
});

export const ensureViewer = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await ensureViewerUser(ctx);
    return publicUser(user);
  },
});

export const updateProfile = mutation({
  args: {
    name: v.string(),
    title: v.string(),
    initials: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ensureViewerUser(ctx);

    // Rate limit (Phase 3.1).
    await rateLimiter.limit(ctx, "updateProfile", {
      key: user._id,
      throws: true,
    });

    // Input validation (Phase 3.2).
    const name = parse(profileNameSchema, args.name, "name");
    const title = parse(profileTitleSchema, args.title, "title");
    const initials = parse(profileInitialsSchema, args.initials, "initials");

    await ctx.db.patch(user._id, {
      name,
      title,
      initials: initials.toUpperCase(),
    });
    logInfo("user.profileUpdated", { userId: user._id });
  },
});

export const setRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureViewerUser(ctx);
    if (viewer.role !== "admin") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only admins can manage roles.",
      });
    }

    const target = await ctx.db.get(args.userId);
    if (!target || target.orgId !== viewer.orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found." });
    }

    await ctx.db.patch(args.userId, { role: args.role });
    logInfo("user.roleChanged", { userId: args.userId, role: args.role });
  },
});

/**
 * Deactivate a user (Phase 3.5 moderation). Admin only. Sets `deactivatedAt`
 * — the user's existing content stays, but they can no longer write.
 * `ensureViewerUser` rejects deactivated users.
 */
export const deactivate = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const viewer = await ensureViewerUser(ctx);
    if (viewer.role !== "admin") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only admins can deactivate users.",
      });
    }

    const target = await ctx.db.get(args.userId);
    if (!target || target.orgId !== viewer.orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found." });
    }
    if (target._id === viewer._id) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "You cannot deactivate yourself.",
      });
    }

    await ctx.db.patch(args.userId, { deactivatedAt: Date.now() });
    logInfo("user.deactivated", { userId: args.userId, adminId: viewer._id });
  },
});

/** Reactivate a previously deactivated user. Admin only. */
export const reactivate = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const viewer = await ensureViewerUser(ctx);
    if (viewer.role !== "admin") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only admins can reactivate users.",
      });
    }

    const target = await ctx.db.get(args.userId);
    if (!target || target.orgId !== viewer.orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found." });
    }

    await ctx.db.patch(args.userId, { deactivatedAt: undefined });
    logInfo("user.reactivated", { userId: args.userId, adminId: viewer._id });
  },
});
