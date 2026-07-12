/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("notification preferences API", () => {
  test("requires authentication", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.query(api.notificationPreferences.current, {}),
    ).rejects.toThrow("Sign in to view notification preferences.");
  });

  test("returns safe defaults and upserts the current user's org-scoped row", async () => {
    const t = convexTest(schema, modules);
    const tokenIdentifier = "https://issuer.example|member-1";
    const { orgId, userId } = await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("orgs", {
        name: "Postwork",
        slug: "postwork",
        createdAt: 1,
      });
      const userId = await ctx.db.insert("users", {
        orgId,
        name: "Ada",
        title: "Engineer",
        avatarColor: "#8c1862",
        initials: "AD",
        role: "member",
        status: "active",
        tokenIdentifier,
        subject: "member-1",
      });
      return { orgId, userId };
    });
    const authed = t.withIdentity({
      tokenIdentifier,
      subject: "member-1",
      issuer: "https://issuer.example",
    });

    await expect(
      authed.query(api.notificationPreferences.current, {}),
    ).resolves.toMatchObject({
      outboundEnabled: false,
      immediateUrgentEnabled: true,
      digestEnabled: true,
      quietHoursEnabled: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
      quietHoursTimeZone: "UTC",
      isDefault: true,
    });

    await authed.mutation(api.notificationPreferences.update, {
      outboundEnabled: true,
      immediateUrgentEnabled: false,
      digestEnabled: true,
      quietHoursEnabled: false,
      quietHoursStart: "21:30",
      quietHoursEnd: "21:30",
      quietHoursTimeZone: "Europe/Warsaw",
    });

    await authed.mutation(api.notificationPreferences.update, {
      outboundEnabled: true,
      immediateUrgentEnabled: false,
      digestEnabled: true,
      quietHoursEnabled: true,
      quietHoursStart: "21:30",
      quietHoursEnd: "07:15",
      quietHoursTimeZone: "Europe/Warsaw",
    });

    await expect(
      authed.query(api.notificationPreferences.current, {}),
    ).resolves.toMatchObject({
      outboundEnabled: true,
      immediateUrgentEnabled: false,
      quietHoursTimeZone: "Europe/Warsaw",
      isDefault: false,
    });
    const stored = await t.run(async (ctx) =>
      ctx.db
        .query("notificationPreferences")
        .withIndex("by_org_id_and_user_id", (q) =>
          q.eq("orgId", orgId).eq("userId", userId),
        )
        .unique(),
    );
    expect(stored).toMatchObject({ orgId, userId, outboundEnabled: true });
  });
});
