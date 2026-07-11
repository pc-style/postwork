/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const TOKEN = "https://issuer.example|catch-up-viewer";

async function setup() {
  const t = convexTest(schema, modules);
  const state = await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("orgs", {
      name: "Postwork Demo",
      slug: "postwork-demo",
      createdAt: 1,
    });
    const foreignOrgId = await ctx.db.insert("orgs", {
      name: "Foreign org",
      slug: "foreign-org",
      createdAt: 1,
    });
    const viewerId = await ctx.db.insert("users", {
      orgId,
      name: "Viewer",
      title: "Teammate",
      avatarColor: "#8c1862",
      initials: "VI",
      role: "member",
      status: "active",
      tokenIdentifier: TOKEN,
      subject: "catch-up-viewer",
    });
    const authorId = await ctx.db.insert("users", {
      orgId,
      name: "Author",
      title: "Teammate",
      avatarColor: "#111111",
      initials: "AU",
      role: "member",
      status: "active",
    });
    const foreignAuthorId = await ctx.db.insert("users", {
      orgId: foreignOrgId,
      name: "Foreign",
      title: "Teammate",
      avatarColor: "#222222",
      initials: "FO",
      role: "member",
      status: "active",
    });
    const privateSpaceId = await ctx.db.insert("spaces", {
      orgId,
      name: "Private",
      slug: "private",
      createdBy: authorId,
      createdAt: 1,
    });
    return {
      orgId,
      foreignOrgId,
      viewerId,
      authorId,
      foreignAuthorId,
      privateSpaceId,
    };
  });
  const authed = t.withIdentity({
    tokenIdentifier: TOKEN,
    subject: "catch-up-viewer",
    issuer: "https://issuer.example",
  });
  return { t, authed, ...state };
}

async function insertPost(
  t: ReturnType<typeof convexTest>,
  args: {
    orgId: Id<"orgs">;
    authorId: Id<"users">;
    title: string;
    priority: "urgent" | "high" | "normal";
    activity: number;
    spaceId?: Id<"spaces">;
    summary?: string;
    summaryUpdatedAt?: number;
  },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("posts", {
      orgId: args.orgId,
      authorId: args.authorId,
      title: args.title,
      body: `${args.title} body`,
      space: args.spaceId ? "Private" : "Company",
      spaceId: args.spaceId,
      priority: args.priority,
      pinned: false,
      createdAt: args.activity,
      lastActivityAt: args.activity,
      replyCount: 0,
      participantIds: [args.authorId],
      summary: args.summary,
      summaryModel: args.summary ? "test/model" : undefined,
      summaryUpdatedAt: args.summaryUpdatedAt,
    }),
  );
}

describe("posts.catchUpDigest", () => {
  test("returns only the viewer's accessible unread posts with summary status", async () => {
    const state = await setup();
    const readPostId = await insertPost(state.t, {
      orgId: state.orgId,
      authorId: state.authorId,
      title: "Already read",
      priority: "urgent",
      activity: 100,
    });
    await insertPost(state.t, {
      orgId: state.orgId,
      authorId: state.authorId,
      title: "Stale high",
      priority: "high",
      activity: 90,
      summary: "Old summary",
      summaryUpdatedAt: 80,
    });
    await insertPost(state.t, {
      orgId: state.orgId,
      authorId: state.authorId,
      title: "Missing normal",
      priority: "normal",
      activity: 95,
    });
    await insertPost(state.t, {
      orgId: state.orgId,
      authorId: state.authorId,
      title: "In inaccessible space",
      priority: "urgent",
      activity: 110,
      spaceId: state.privateSpaceId,
    });
    await insertPost(state.t, {
      orgId: state.foreignOrgId,
      authorId: state.foreignAuthorId,
      title: "Foreign secret",
      priority: "urgent",
      activity: 120,
    });
    await state.t.run(async (ctx) => {
      await ctx.db.insert("postReads", {
        orgId: state.orgId,
        userId: state.viewerId,
        postId: readPostId,
        lastReadAt: 100,
      });
    });

    const digest = await state.authed.query(api.posts.catchUpDigest, {});

    expect(digest.items.map((item) => item.post.title)).toEqual([
      "Stale high",
      "Missing normal",
    ]);
    expect(digest.items.map((item) => item.summary.status)).toEqual([
      "stale",
      "missing",
    ]);
    expect(digest).toMatchObject({ totalEligible: 2, omittedCount: 0 });
  });

  test("requires authentication and rejects pending viewers", async () => {
    const state = await setup();

    await expect(
      state.t.query(api.posts.catchUpDigest, {}),
    ).rejects.toThrow("Sign in to view your catch-up digest.");

    await state.t.run(async (ctx) => {
      await ctx.db.patch(state.viewerId, { status: "pending" });
    });
    await expect(
      state.authed.query(api.posts.catchUpDigest, {}),
    ).rejects.toThrow("Your account cannot access the catch-up digest.");

    await state.t.run(async (ctx) => {
      await ctx.db.patch(state.viewerId, {
        status: "active",
        deactivatedAt: 10,
      });
    });
    await expect(
      state.authed.query(api.posts.catchUpDigest, {}),
    ).rejects.toThrow("Your account cannot access the catch-up digest.");
  });
});
