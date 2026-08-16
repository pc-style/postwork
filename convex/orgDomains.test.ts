/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import rateLimiterSchema from "../node_modules/@convex-dev/rate-limiter/src/component/schema";
import {
  claimableDomainError,
  emailDomain,
  isPublicEmailProvider,
} from "./lib/emailDomains";

const modules = import.meta.glob("./**/*.ts");
const rateLimiterModules = import.meta.glob(
  "../node_modules/@convex-dev/rate-limiter/src/component/**/*.ts",
);
const ISSUER = "https://issuer.example";

function makeHarness() {
  const t = convexTest(schema, modules);
  t.registerComponent("rateLimiter", rateLimiterSchema, rateLimiterModules);
  return t;
}

function identityFor(subject: string, email?: string) {
  return {
    tokenIdentifier: `${ISSUER}|${subject}`,
    subject,
    issuer: ISSUER,
    ...(email ? { email } : {}),
  };
}

describe("email domain rules", () => {
  test("extracts and validates domains", () => {
    expect(emailDomain("a@acme.com")).toBe("acme.com");
    expect(emailDomain("a@ACME.com")).toBe("acme.com");
    expect(emailDomain("nope")).toBeNull();
    expect(emailDomain(undefined)).toBeNull();
  });

  test("public providers can never be claimed", () => {
    expect(isPublicEmailProvider("gmail.com")).toBe(true);
    expect(claimableDomainError("gmail.com", "a@gmail.com")).toMatch(/public email/i);
  });

  test("the admin's own email must live on the domain", () => {
    expect(claimableDomainError("acme.com", "boss@other.com")).toMatch(/own account email/i);
    expect(claimableDomainError("acme.com", "boss@acme.com")).toBeNull();
  });
});

describe("domain auto-join", () => {
  async function setup() {
    const t = makeHarness();
    const orgId = await t.run(async (ctx) => {
      await ctx.db.insert("orgs", { name: "Postwork", slug: "postwork", createdAt: 1 });
      const orgId = await ctx.db.insert("orgs", { name: "Acme", slug: "acme", createdAt: 1 });
      const adminId = await ctx.db.insert("users", {
        orgId,
        name: "boss",
        title: "t",
        avatarColor: "#8c1862",
        initials: "BO",
        role: "admin",
        status: "active",
        tokenIdentifier: `${ISSUER}|boss`,
        email: "boss@acme.com",
      });
      await ctx.db.insert("orgMemberships", {
        orgId,
        userId: adminId,
        role: "admin",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      return orgId;
    });
    return { t, orgId };
  }

  test("claimed domains activate matching sign-ups as members", async () => {
    const { t, orgId } = await setup();
    const admin = t.withIdentity(identityFor("boss", "boss@acme.com"));
    await admin.mutation(api.orgDomains.add, { domain: "acme.com" });

    const newcomer = t.withIdentity(identityFor("newbie", "dev@acme.com"));
    // First touch creates the pending account, then the activation gate runs.
    await newcomer.mutation(api.users.ensureViewer, {});
    const result = await newcomer.mutation(api.access.claimTargetedInvite, {});
    expect(result.activated).toBe(true);

    const state = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) =>
          q.eq("tokenIdentifier", `${ISSUER}|newbie`),
        )
        .unique();
      const membership = user
        ? await ctx.db
            .query("orgMemberships")
            .withIndex("by_org_id_and_user_id", (q) =>
              q.eq("orgId", orgId).eq("userId", user._id),
            )
            .unique()
        : null;
      const audit = (await ctx.db.query("auditLog").collect()).map((row) => row.action);
      return { user, membership, audit };
    });
    expect(state.membership).toMatchObject({ role: "member", status: "active" });
    expect(state.user?.orgId).toBe(orgId);
    expect(state.audit).toContain("member.domain_joined");
  });

  test("non-matching and public-provider emails do not auto-join", async () => {
    const { t } = await setup();
    const admin = t.withIdentity(identityFor("boss", "boss@acme.com"));
    await admin.mutation(api.orgDomains.add, { domain: "acme.com" });
    await expect(
      admin.mutation(api.orgDomains.add, { domain: "gmail.com" }),
    ).rejects.toThrow(/public email/i);

    const outsider = t.withIdentity(identityFor("out", "someone@other.com"));
    await outsider.mutation(api.users.ensureViewer, {});
    const result = await outsider.mutation(api.access.claimTargetedInvite, {});
    expect(result.activated).toBe(false);
  });

  test("a deactivated membership is never resurrected by domain join", async () => {
    const { t, orgId } = await setup();
    const admin = t.withIdentity(identityFor("boss", "boss@acme.com"));
    await admin.mutation(api.orgDomains.add, { domain: "acme.com" });

    const returning = t.withIdentity(identityFor("gone", "gone@acme.com"));
    await returning.mutation(api.users.ensureViewer, {});
    await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) =>
          q.eq("tokenIdentifier", `${ISSUER}|gone`),
        )
        .unique();
      await ctx.db.insert("orgMemberships", {
        orgId,
        userId: user!._id,
        role: "member",
        status: "active",
        deactivatedAt: 5,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const result = await returning.mutation(api.access.claimTargetedInvite, {});
    expect(result.activated).toBe(false);
  });
});
