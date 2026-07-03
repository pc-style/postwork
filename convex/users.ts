import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    // The directory is public; the auth-identity mapping is not. Strip auth
    // identifiers so visitors can't enumerate real members' identities.
    return users.map(
      ({ tokenIdentifier: _tokenIdentifier, subject: _subject, ...user }) =>
        user,
    );
  },
});

async function findUserForIdentity(
  ctx: MutationCtx,
  identity: NonNullable<Awaited<ReturnType<MutationCtx["auth"]["getUserIdentity"]>>>,
): Promise<Doc<"users"> | null> {
  const byToken = await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .first();
  if (byToken) return byToken;

  const bySubject = await ctx.db
    .query("users")
    .withIndex("by_subject", (q) => q.eq("subject", identity.subject))
    .first();
  if (!bySubject) return null;

  await ctx.db.patch(bySubject._id, {
    tokenIdentifier: identity.tokenIdentifier,
  });
  return { ...bySubject, tokenIdentifier: identity.tokenIdentifier };
}

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
