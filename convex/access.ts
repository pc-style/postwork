import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { ensureViewerUser, getDefaultOrgId } from "./authUsers";
import { logAudit } from "./admin";
import { logInfo } from "./lib/observability";

/**
 * Public onboarding surface: join with an invite code, or request access
 * and wait for an admin to approve. These are intentionally callable while
 * signed out (except redeem, which binds the invite to the signed-in user).
 */

function inviteIsUsable(invite: Doc<"invites">): boolean {
  if (invite.revokedAt) return false;
  if (invite.expiresAt && invite.expiresAt <= Date.now()) return false;
  if (invite.maxUses > 0 && invite.usedCount >= invite.maxUses) return false;
  return true;
}

/** Validate an invite code before asking the visitor to sign in. */
export const checkInvite = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = args.code.trim().toLowerCase();
    if (!code) return { valid: false as const };
    const orgId = await getDefaultOrgId(ctx);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_org_id_and_code", (q) => q.eq("orgId", orgId).eq("code", code))
      .unique();
    if (!invite || !inviteIsUsable(invite)) return { valid: false as const };
    return { valid: true as const, note: invite.note };
  },
});

/**
 * Redeem an invite as the signed-in user. Marks the code used and audit-logs
 * the join. (Membership itself is currently org-wide on sign-in; this is the
 * future-proof hook where invite-gated membership will be enforced.)
 */
export const redeemInvite = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const viewer = await ensureViewerUser(ctx);
    const code = args.code.trim().toLowerCase();
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_org_id_and_code", (q) =>
        q.eq("orgId", viewer.orgId).eq("code", code),
      )
      .unique();
    if (!invite || !inviteIsUsable(invite)) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "That invite code is not valid anymore.",
      });
    }
    await ctx.db.patch(invite._id, { usedCount: invite.usedCount + 1 });
    await ctx.db.patch(viewer._id, { status: "active" });
    await logAudit(ctx, {
      orgId: viewer.orgId,
      actorId: viewer._id,
      action: "invite.redeemed",
      targetType: "invite",
      targetId: invite._id,
      metadata: { code: invite.code },
    });
    logInfo("access.inviteRedeemed", { inviteId: invite._id, userId: viewer._id });
    return { ok: true as const };
  },
});

/** Ask to join. Public; lands as a pending row in the admin panel. */
export const requestAccess = mutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase().slice(0, 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Enter a valid email address.",
      });
    }
    const orgId = await getDefaultOrgId(ctx);
    const existing = await ctx.db
      .query("accessRequests")
      .withIndex("by_org_id_and_email", (q) => q.eq("orgId", orgId).eq("email", email))
      .collect();
    if (existing.some((r) => r.status === "pending")) {
      return { ok: true as const, already: true as const };
    }
    const requestId = await ctx.db.insert("accessRequests", {
      orgId,
      email,
      name: args.name?.trim().slice(0, 80) || undefined,
      message: args.message?.trim().slice(0, 500) || undefined,
      status: "pending",
      createdAt: Date.now(),
    });
    await logAudit(ctx, {
      orgId,
      action: "accessRequest.created",
      targetType: "accessRequest",
      targetId: requestId,
      metadata: { email },
    });
    logInfo("access.requested", { requestId });
    return { ok: true as const, already: false as const };
  },
});
