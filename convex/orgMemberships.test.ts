/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import rateLimiterSchema from "../node_modules/@convex-dev/rate-limiter/src/component/schema";

const modules = import.meta.glob("./**/*.ts");
const rateLimiterModules = import.meta.glob(
  "../node_modules/@convex-dev/rate-limiter/src/component/**/*.ts",
);

type Role = "admin" | "tester" | "member";

const ISSUER = "https://issuer.example";

function identityFor(subject: string) {
  return { tokenIdentifier: `${ISSUER}|${subject}`, subject, issuer: ISSUER };
}

function makeHarness() {
  const t = convexTest(schema, modules);
  t.registerComponent("rateLimiter", rateLimiterSchema, rateLimiterModules);
  return t;
}

type Harness = ReturnType<typeof makeHarness>;

async function insertOrg(t: Harness, slug: string) {
  return await t.run(async (ctx) => {
    // ensureViewerUser resolves the product org on every call; make sure the
    // fixture deployment has one, like a real deployment does.
    const product = await ctx.db
      .query("orgs")
      .withIndex("by_slug", (q) => q.eq("slug", "postwork"))
      .unique();
    if (!product) {
      await ctx.db.insert("orgs", { name: "Postwork", slug: "postwork", createdAt: 1 });
    }
    return await ctx.db.insert("orgs", { name: slug, slug, createdAt: 1 });
  });
}

async function insertUser(
  t: Harness,
  orgId: Id<"orgs">,
  subject: string,
  role: Role,
  options?: { withMembership?: boolean },
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      orgId,
      name: subject,
      title: "Teammate",
      avatarColor: "#8c1862",
      initials: subject.slice(0, 2).toUpperCase(),
      role,
      status: "active",
      tokenIdentifier: `${ISSUER}|${subject}`,
      subject,
    });
    if (options?.withMembership !== false) {
      await ctx.db.insert("orgMemberships", {
        orgId,
        userId,
        role,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
    }
    return userId;
  });
}

describe("org membership backfill", () => {
  test("creates missing rows from legacy fields and is idempotent", async () => {
    const t = makeHarness();
    const orgId = await insertOrg(t, "acme");
    const activeId = await insertUser(t, orgId, "active-user", "tester", { withMembership: false });
    const deactivatedId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        orgId,
        name: "gone",
        title: "Former",
        avatarColor: "#8c1862",
        initials: "GO",
        role: "member",
        status: "active",
        deactivatedAt: 123,
      }),
    );

    const first = await t.mutation(internal.migrations.backfillOrgMemberships, {});
    expect(first.created).toBe(2);
    const second = await t.mutation(internal.migrations.backfillOrgMemberships, {});
    expect(second.created).toBe(0);

    const rows = await t.run(async (ctx) =>
      ctx.db.query("orgMemberships").collect(),
    );
    expect(rows).toHaveLength(2);
    const active = rows.find((r) => r.userId === activeId);
    const deactivated = rows.find((r) => r.userId === deactivatedId);
    expect(active).toMatchObject({ orgId, role: "tester", status: "active" });
    expect(active?.deactivatedAt).toBeUndefined();
    expect(deactivated?.deactivatedAt).toBe(123);
  });
});

describe("moderation writes through membership rows", () => {
  test("deactivation blocks posting even when a membership row exists", async () => {
    const t = makeHarness();
    const orgId = await insertOrg(t, "acme");
    await insertUser(t, orgId, "boss", "admin");
    const memberId = await insertUser(t, orgId, "worker", "member");
    const admin = t.withIdentity(identityFor("boss"));
    const member = t.withIdentity(identityFor("worker"));

    await member.mutation(api.posts.create, {
      title: "Before deactivation",
      body: "hello",
      space: "general",
      priority: "normal",
    });

    await admin.mutation(api.users.deactivate, { userId: memberId });

    const membership = await t.run(async (ctx) =>
      ctx.db
        .query("orgMemberships")
        .withIndex("by_org_id_and_user_id", (q) =>
          q.eq("orgId", orgId).eq("userId", memberId),
        )
        .unique(),
    );
    expect(membership?.deactivatedAt).toBeGreaterThan(0);

    await expect(
      member.mutation(api.posts.create, {
        title: "After deactivation",
        body: "blocked",
        space: "general",
        priority: "normal",
      }),
    ).rejects.toThrow(/deactivated/i);

    await admin.mutation(api.users.reactivate, { userId: memberId });
    await expect(
      member.mutation(api.posts.create, {
        title: "After reactivation",
        body: "hello again",
        space: "general",
        priority: "normal",
      }),
    ).resolves.toBeDefined();

    // Enterprise audit trail: both moderation actions leave tenant-visible rows.
    const auditActions = await t.run(async (ctx) =>
      (await ctx.db.query("auditLog").collect())
        .filter((row) => row.orgId === orgId)
        .map((row) => row.action),
    );
    expect(auditActions).toContain("user.deactivated");
    expect(auditActions).toContain("user.reactivated");
  });

  test("cannot demote the last admin", async () => {
    const t = makeHarness();
    const orgId = await insertOrg(t, "acme");
    const adminId = await insertUser(t, orgId, "boss", "admin");
    const admin = t.withIdentity(identityFor("boss"));

    await expect(
      admin.mutation(api.users.setRole, { userId: adminId, role: "member" }),
    ).rejects.toThrow(/at least one admin/i);
  });
});

describe("multi-workspace invites", () => {
  test("a user with a home org can redeem an invite into a second org", async () => {
    const t = makeHarness();
    const homeOrgId = await insertOrg(t, "home");
    const otherOrgId = await insertOrg(t, "other");
    const userId = await insertUser(t, homeOrgId, "traveler", "member");
    const inviterId = await insertUser(t, otherOrgId, "host", "admin");
    await t.run(async (ctx) => {
      await ctx.db.insert("invites", {
        orgId: otherOrgId,
        code: "join-other",
        createdBy: inviterId,
        createdAt: 1,
        maxUses: 1,
        usedCount: 0,
      });
    });

    const traveler = t.withIdentity(identityFor("traveler"));
    await traveler.mutation(api.access.redeemInvite, { code: "join-other" });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      memberships: await ctx.db
        .query("orgMemberships")
        .withIndex("by_user_id_and_status", (q) =>
          q.eq("userId", userId).eq("status", "active"),
        )
        .collect(),
    }));
    // Home org stays the legacy fallback; the new org is additive.
    expect(state.user?.orgId).toBe(homeOrgId);
    expect(state.memberships.map((m) => m.orgId).sort()).toEqual(
      [homeOrgId, otherOrgId].sort(),
    );

    const mine = await traveler.query(api.orgs.listMine, {});
    expect(mine.map((entry) => entry.org._id).sort()).toEqual(
      [homeOrgId, otherOrgId].sort(),
    );
  });

  test("a space-scoped invite adds the redeemer to that space", async () => {
    const t = makeHarness();
    const orgId = await insertOrg(t, "acme");
    const adminId = await insertUser(t, orgId, "boss", "admin");
    const admin = t.withIdentity(identityFor("boss"));
    const { spaceId } = await admin.mutation(api.spaces.create, {
      name: "Launch",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("invites", {
        orgId,
        spaceId,
        code: "join-space",
        createdBy: adminId,
        createdAt: 1,
        maxUses: 1,
        usedCount: 0,
      });
    });
    const newbieOrgless = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        name: "newbie",
        title: "New",
        avatarColor: "#8c1862",
        initials: "NB",
        status: "pending",
        tokenIdentifier: `${ISSUER}|newbie`,
        subject: "newbie",
      }),
    );
    const newbie = t.withIdentity(identityFor("newbie"));
    await newbie.mutation(api.access.redeemInvite, { code: "join-space" });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(newbieOrgless),
      spaceMembership: await ctx.db
        .query("spaceMemberships")
        .withIndex("by_org_id_and_space_id_and_user_id", (q) =>
          q.eq("orgId", orgId).eq("spaceId", spaceId).eq("userId", newbieOrgless),
        )
        .unique(),
    }));
    expect(state.user?.orgId).toBe(orgId);
    expect(state.user?.status).toBe("active");
    expect(state.spaceMembership).not.toBeNull();
  });
});

describe("space visibility and lifecycle", () => {
  async function spaceSetup() {
    const t = makeHarness();
    const orgId = await insertOrg(t, "acme");
    await insertUser(t, orgId, "boss", "admin");
    await insertUser(t, orgId, "creator", "tester");
    await insertUser(t, orgId, "outsider", "member");
    const admin = t.withIdentity(identityFor("boss"));
    const creator = t.withIdentity(identityFor("creator"));
    const outsider = t.withIdentity(identityFor("outsider"));
    return { t, orgId, admin, creator, outsider };
  }

  test("private spaces hide from non-members but not org admins", async () => {
    const { creator, outsider, admin } = await spaceSetup();
    const { slug } = await creator.mutation(api.spaces.create, {
      name: "Secret Plans",
      visibility: "private",
    });

    expect(await outsider.query(api.spaces.getBySlug, { slug })).toBeNull();
    expect(await creator.query(api.spaces.getBySlug, { slug })).toMatchObject({
      visibility: "private",
      viewerIsMember: true,
      viewerRole: "manager",
      viewerCanManage: true,
    });
    expect(await admin.query(api.spaces.getBySlug, { slug })).toMatchObject({
      visibility: "private",
      viewerIsMember: false,
      viewerCanManage: true,
    });
  });

  test("any active org member can post into a public space without joining", async () => {
    const { creator, outsider } = await spaceSetup();
    const { spaceId } = await creator.mutation(api.spaces.create, {
      name: "Open Space",
    });

    await expect(
      outsider.mutation(api.posts.create, {
        title: "Drive-by post",
        body: "public spaces welcome everyone in the org",
        space: "open-space",
        spaceId,
        priority: "normal",
      }),
    ).resolves.toBeDefined();
  });

  test("non-members cannot post into a private space", async () => {
    const { creator, outsider } = await spaceSetup();
    const { spaceId } = await creator.mutation(api.spaces.create, {
      name: "Members Only",
      visibility: "private",
    });

    await expect(
      outsider.mutation(api.posts.create, {
        title: "Sneaky",
        body: "should fail",
        space: "members-only",
        spaceId,
        priority: "normal",
      }),
    ).rejects.toThrow(/access to this space/i);
  });

  test("archived spaces are read-only", async () => {
    const { creator } = await spaceSetup();
    const { spaceId, slug } = await creator.mutation(api.spaces.create, {
      name: "Old Project",
    });
    await creator.mutation(api.posts.create, {
      title: "Historical record",
      body: "still readable",
      space: "old-project",
      spaceId,
      priority: "normal",
    });
    await creator.mutation(api.spaces.archive, { spaceId });

    await expect(
      creator.mutation(api.posts.create, {
        title: "Too late",
        body: "should fail",
        space: "old-project",
        spaceId,
        priority: "normal",
      }),
    ).rejects.toThrow(/read-only/i);

    const space = await creator.query(api.spaces.getBySlug, { slug });
    expect(space?.archivedAt).toBeGreaterThan(0);
    const posts = await creator.query(api.spaces.postsForSpace, { spaceId });
    expect(posts).toHaveLength(1);

    await creator.mutation(api.spaces.unarchive, { spaceId });
    await expect(
      creator.mutation(api.posts.create, {
        title: "Back in business",
        body: "works again",
        space: "old-project",
        spaceId,
        priority: "normal",
      }),
    ).resolves.toBeDefined();
  });

  test("managers govern membership; plain members do not", async () => {
    const { t, orgId, creator, outsider } = await spaceSetup();
    const { spaceId } = await creator.mutation(api.spaces.create, {
      name: "Team Room",
      visibility: "private",
    });
    const outsiderId = await t.run(async (ctx) =>
      (await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) =>
          q.eq("tokenIdentifier", `${ISSUER}|outsider`),
        )
        .unique())!._id,
    );

    await expect(
      outsider.mutation(api.spaces.addMember, { spaceId, userId: outsiderId }),
    ).rejects.toThrow(/managers or organization admins/i);

    await creator.mutation(api.spaces.addMember, { spaceId, userId: outsiderId });
    const membership = await t.run(async (ctx) =>
      ctx.db
        .query("spaceMemberships")
        .withIndex("by_org_id_and_space_id_and_user_id", (q) =>
          q.eq("orgId", orgId).eq("spaceId", spaceId).eq("userId", outsiderId),
        )
        .unique(),
    );
    expect(membership?.role).toBe("member");

    // The sole manager of a private space cannot abandon it.
    await expect(
      creator.mutation(api.spaces.leave, { spaceId }),
    ).rejects.toThrow(/another manager/i);

    await creator.mutation(api.spaces.setMemberRole, {
      spaceId,
      userId: outsiderId,
      role: "manager",
    });
    await expect(
      creator.mutation(api.spaces.leave, { spaceId }),
    ).resolves.toBeNull();
  });
});

describe("cross-org member visibility", () => {
  test("a member whose home org is elsewhere appears in this org's rosters with this org's role", async () => {
    const t = makeHarness();
    const homeOrgId = await insertOrg(t, "home");
    const otherOrgId = await insertOrg(t, "other");
    const travelerId = await insertUser(t, homeOrgId, "traveler", "member");
    await insertUser(t, otherOrgId, "host", "admin");
    await t.run(async (ctx) => {
      await ctx.db.insert("orgMemberships", {
        orgId: otherOrgId,
        userId: travelerId,
        role: "tester",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
    });

    const host = t.withIdentity(identityFor("host"));
    const roster = await host.query(api.admin.listUsers, {});
    const traveler = roster.find((entry) => entry._id === travelerId);
    expect(traveler).toBeDefined();
    // Role comes from the membership in THIS org, not the home-org fields.
    expect(traveler?.role).toBe("tester");
    expect(traveler?.status).toBe("active");

    // Moderation from this org acts on this org's membership only.
    await host.mutation(api.users.deactivate, { userId: travelerId });
    const after = await host.query(api.admin.listUsers, {});
    expect(after.find((entry) => entry._id === travelerId)?.deactivatedAt).toBeGreaterThan(0);
    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(travelerId),
      homeMembership: await ctx.db
        .query("orgMemberships")
        .withIndex("by_org_id_and_user_id", (q) =>
          q.eq("orgId", homeOrgId).eq("userId", travelerId),
        )
        .unique(),
    }));
    expect(state.user?.deactivatedAt).toBeUndefined();
    expect(state.homeMembership?.deactivatedAt).toBeUndefined();
  });
});
