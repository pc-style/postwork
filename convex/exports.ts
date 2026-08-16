import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import {
  getOrgMembership,
  getViewerFromAuth,
  forbidden,
  requireOrgId,
} from "./authUsers";
import { publicUser } from "./users";

/**
 * Workspace data export (data portability). Admin-only, chunked so the client
 * can assemble an arbitrarily large JSON export from bounded pages. Sensitive
 * fields (token identifiers, emails, connector secrets) never leave.
 */

const exportTable = v.union(
  v.literal("users"),
  v.literal("spaces"),
  v.literal("posts"),
  v.literal("replies"),
);

export const exportChunk = query({
  args: { table: exportTable, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const viewer = await getViewerFromAuth(ctx);
    if (!viewer) forbidden("Admins only.");
    const orgId = requireOrgId(viewer);
    const membership = await getOrgMembership(ctx, orgId, viewer._id);
    if (
      !membership ||
      membership.status !== "active" ||
      membership.deactivatedAt ||
      membership.role !== "admin"
    ) {
      forbidden("Admins only.");
    }

    if (args.table === "users") {
      const page = await ctx.db
        .query("users")
        .withIndex("by_org_id_and_role", (q) => q.eq("orgId", orgId))
        .paginate(args.paginationOpts);
      return { ...page, page: page.page.map((user) => publicUser(user)) };
    }
    if (args.table === "spaces") {
      const page = await ctx.db
        .query("spaces")
        .withIndex("by_org_id_and_slug", (q) => q.eq("orgId", orgId))
        .paginate(args.paginationOpts);
      return page;
    }
    if (args.table === "posts") {
      const page = await ctx.db
        .query("posts")
        .withIndex("by_org_id_and_last_activity_at", (q) => q.eq("orgId", orgId))
        .paginate(args.paginationOpts);
      return page;
    }
    const page = await ctx.db
      .query("replies")
      .withIndex("by_org_id_and_post_id_and_created_at", (q) =>
        q.eq("orgId", orgId),
      )
      .paginate(args.paginationOpts);
    return page;
  },
});
