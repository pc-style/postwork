import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  ensureViewerUser,
  findUserForIdentity,
} from "./authUsers";

export type PublicUser = Omit<Doc<"users">, "tokenIdentifier" | "subject">;

export function publicUser(user: Doc<"users">): PublicUser;
export function publicUser(user: Doc<"users"> | null): PublicUser | null;
export function publicUser(user: Doc<"users"> | null): PublicUser | null {
  if (!user) return null;
  const { tokenIdentifier: _tokenIdentifier, subject: _subject, ...rest } =
    user;
  return rest;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
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
    await ctx.db.patch(user._id, {
      name: args.name.trim(),
      title: args.title.trim(),
      initials: args.initials.trim().toUpperCase(),
    });
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
    if (!target) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found." });
    }

    await ctx.db.patch(args.userId, { role: args.role });
  },
});
