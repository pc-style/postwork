import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    // The directory is public; the auth-identity mapping is not. Strip
    // `subject` so visitors can't enumerate real members' auth identifiers.
    return users.map(({ subject: _subject, ...user }) => user);
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

    const user = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
      .first();
    if (!user)
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found" });

    await ctx.db.patch(user._id, {
      name: args.name,
      title: args.title,
      initials: args.initials,
    });
  },
});
