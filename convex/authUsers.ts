import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export type AuthIdentity = NonNullable<
  Awaited<ReturnType<MutationCtx["auth"]["getUserIdentity"]>>
>;

export async function findUserForIdentity(
  ctx: MutationCtx,
  identity: AuthIdentity,
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
