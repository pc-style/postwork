import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

const voteValidator = v.union(v.literal("up"), v.literal("down"));

export const listVotes = query({
  args: { slugs: v.array(v.string()) },
  handler: async (ctx, { slugs }) => {
    const identity = await ctx.auth.getUserIdentity();

    return await Promise.all(
      slugs.map(async (slug) => {
        const votes = await ctx.db
          .query("flashExperimentVotes")
          .withIndex("by_slug", (q) => q.eq("slug", slug))
          .collect();

        return {
          slug,
          up: votes.filter((vote) => vote.vote === "up").length,
          down: votes.filter((vote) => vote.vote === "down").length,
          viewerVote:
            identity === null
              ? null
              : (votes.find((vote) => vote.voterSubject === identity.subject)?.vote ?? null),
        };
      }),
    );
  },
});

export const setVote = mutation({
  args: { slug: v.string(), vote: v.union(voteValidator, v.null()) },
  handler: async (ctx, { slug, vote }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Sign in to vote on flash experiments.",
      });
    }

    const existing = await ctx.db
      .query("flashExperimentVotes")
      .withIndex("by_slug_voter", (q) => q.eq("slug", slug).eq("voterSubject", identity.subject))
      .unique();

    if (vote === null) {
      if (existing) await ctx.db.delete(existing._id);
      return;
    }

    if (existing) {
      await ctx.db.patch(existing._id, { vote, updatedAt: Date.now() });
      return;
    }

    await ctx.db.insert("flashExperimentVotes", {
      slug,
      voterSubject: identity.subject,
      vote,
      updatedAt: Date.now(),
    });
  },
});
