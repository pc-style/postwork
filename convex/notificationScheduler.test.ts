/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ISSUER = "https://issuer.example";

// 12:00 UTC — past every default quiet-hours end in UTC.
const NOON_UTC = Date.parse("2026-08-16T12:00:00Z");
// 03:00 UTC — before the default 08:00 digest release.
const NIGHT_UTC = Date.parse("2026-08-16T03:00:00Z");

async function setup(options?: {
  email?: string | null;
  outboundEnabled?: boolean;
}) {
  const t = convexTest(schema, modules);
  const { orgId, userId, authorId } = await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("orgs", {
      name: "Acme",
      slug: "acme",
      createdAt: 1,
    });
    const authorId = await ctx.db.insert("users", {
      orgId,
      name: "Author",
      title: "Teammate",
      avatarColor: "#8c1862",
      initials: "AU",
      role: "member",
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      orgId,
      name: "Reader",
      title: "Teammate",
      avatarColor: "#8c1862",
      initials: "RE",
      role: "member",
      status: "active",
      tokenIdentifier: `${ISSUER}|reader`,
      email: options?.email === null ? undefined : options?.email ?? "reader@example.com",
    });
    for (const target of [authorId, userId]) {
      await ctx.db.insert("orgMemberships", {
        orgId,
        userId: target,
        role: "member",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
    }
    await ctx.db.insert("notificationPreferences", {
      orgId,
      userId,
      outboundEnabled: options?.outboundEnabled ?? true,
      immediateUrgentEnabled: true,
      digestEnabled: true,
      quietHoursEnabled: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
      quietHoursTimeZone: "UTC",
      createdAt: 1,
      updatedAt: 1,
    });
    return { orgId, userId, authorId };
  });
  return { t, orgId, userId, authorId };
}

async function insertPost(
  t: Awaited<ReturnType<typeof setup>>["t"],
  orgId: Id<"orgs">,
  authorId: Id<"users">,
  priority: "urgent" | "high" | "normal",
  title: string,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("posts", {
      orgId,
      authorId,
      title,
      body: "body",
      space: "general",
      priority,
      pinned: false,
      createdAt: 10,
      lastActivityAt: 10,
      replyCount: 0,
      participantIds: [authorId],
    }),
  );
}

describe("notification scheduler", () => {
  test("collects an immediate urgent send and a daily digest with stable keys", async () => {
    const { t, orgId, userId, authorId } = await setup();
    const urgentId = await insertPost(t, orgId, authorId, "urgent", "Sev1");
    await insertPost(t, orgId, authorId, "normal", "Weekly notes");

    const dispatches = await t.query(
      internal.notificationScheduler.collectDispatches,
      { now: NOON_UTC },
    );

    expect(dispatches).toHaveLength(2);
    const immediate = dispatches.find((d) => d.candidates[0]?.kind === "immediate");
    const digest = dispatches.find((d) => d.candidates[0]?.kind === "digest");
    expect(immediate?.recipientEmail).toBe("reader@example.com");
    expect(immediate?.idempotencyKey).toBe(
      `sched/${userId}/immediate/2026-08-16/${urgentId}`,
    );
    expect(digest?.idempotencyKey).toBe(`sched/${userId}/digest/2026-08-16`);
    expect(digest?.candidates[0]?.items.map((item) => item.title)).toEqual([
      "Weekly notes",
    ]);

    // Same tick later in the day → identical keys (the claim table dedupes).
    const again = await t.query(
      internal.notificationScheduler.collectDispatches,
      { now: NOON_UTC + 60 * 60 * 1000 },
    );
    expect(again.map((d) => d.idempotencyKey).sort()).toEqual(
      dispatches.map((d) => d.idempotencyKey).sort(),
    );
  });

  test("holds the digest before the quiet-hours end and skips read posts", async () => {
    const { t, orgId, userId, authorId } = await setup();
    const postId = await insertPost(t, orgId, authorId, "normal", "Read me");
    await insertPost(t, orgId, authorId, "normal", "Unread");
    await t.run(async (ctx) => {
      await ctx.db.insert("postReads", {
        orgId,
        userId,
        postId,
        lastReadAt: 999,
      });
    });

    const night = await t.query(
      internal.notificationScheduler.collectDispatches,
      { now: NIGHT_UTC },
    );
    expect(night).toHaveLength(0);

    const morning = await t.query(
      internal.notificationScheduler.collectDispatches,
      { now: NOON_UTC },
    );
    expect(morning).toHaveLength(1);
    expect(morning[0].candidates[0].items.map((item) => item.title)).toEqual([
      "Unread",
    ]);
  });

  test("skips users without email, with outbound off, or deactivated", async () => {
    const noEmail = await setup({ email: null });
    await insertPost(noEmail.t, noEmail.orgId, noEmail.authorId, "normal", "P");
    expect(
      await noEmail.t.query(internal.notificationScheduler.collectDispatches, {
        now: NOON_UTC,
      }),
    ).toHaveLength(0);

    const optedOut = await setup({ outboundEnabled: false });
    await insertPost(optedOut.t, optedOut.orgId, optedOut.authorId, "normal", "P");
    expect(
      await optedOut.t.query(internal.notificationScheduler.collectDispatches, {
        now: NOON_UTC,
      }),
    ).toHaveLength(0);

    const deactivated = await setup();
    await insertPost(deactivated.t, deactivated.orgId, deactivated.authorId, "normal", "P");
    await deactivated.t.run(async (ctx) => {
      const membership = await ctx.db
        .query("orgMemberships")
        .withIndex("by_org_id_and_user_id", (q) =>
          q.eq("orgId", deactivated.orgId).eq("userId", deactivated.userId),
        )
        .unique();
      await ctx.db.patch(membership!._id, { deactivatedAt: 5 });
    });
    expect(
      await deactivated.t.query(internal.notificationScheduler.collectDispatches, {
        now: NOON_UTC,
      }),
    ).toHaveLength(0);
  });
});
