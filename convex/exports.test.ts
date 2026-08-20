/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ISSUER = "https://issuer.example";

describe("workspace export", () => {
  test("admins page through org-scoped rows; members are refused; sensitive fields stay out", async () => {
    const t = convexTest(schema, modules);
    const { orgId } = await t.run(async (ctx) => {
      await ctx.db.insert("orgs", { name: "Postwork", slug: "postwork", createdAt: 1 });
      const orgId = await ctx.db.insert("orgs", { name: "Acme", slug: "acme", createdAt: 1 });
      const otherOrgId = await ctx.db.insert("orgs", { name: "Other", slug: "other", createdAt: 1 });
      for (const [subject, role, org] of [
        ["boss", "admin", orgId],
        ["worker", "member", orgId],
        ["stranger", "admin", otherOrgId],
      ] as const) {
        const userId = await ctx.db.insert("users", {
          orgId: org,
          name: subject,
          title: "t",
          avatarColor: "#8c1862",
          initials: "XX",
          role,
          status: "active",
          tokenIdentifier: `${ISSUER}|${subject}`,
          email: `${subject}@example.com`,
        });
        await ctx.db.insert("orgMemberships", {
          orgId: org,
          userId,
          role,
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        });
      }
      return { orgId };
    });
    const identity = (subject: string) => ({
      tokenIdentifier: `${ISSUER}|${subject}`,
      subject,
      issuer: ISSUER,
    });

    const admin = t.withIdentity(identity("boss"));
    const users = await admin.query(api.exports.exportChunk, {
      table: "users",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(users.page).toHaveLength(2); // only this org
    for (const row of users.page as Array<Record<string, unknown>>) {
      expect(row.email).toBeUndefined();
      expect(row.tokenIdentifier).toBeUndefined();
      expect(row.orgId).toBe(orgId);
    }

    await expect(
      t.withIdentity(identity("worker")).query(api.exports.exportChunk, {
        table: "posts",
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow(/admins only/i);
  });
});
