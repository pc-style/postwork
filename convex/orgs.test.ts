/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { defaultOrgSlug, orgSlugError } from "./orgs";

const modules = import.meta.glob("./**/*.ts");

async function setup(tokenIdentifier = "https://issuer.example|owner") {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("orgs", { name: "Postwork", slug: "postwork", createdAt: 1 });
  });
  const owner = t.withIdentity({
    tokenIdentifier,
    subject: tokenIdentifier.split("|")[1] ?? "owner",
    issuer: "https://issuer.example",
    name: "Workspace Owner",
  });
  return { t, owner };
}

describe("organization slugs", () => {
  test("derives and validates canonical slugs", () => {
    expect(defaultOrgSlug("  Acme & Sons  ")).toBe("acme-sons");
    expect(orgSlugError("acme-2")).toBeNull();
    for (const slug of ["ab", "-acme", "acme-", "Acme", "acme_team", "postwork", "staging"]) {
      expect(orgSlugError(slug)).not.toBeNull();
    }
  });

  test("creates a pending owner's workspace with an explicit unique slug", async () => {
    const { owner } = await setup();
    await owner.mutation(api.users.ensureViewer, {});
    const created = await owner.mutation(api.orgs.create, { name: "Acme Inc", slug: "acme" });
    expect(created.slug).toBe("acme");
    const me = await owner.query(api.users.me, {});
    expect(me?.org).toEqual({ name: "Acme Inc", slug: "acme" });
  });

  test("rejects a slug already owned by another workspace", async () => {
    const { t, owner: first } = await setup();
    await first.mutation(api.users.ensureViewer, {});
    await first.mutation(api.orgs.create, { name: "Acme", slug: "acme" });

    const second = t.withIdentity({
      tokenIdentifier: "https://issuer.example|second",
      subject: "second",
      issuer: "https://issuer.example",
      name: "Second Owner",
    });
    await second.mutation(api.users.ensureViewer, {});
    await expect(
      second.mutation(api.orgs.create, { name: "Another Acme", slug: "acme" }),
    ).rejects.toThrow("already in use");
  });

  test("only an admin can backfill or change its workspace slug", async () => {
    const { owner } = await setup();
    await owner.mutation(api.users.ensureViewer, {});
    await owner.mutation(api.orgs.create, { name: "Acme", slug: "acme" });
    await expect(owner.mutation(api.orgs.setSlug, { slug: "acme-team" })).resolves.toEqual({
      slug: "acme-team",
    });
  });
});
