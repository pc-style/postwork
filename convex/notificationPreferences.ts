import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  ensureActiveViewerUser,
  forbidden,
  getViewerFromAuth,
  unauthenticated,
  requireOrgId,
} from "./authUsers";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "./notificationComposer";

export const preferenceArgs = {
  outboundEnabled: v.boolean(),
  immediateUrgentEnabled: v.boolean(),
  digestEnabled: v.boolean(),
  quietHoursEnabled: v.boolean(),
  quietHoursStart: v.string(),
  quietHoursEnd: v.string(),
  quietHoursTimeZone: v.string(),
};

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) unauthenticated("Sign in to view notification preferences.");

    const viewer = await getViewerFromAuth(ctx);
    if (!viewer)
      unauthenticated("Finish account setup to view notification preferences.");
    if (viewer.status === "pending" || viewer.deactivatedAt) {
      forbidden(
        "An active account is required to view notification preferences.",
      );
    }

    const orgId = requireOrgId(viewer);
    const stored = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_org_id_and_user_id", (q) =>
        q.eq("orgId", orgId).eq("userId", viewer._id),
      )
      .unique();

    if (!stored) {
      return { ...DEFAULT_NOTIFICATION_PREFERENCES, isDefault: true as const };
    }
    return { ...toPublicPreferences(stored), isDefault: false as const };
  },
});

export const update = mutation({
  args: preferenceArgs,
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx, {
      unauthenticatedMessage: "Sign in to update notification preferences.",
    });
    return await savePreferences(ctx, viewer, args);
  },
});

export async function savePreferences(
  ctx: MutationCtx,
  viewer: Awaited<ReturnType<typeof ensureActiveViewerUser>>,
  args: NotificationPreferences,
) {
    const orgId = requireOrgId(viewer);
    const preferences = validatePreferences(args);
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_org_id_and_user_id", (q) =>
        q.eq("orgId", orgId).eq("userId", viewer._id),
      )
      .unique();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { ...preferences, updatedAt: now });
    } else {
      await ctx.db.insert("notificationPreferences", {
        orgId,
        userId: viewer._id,
        ...preferences,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { ...preferences, isDefault: false as const };
}

function toPublicPreferences(
  stored: NotificationPreferences,
): NotificationPreferences {
  return {
    outboundEnabled: stored.outboundEnabled,
    immediateUrgentEnabled: stored.immediateUrgentEnabled,
    digestEnabled: stored.digestEnabled,
    quietHoursEnabled: stored.quietHoursEnabled,
    quietHoursStart: stored.quietHoursStart,
    quietHoursEnd: stored.quietHoursEnd,
    quietHoursTimeZone: stored.quietHoursTimeZone,
  };
}

function validatePreferences(
  args: NotificationPreferences,
): NotificationPreferences {
  validateTime(args.quietHoursStart, "quietHoursStart");
  validateTime(args.quietHoursEnd, "quietHoursEnd");
  if (
    args.quietHoursEnabled &&
    args.quietHoursStart === args.quietHoursEnd
  ) {
    invalidPreference(
      "quietHoursEnd",
      "Quiet hours must have different start and end times.",
    );
  }
  validateTimeZone(args.quietHoursTimeZone);
  return args;
}

function validateTime(value: string, field: string): void {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    invalidPreference(field, "Use a 24-hour time such as 22:00.");
  }
}

function validateTimeZone(value: string): void {
  if (!value || value.length > 100) {
    invalidPreference("quietHoursTimeZone", "Choose a valid time zone.");
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
  } catch {
    invalidPreference("quietHoursTimeZone", "Choose a valid IANA time zone.");
  }
}

function invalidPreference(field: string, message: string): never {
  throw new ConvexError({
    code: "INVALID_INPUT" as const,
    field,
    message,
  });
}
