import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env, internalAction, internalQuery } from "./_generated/server";
import { canAccessPost, getOrgMembership } from "./authUsers";
import {
  composeOutboundCandidates,
  type NotificationItem,
  type NotificationPreferences,
  type OutboundDeliveryCandidate,
} from "./notificationComposer";
import {
  digestDue,
  immediateKeySuffix,
  localDateKey,
  summaryTeaser,
} from "./lib/outboundSchedule";
import { logInfo } from "./lib/observability";

/**
 * Outbound notification scheduler — the retention hook. Every tick it turns
 * per-user unread state into at most one urgent email (keyed by the urgent
 * post set) and one daily digest (keyed by the local date, released when
 * quiet hours end). notificationDelivery's claim table plus Resend's
 * idempotency make repeated ticks safe.
 */

const POSTS_SCAN_LIMIT = 100;
const MAX_DISPATCHES_PER_RUN = 100;

export type OutboundDispatch = {
  orgId: Id<"orgs">;
  recipientEmail: string;
  candidates: OutboundDeliveryCandidate[];
  idempotencyKey: string;
};

export const collectDispatches = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args): Promise<OutboundDispatch[]> => {
    const dispatches: OutboundDispatch[] = [];
    const now = new Date(args.now);
    const prefRows = await ctx.db.query("notificationPreferences").collect();

    for (const prefRow of prefRows) {
      if (!prefRow.outboundEnabled) continue;
      const user = await ctx.db.get(prefRow.userId);
      if (!user?.email || !user.tokenIdentifier || user.isAgent) continue;
      const membership = await getOrgMembership(ctx, prefRow.orgId, user._id);
      if (
        !membership ||
        membership.status !== "active" ||
        membership.deactivatedAt
      ) {
        continue;
      }

      const preferences: NotificationPreferences = {
        browserEnabled: prefRow.browserEnabled ?? false,
        outboundEnabled: prefRow.outboundEnabled,
        immediateUrgentEnabled: prefRow.immediateUrgentEnabled,
        digestEnabled: prefRow.digestEnabled,
        quietHoursEnabled: prefRow.quietHoursEnabled,
        quietHoursStart: prefRow.quietHoursStart,
        quietHoursEnd: prefRow.quietHoursEnd,
        quietHoursTimeZone: prefRow.quietHoursTimeZone,
      };

      const posts = await ctx.db
        .query("posts")
        .withIndex("by_org_id_and_last_activity_at", (q) =>
          q.eq("orgId", prefRow.orgId),
        )
        .order("desc")
        .take(POSTS_SCAN_LIMIT);

      const items: NotificationItem[] = [];
      for (const post of posts) {
        if (!(await canAccessPost(ctx, post, user._id))) continue;
        const read = await ctx.db
          .query("postReads")
          .withIndex("by_org_id_and_user_id_and_post_id", (q) =>
            q
              .eq("orgId", prefRow.orgId)
              .eq("userId", user._id)
              .eq("postId", post._id),
          )
          .unique();
        if (read && read.lastReadAt >= post.lastActivityAt) continue;
        items.push({
          postId: post._id,
          title: post.title,
          priority: post.priority,
          lastActivityAt: post.lastActivityAt,
          unread: true,
          space: post.space,
          url: `/app/posts/${post._id}`,
          teaser: summaryTeaser(post.summary),
        });
      }
      if (items.length === 0) continue;

      const candidates = composeOutboundCandidates({ items, preferences, now });
      const dateKey = localDateKey(now, preferences.quietHoursTimeZone);
      for (const candidate of candidates) {
        if (candidate.kind === "digest" && !digestDue(now, preferences)) {
          continue;
        }
        const idempotencyKey =
          candidate.kind === "digest"
            ? `sched/${user._id}/digest/${dateKey}`
            : `sched/${user._id}/immediate/${dateKey}/${immediateKeySuffix(candidate.items)}`;
        dispatches.push({
          orgId: prefRow.orgId,
          recipientEmail: user.email,
          candidates: [candidate],
          idempotencyKey,
        });
        if (dispatches.length >= MAX_DISPATCHES_PER_RUN) return dispatches;
      }
    }
    return dispatches;
  },
});

type SchedulerRunResult =
  | { status: "skipped_demo"; dispatched: 0 }
  | { status: "ran"; dispatched: number; sent: number; failed: number };

export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<SchedulerRunResult> => {
    // Demo deployments never email anyone.
    if (env.DEMO !== "false") {
      return { status: "skipped_demo" as const, dispatched: 0 };
    }
    const dispatches = await ctx.runQuery(
      internal.notificationScheduler.collectDispatches,
      { now: Date.now() },
    );
    let sent = 0;
    let failed = 0;
    for (const dispatch of dispatches) {
      const result = await ctx.runAction(
        internal.notificationDelivery.dispatch,
        dispatch,
      );
      if (result.status === "sent") sent += 1;
      else if (result.status === "provider_failed") failed += 1;
    }
    if (dispatches.length > 0) {
      logInfo("notification.schedulerRun", {
        candidates: dispatches.length,
        sent,
        failed,
      });
    }
    return { status: "ran" as const, dispatched: dispatches.length, sent, failed };
  },
});
