import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { findUserForIdentity } from "./authUsers";

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

/** Update the signed-in member's own profile (identity comes from auth, never
 * from the client — and `role` is deliberately not editable here). */
export const updateProfile = mutation({
  args: {
    name: v.string(),
    title: v.string(),
    initials: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity)
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Sign in to edit your profile.",
      });

    const user = await findUserForIdentity(ctx, identity);
    if (!user)
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found" });

    await ctx.db.patch(user._id, {
      name: args.name,
      title: args.title,
      initials: args.initials,
    });
  },
});
