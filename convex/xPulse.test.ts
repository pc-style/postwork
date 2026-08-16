/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  return await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("orgs", { name: "Acme", slug: "acme", createdAt: 1 });
    const agentId = await ctx.db.insert("users", {
      orgId,
      name: "X Pulse",
      title: "Connector Agent",
      avatarColor: "#8c1862",
      initials: "XP",
      isAgent: true,
      role: "member",
      status: "active",
    });
    const adminId = await ctx.db.insert("users", {
      orgId,
      name: "Admin",
      title: "Admin",
      avatarColor: "#8c1862",
      initials: "AD",
      role: "admin",
      status: "active",
    });
    const connectorId = await ctx.db.insert("connectors", {
      orgId,
      name: "X Pulse",
      slug: "x",
      capability: "inboundEvents",
      authStrategy: "bearer",
      agentId,
      credentialId: "test",
      xSyncHandle: "acme",
      createdById: adminId,
      createdAt: 1,
      updatedAt: 1,
    });
    return { orgId, agentId, connectorId };
  }).then((ids) => ({ t, ...ids }));
}

describe("x pulse", () => {
  test("records observations idempotently and publishes one digest per local day", async () => {
    const { t, orgId, agentId, connectorId } = await setup();

    await t.mutation(internal.xPulse.recordObservations, {
      connectorId,
      followers: 1000,
      items: [
        {
          externalId: "1",
          text: "hello world",
          url: "https://x.com/acme/status/1",
          sourceCreatedAt: Date.now(),
          views: 500,
          likes: 10,
        },
      ],
    });
    // Second observation updates metrics in place instead of duplicating.
    await t.mutation(internal.xPulse.recordObservations, {
      connectorId,
      followers: 1010,
      items: [
        {
          externalId: "1",
          text: "hello world",
          url: "https://x.com/acme/status/1",
          sourceCreatedAt: Date.now(),
          views: 900,
          likes: 25,
        },
      ],
    });
    const state = await t.run(async (ctx) => ({
      items: await ctx.db.query("xPulseItems").collect(),
      snapshots: await ctx.db.query("xPulseAccountSnapshots").collect(),
    }));
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ views: 900, likes: 25, orgId });
    expect(state.snapshots).toHaveLength(2);

    const first = await t.mutation(internal.xPulse.publishDigest, {
      connectorId,
      localDate: "2026-08-17",
      title: "x pulse — @acme — 2026-08-17",
      body: "digest body",
      summary: "digest summary",
    });
    expect(first.published).toBe(true);

    const second = await t.mutation(internal.xPulse.publishDigest, {
      connectorId,
      localDate: "2026-08-17",
      title: "dup",
      body: "dup",
      summary: "dup",
    });
    expect(second.published).toBe(false);

    const after = await t.run(async (ctx) => ({
      posts: await ctx.db.query("posts").collect(),
      items: await ctx.db.query("xPulseItems").collect(),
    }));
    expect(after.posts).toHaveLength(1);
    expect(after.posts[0]).toMatchObject({
      orgId,
      authorId: agentId,
      summaryModel: "connector/x-pulse",
      space: "x pulse",
    });
    expect(after.items[0].digestedAt).toBeGreaterThan(0);
  });
});
