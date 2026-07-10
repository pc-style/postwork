import { ConvexError, v, type Infer } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  applyAvatarAction,
  computeAvatarUrl,
  ensureActiveViewerUser,
  ensureViewerUser,
  findUserForIdentity,
  getDefaultOrgId,
  getViewerFromAuth,
} from "./authUsers";
import { isDemo } from "./lib/demo";
import { rateLimiter } from "./lib/rateLimit";
import {
  parse,
  profileNameSchema,
  profileTitleSchema,
  profileInitialsSchema,
} from "./lib/validation";
import { logInfo } from "./lib/observability";
import { preferenceArgs, savePreferences } from "./notificationPreferences";

export type PublicUser = Omit<Doc<"users">, "tokenIdentifier" | "subject">;

const avatarActionValidator = v.optional(v.union(
  v.object({ type: v.literal("upload"), storageId: v.id("_storage") }),
  v.object({ type: v.literal("remove") }),
  v.object({ type: v.literal("useProvider") }),
));

type ProfileUpdateArgs = {
  name: string;
  initials: string;
  avatar?: Infer<typeof avatarActionValidator>;
};

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
    // The org directory is members-only. Demo mode has no auth (the client
    // switcher picks a persona), so it stays open there; product mode requires
    // an activated viewer — pending/signed-out users get nothing.
    if (!isDemo()) {
      const viewer = await getViewerFromAuth(ctx);
      if (!viewer || viewer.status === "pending") return [];
    }
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

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await findUserForIdentity(ctx, identity);
    if (!user) {
      return {
        user: null,
        status: "pending" as const,
        needsProfileSetup: false,
      };
    }
    return {
      user: publicUser(user),
      status: user.status ?? "active" as const,
      needsProfileSetup:
        user.profileCompletedAt === undefined && user.tokenIdentifier !== undefined,
    };
  },
});

export const ensureViewer = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await ensureViewerUser(ctx);
    return publicUser(user);
  },
});

export const syncViewerProfile = mutation({
  args: {
    name: v.optional(v.string()),
    providerAvatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ensureViewerUser(ctx);
    const patch: Partial<Doc<"users">> = {};

    if (args.name !== undefined) {
      const name = parse(profileNameSchema, args.name, "name");
      const initials = name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 4)
        .toUpperCase();
      if (user.name !== name) patch.name = name;
      if (user.initials !== initials) patch.initials = initials;
    }

    if (args.providerAvatarUrl !== undefined) {
      const providerAvatarUrl = args.providerAvatarUrl.trim() || undefined;
      if (user.providerAvatarUrl !== providerAvatarUrl) {
        patch.providerAvatarUrl = providerAvatarUrl;
        if (!user.avatarStorageId) {
          patch.avatarUrl = computeAvatarUrl({ ...user, providerAvatarUrl });
        }
      }
    }

    if (Object.keys(patch).length === 0) {
      return publicUser(user);
    }

    await ctx.db.patch(user._id, patch);
    return publicUser({ ...user, ...patch });
  },
});

export const completeProfile = mutation({
  args: {
    name: v.string(),
    title: v.string(),
    initials: v.string(),
    avatar: avatarActionValidator,
  },
  handler: async (ctx, args) => {
    const user = await ensureViewerUser(ctx);
    await rateLimiter.limit(ctx, "updateProfile", {
      key: user._id,
      throws: true,
    });

    const name = parse(profileNameSchema, args.name, "name");
    const title = parse(profileTitleSchema, args.title, "title");
    const initials = parse(profileInitialsSchema, args.initials, "initials");
    const avatarPatch = await applyAvatarAction(ctx, user, args.avatar);

    await ctx.db.patch(user._id, {
      name,
      title,
      initials: initials.toUpperCase(),
      profileCompletedAt: Date.now(),
      ...avatarPatch,
    });
    logInfo("user.profileCompleted", { userId: user._id });
  },
});

export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await ensureViewerUser(ctx);
    await rateLimiter.limit(ctx, "updateProfile", {
      key: user._id,
      throws: true,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateProfile = mutation({
  args: {
    name: v.string(),
    initials: v.string(),
    avatar: avatarActionValidator,
  },
  handler: async (ctx, args) => {
    const user = await ensureViewerUser(ctx);
    await updateProfileFields(ctx, user, args);
  },
});

export const updateProfileAndNotifications = mutation({
  args: {
    name: v.string(),
    initials: v.string(),
    avatar: avatarActionValidator,
    notificationPreferences: v.object(preferenceArgs),
  },
  handler: async (ctx, args) => {
    const user = await ensureActiveViewerUser(ctx);
    await updateProfileFields(ctx, user, args);
    await savePreferences(ctx, user, args.notificationPreferences);
  },
});

async function updateProfileFields(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: ProfileUpdateArgs,
): Promise<void> {
  await rateLimiter.limit(ctx, "updateProfile", {
    key: user._id,
    throws: true,
  });

  const name = parse(profileNameSchema, args.name, "name");
  const initials = parse(profileInitialsSchema, args.initials, "initials");
  const avatarPatch = await applyAvatarAction(ctx, user, args.avatar);
  await ctx.db.patch(user._id, {
    name,
    initials: initials.toUpperCase(),
    ...avatarPatch,
  });
  logInfo("user.profileUpdated", { userId: user._id });
}

export const setRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
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
    const viewer = await ensureActiveViewerUser(ctx);
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
    const viewer = await ensureActiveViewerUser(ctx);
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
