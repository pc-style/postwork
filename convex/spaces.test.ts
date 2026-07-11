/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type Role = "admin" | "tester" | "member";

async function setup(role: Role) {
  const t = convexTest(schema, modules);
  const tokenIdentifier = `https://issuer.example|${role}`;
  const { orgId, userId } = await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("orgs", {
      name: "Postwork Demo",
      slug: "postwork-demo",
      createdAt: 1,
    });
    const userId = await ctx.db.insert("users", {
      orgId,
      name: role,
      title: "Teammate",
      avatarColor: "#8c1862",
      initials: role.slice(0, 2).toUpperCase(),
      role,
      status: "active",
      tokenIdentifier,
      subject: role,
    });
    return { orgId, userId };
  });
  const authed = t.withIdentity({
    tokenIdentifier,
    subject: role,
    issuer: "https://issuer.example",
  });
  return { t, authed, orgId, userId };
}

describe("space creation", () => {
  test("limits members to one space and adds the creator as a member", async () => {
    const { t, authed, orgId, userId } = await setup("member");

    const created = await authed.mutation(api.spaces.create, {
      name: "Launch Planning",
      description: "Coordinate the launch.",
    });

    await expect(
      authed.mutation(api.spaces.create, { name: "Another space" }),
    ).rejects.toThrow("Your role can create up to 1 space.");
    await expect(
      authed.query(api.spaces.creationStatus, {}),
    ).resolves.toEqual({ limit: 1, createdCount: 1, canCreate: false });

    const membership = await t.run(async (ctx) =>
      ctx.db
        .query("spaceMemberships")
        .withIndex("by_org_id_and_space_id_and_user_id", (q) =>
          q.eq("orgId", orgId).eq("spaceId", created.spaceId).eq("userId", userId),
        )
        .unique(),
    );
    expect(membership).not.toBeNull();
  });

  test("limits testers to three spaces", async () => {
    const { authed } = await setup("tester");

    for (let index = 1; index <= 3; index += 1) {
      await authed.mutation(api.spaces.create, { name: `Tester space ${index}` });
    }

    await expect(
      authed.mutation(api.spaces.create, { name: "Tester space 4" }),
    ).rejects.toThrow("Your role can create up to 3 spaces.");
    await expect(
      authed.query(api.spaces.creationStatus, {}),
    ).resolves.toEqual({ limit: 3, createdCount: 3, canCreate: false });
  });

  test("lets admins create unlimited spaces and generates unique slugs", async () => {
    const { authed } = await setup("admin");

    const first = await authed.mutation(api.spaces.create, { name: "Roadmap" });
    const second = await authed.mutation(api.spaces.create, { name: "Roadmap" });
    for (let index = 0; index < 3; index += 1) {
      await authed.mutation(api.spaces.create, { name: `Admin space ${index}` });
    }

    expect(first.slug).toBe("roadmap");
    expect(second.slug).toBe("roadmap-2");
    await expect(
      authed.query(api.spaces.creationStatus, {}),
    ).resolves.toEqual({ limit: null, createdCount: 0, canCreate: true });
  });
});
