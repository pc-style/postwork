/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const TOKEN = "https://issuer.example|product-member";

afterEach(() => {
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  const state = await t.run(async (ctx) => {
    const demoOrgId = await ctx.db.insert("orgs", {
      name: "Postwork Demo",
      slug: "postwork-demo",
      createdAt: 1,
    });
    const productOrgId = await ctx.db.insert("orgs", {
      name: "Postwork",
      slug: "postwork",
      createdAt: 2,
    });
    const demoUserId = await ctx.db.insert("users", {
      orgId: demoOrgId,
      name: "Demo User",
      title: "Demo",
      avatarColor: "#8c1862",
      initials: "DU",
      role: "member",
      status: "active",
    });
    const productUserId = await ctx.db.insert("users", {
      orgId: productOrgId,
      name: "Product User",
      title: "Member",
      avatarColor: "#8c1862",
      initials: "PU",
      role: "member",
      status: "active",
      tokenIdentifier: TOKEN,
      subject: "product-member",
    });
    const demoPostId = await ctx.db.insert("posts", {
      orgId: demoOrgId,
      authorId: demoUserId,
      title: "Demo post",
      body: "Demo body",
      space: "Company",
      priority: "normal",
      pinned: false,
      createdAt: 1,
      lastActivityAt: 1,
      replyCount: 0,
      participantIds: [demoUserId],
    });
    const productPostId = await ctx.db.insert("posts", {
      orgId: productOrgId,
      authorId: productUserId,
      title: "Product post",
      body: "Product body",
      space: "Company",
      priority: "urgent",
      pinned: false,
      createdAt: 2,
      lastActivityAt: 2,
      replyCount: 0,
      participantIds: [productUserId],
    });
    return {
      demoOrgId,
      productOrgId,
      demoUserId,
      productUserId,
      demoPostId,
      productPostId,
    };
  });
  const authed = t.withIdentity({
    tokenIdentifier: TOKEN,
    subject: "product-member",
    issuer: "https://issuer.example",
  });
  return { t, authed, ...state };
}

describe("shared deployment tenant isolation", () => {
  test("anonymous reads stay in demo even when given a product viewer", async () => {
    const state = await setup();
    const feed = await state.t.query(api.posts.feed, {
      viewerId: state.productUserId,
    });

    expect(feed.map((post) => post.title)).toEqual(["Demo post"]);
    await expect(
      state.t.query(api.posts.get, {
        postId: state.productPostId,
        viewerId: state.productUserId,
      }),
    ).resolves.toBeNull();
  });

  test("active product identities see product data and never demo data", async () => {
    const state = await setup();
    const feed = await state.authed.query(api.posts.feed, {
      viewerId: state.demoUserId,
    });

    expect(feed.map((post) => post.title)).toEqual(["Product post"]);
    await expect(
      state.authed.query(api.posts.get, {
        postId: state.demoPostId,
        viewerId: state.demoUserId,
      }),
    ).resolves.toBeNull();
  });

  test("pending product identities receive no demo fallback", async () => {
    const state = await setup();
    await state.t.run(async (ctx) => {
      await ctx.db.patch(state.productUserId, { status: "pending" });
    });

    await expect(
      state.authed.query(api.users.list, {}),
    ).resolves.toEqual([]);
    await expect(
      state.authed.query(api.posts.feed, {}),
    ).resolves.toEqual([]);
  });

  test("demo seed preserves product rows", async () => {
    vi.stubEnv("DEMO", "true");
    const state = await setup();

    await state.t.mutation(internal.seed.run, {});

    const preserved = await state.t.run(async (ctx) => ({
      org: await ctx.db.get(state.productOrgId),
      user: await ctx.db.get(state.productUserId),
      post: await ctx.db.get(state.productPostId),
      demoOrg: await ctx.db.get(state.demoOrgId),
      oldDemoPost: await ctx.db.get(state.demoPostId),
    }));
    expect(preserved.org?.slug).toBe("postwork");
    expect(preserved.user?.name).toBe("Product User");
    expect(preserved.post?.title).toBe("Product post");
    expect(preserved.demoOrg?._id).toBe(state.demoOrgId);
    expect(preserved.oldDemoPost).toBeNull();
  });
});
