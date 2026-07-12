import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  ensureActiveViewerUser,
  getViewerFromAuth,
} from "./authUsers";
import { publicUser } from "./users";
import { parseInviteTarget, type InviteTarget } from "./lib/inviteTargets";
import { logInfo } from "./lib/observability";
import { parse, profileTitleSchema } from "./lib/validation";
import { aiGenerationKind } from "./schema";
import {
  DEFAULT_OPENROUTER_MODEL,
  normalizeModelId,
  type AiGenerationKind,
} from "./lib/aiModels";

/**
 * Admin control plane — users, invites, access requests, audit history.
 *
 * Every query/mutation here does its own server-side admin check; the /admin
 * route gate on the client is convenience, not security.
 */

/**
 * Demo deployments have no auth identity at all — the local switcher picks a
 * persona client-side. In that mode (server-side CONVEX demo flag, not a
 * client value) admin surfaces act as the seeded admin. Product deployments
 * always require a real authenticated admin.
 */
async function requireAdminForRead(ctx: QueryCtx): Promise<Doc<"users">> {
  const viewer = await getViewerFromAuth(ctx);
  if (!viewer) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in first." });
  }
  // Admin implies an activated account — a pending user is never an admin.
  if (viewer.status === "pending" || viewer.role !== "admin") {
    throw new ConvexError({ code: "FORBIDDEN", message: "Admins only." });
  }
  return viewer;
}

async function requireAdminForWrite(ctx: MutationCtx): Promise<Doc<"users">> {
  // ensureActiveViewerUser rejects pending (invite-not-redeemed) accounts, so
  // a pending first-user cannot mint themselves an invite via the admin API.
  const viewer = await ensureActiveViewerUser(ctx);
  if (viewer.role !== "admin") {
    throw new ConvexError({ code: "FORBIDDEN", message: "Admins only." });
  }
  return viewer;
}

export async function logAudit(
  ctx: MutationCtx,
  entry: {
    orgId: Id<"orgs"> | undefined;
    actorId?: Id<"users">;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await ctx.db.insert("auditLog", {
    orgId: entry.orgId,
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : undefined,
    createdAt: Date.now(),
  });
}

/** Is the current viewer an org admin? Cheap gate for the /admin routes. */
export const viewerIsAdmin = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewerFromAuth(ctx);
    return viewer?.status !== "pending" && viewer?.role === "admin";
  },
});

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdminForRead(ctx);
    const orgId = admin.orgId;
    const users = await ctx.db
      .query("users")
      .withIndex("by_org_id_and_role", (q) => q.eq("orgId", orgId))
      .collect();
    const invites = await ctx.db
      .query("invites")
      .withIndex("by_org_id_and_created_at", (q) => q.eq("orgId", orgId))
      .collect();
    const pending = await ctx.db
      .query("accessRequests")
      .withIndex("by_org_id_and_status_and_created_at", (q) =>
        q.eq("orgId", orgId).eq("status", "pending"),
      )
      .collect();
    const recentAudit = await ctx.db
      .query("auditLog")
      .withIndex("by_org_id_and_created_at", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(8);
    const now = Date.now();
    const activeInvites = invites.filter(
      (i) =>
        !i.revokedAt &&
        (!i.expiresAt || i.expiresAt > now) &&
        (i.maxUses === 0 || i.usedCount < i.maxUses),
    );
    return {
      members: users.filter((u) => !u.isAgent).length,
      agents: users.filter((u) => u.isAgent).length,
      deactivated: users.filter((u) => u.deactivatedAt).length,
      activeInvites: activeInvites.length,
      pendingRequests: pending.length,
      recentAudit,
    };
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdminForRead(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_org_id_and_role", (q) => q.eq("orgId", admin.orgId))
      .collect();
    return users.map((u) => publicUser(u));
  },
});

const AI_GENERATION_KINDS: readonly AiGenerationKind[] = [
  "postSummary",
  "agentTask",
];

export const aiModelSettings = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdminForRead(ctx);
    const settings = await ctx.db
      .query("aiGenerationSettings")
      .withIndex("by_org_id_and_kind", (q) => q.eq("orgId", admin.orgId))
      .collect();
    const byKind = new Map(settings.map((setting) => [setting.kind, setting]));
    const updaterIds = [...new Set(settings.map((setting) => setting.updatedById))];
    const updaterNames = new Map<string, string>();
    for (const updaterId of updaterIds) {
      const user = await ctx.db.get(updaterId);
      updaterNames.set(updaterId, user?.name ?? "unknown");
    }

    return {
      openRouterConfigured: !!process.env.OPENROUTER_API_KEY,
      defaultOpenRouterModel: process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
      settings: AI_GENERATION_KINDS.map((kind) => {
        const setting = byKind.get(kind);
        return {
          kind,
          modelId: setting?.modelId ?? null,
          effectiveModelId:
            setting?.modelId ?? process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
          updatedAt: setting?.updatedAt ?? null,
          updatedByName: setting
            ? (updaterNames.get(setting.updatedById) ?? "unknown")
            : null,
        };
      }),
    };
  },
});

export const setAiModelSetting = mutation({
  args: { kind: aiGenerationKind, modelId: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdminForWrite(ctx);
    const modelId = normalizeModelId(args.modelId);
    const existing = await ctx.db
      .query("aiGenerationSettings")
      .withIndex("by_org_id_and_kind", (q) =>
        q.eq("orgId", admin.orgId).eq("kind", args.kind),
      )
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        modelId,
        updatedAt: now,
        updatedById: admin._id,
      });
    } else {
      await ctx.db.insert("aiGenerationSettings", {
        orgId: admin.orgId,
        kind: args.kind,
        modelId,
        createdAt: now,
        updatedAt: now,
        updatedById: admin._id,
      });
    }
    await logAudit(ctx, {
      orgId: admin.orgId,
      actorId: admin._id,
      action: "aiModelSetting.updated",
      targetType: "aiGenerationSetting",
      targetId: args.kind,
      metadata: { modelId },
    });
    return modelId;
  },
});

export const resetAiModelSetting = mutation({
  args: { kind: aiGenerationKind },
  handler: async (ctx, args) => {
    const admin = await requireAdminForWrite(ctx);
    const existing = await ctx.db
      .query("aiGenerationSettings")
      .withIndex("by_org_id_and_kind", (q) =>
        q.eq("orgId", admin.orgId).eq("kind", args.kind),
      )
      .collect();
    await Promise.all(existing.map((setting) => ctx.db.delete(setting._id)));
    await logAudit(ctx, {
      orgId: admin.orgId,
      actorId: admin._id,
      action: "aiModelSetting.reset",
      targetType: "aiGenerationSetting",
      targetId: args.kind,
    });
  },
});

export const setTitle = mutation({
  args: { userId: v.id("users"), title: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdminForWrite(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target || target.orgId !== admin.orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found." });
    }
    const title = parse(profileTitleSchema, args.title, "title");
    await ctx.db.patch(args.userId, { title });
    await logAudit(ctx, {
      orgId: admin.orgId,
      actorId: admin._id,
      action: "user.titleChanged",
      targetType: "user",
      targetId: args.userId,
      metadata: { title },
    });
    logInfo("user.titleChanged", { userId: args.userId, adminId: admin._id });
  },
});

export const listInvites = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdminForRead(ctx);
    const invites = await ctx.db
      .query("invites")
      .withIndex("by_org_id_and_created_at", (q) => q.eq("orgId", admin.orgId))
      .order("desc")
      .collect();
    const creators = new Map<string, string>();
    for (const invite of invites) {
      if (!creators.has(invite.createdBy)) {
        const creator = await ctx.db.get(invite.createdBy);
        creators.set(invite.createdBy, creator?.name ?? "unknown");
      }
    }
    return invites.map((invite) => ({
      ...invite,
      createdByName: creators.get(invite.createdBy) ?? "unknown",
    }));
  },
});

export const listAccessRequests = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdminForRead(ctx);
    const requests = await ctx.db
      .query("accessRequests")
      .withIndex("by_org_id_and_status_and_created_at", (q) =>
        q.eq("orgId", admin.orgId),
      )
      .collect();
    return requests.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listAuditLog = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const admin = await requireAdminForRead(ctx);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
    const entries = await ctx.db
      .query("auditLog")
      .withIndex("by_org_id_and_created_at", (q) => q.eq("orgId", admin.orgId))
      .order("desc")
      .take(limit);
    const actors = new Map<string, string>();
    const resolved = [];
    for (const entry of entries) {
      let actorName: string | undefined;
      if (entry.actorId) {
        if (!actors.has(entry.actorId)) {
          const actor = await ctx.db.get(entry.actorId);
          actors.set(entry.actorId, actor?.name ?? "unknown");
        }
        actorName = actors.get(entry.actorId);
      }
      resolved.push({ ...entry, actorName });
    }
    return resolved;
  },
});

function randomInviteCode(): string {
  // pw- + 10 unambiguous chars. Math.random is fine for invite entropy here;
  // codes are also rate-limited by being admin-minted and single-org.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `pw-${code}`;
}

export const createInvite = mutation({
  args: {
    note: v.optional(v.string()),
    maxUses: v.optional(v.number()),
    expiresInDays: v.optional(v.number()),
    // "Hot" invite target: a github handle (with or without @) or an email.
    // The targeted person is auto-activated on sign-in, no code entry needed.
    target: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdminForWrite(ctx);
    let target: InviteTarget | null;
    try {
      target = parseInviteTarget(args.target);
    } catch (err) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: err instanceof Error ? err.message : "Invalid invite target.",
      });
    }
    // Targeted invites admit exactly the one person.
    const maxUses = target
      ? 1
      : Math.min(Math.max(Math.floor(args.maxUses ?? 1), 0), 1000);
    const note = args.note?.trim().slice(0, 200) || undefined;
    const expiresAt =
      args.expiresInDays && args.expiresInDays > 0
        ? Date.now() + Math.min(args.expiresInDays, 365) * 24 * 60 * 60 * 1000
        : undefined;
    const inviteId = await ctx.db.insert("invites", {
      orgId: admin.orgId,
      code: randomInviteCode(),
      note,
      createdBy: admin._id,
      createdAt: Date.now(),
      maxUses,
      usedCount: 0,
      expiresAt,
      targetKind: target?.kind,
      targetValue: target?.value,
    });
    await logAudit(ctx, {
      orgId: admin.orgId,
      actorId: admin._id,
      action: "invite.created",
      targetType: "invite",
      targetId: inviteId,
      metadata: {
        maxUses,
        note,
        ...(target ? { target: `${target.kind}:${target.value}` } : {}),
      },
    });
    logInfo("admin.inviteCreated", { inviteId, adminId: admin._id });
    return inviteId;
  },
});

export const revokeInvite = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, args) => {
    const admin = await requireAdminForWrite(ctx);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.orgId !== admin.orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Invite not found." });
    }
    if (invite.revokedAt) return;
    await ctx.db.patch(args.inviteId, { revokedAt: Date.now() });
    await logAudit(ctx, {
      orgId: admin.orgId,
      actorId: admin._id,
      action: "invite.revoked",
      targetType: "invite",
      targetId: args.inviteId,
      metadata: { code: invite.code },
    });
  },
});

export const approveAccessRequest = mutation({
  args: { requestId: v.id("accessRequests") },
  handler: async (ctx, args) => {
    const admin = await requireAdminForWrite(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.orgId !== admin.orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Request not found." });
    }
    if (request.status !== "pending") {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Request is already resolved.",
      });
    }
    // Mint a single-use invite for the requester; delivering the code (email)
    // is a follow-up integration — the admin can copy it from the invites list.
    const inviteId = await ctx.db.insert("invites", {
      orgId: admin.orgId,
      code: randomInviteCode(),
      note: `access request: ${request.email}`,
      createdBy: admin._id,
      createdAt: Date.now(),
      maxUses: 1,
      usedCount: 0,
    });
    await ctx.db.patch(args.requestId, {
      status: "approved",
      resolvedBy: admin._id,
      resolvedAt: Date.now(),
      inviteId,
    });
    await logAudit(ctx, {
      orgId: admin.orgId,
      actorId: admin._id,
      action: "accessRequest.approved",
      targetType: "accessRequest",
      targetId: args.requestId,
      metadata: { email: request.email, inviteId },
    });
  },
});

export const denyAccessRequest = mutation({
  args: { requestId: v.id("accessRequests") },
  handler: async (ctx, args) => {
    const admin = await requireAdminForWrite(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.orgId !== admin.orgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Request not found." });
    }
    if (request.status !== "pending") {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Request is already resolved.",
      });
    }
    await ctx.db.patch(args.requestId, {
      status: "denied",
      resolvedBy: admin._id,
      resolvedAt: Date.now(),
    });
    await logAudit(ctx, {
      orgId: admin.orgId,
      actorId: admin._id,
      action: "accessRequest.denied",
      targetType: "accessRequest",
      targetId: args.requestId,
      metadata: { email: request.email },
    });
  },
});
