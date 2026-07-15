/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("demo seed deployment guard", () => {
  test.each([
    ["unset", undefined],
    ["false", "false"],
  ])("rejects when DEMO is %s before touching seed data", async (_label, demo) => {
    if (demo === undefined) {
      vi.stubEnv("DEMO", undefined);
    } else {
      vi.stubEnv("DEMO", demo);
    }
    const t = convexTest(schema, modules);

    await expect(t.mutation(internal.seed.run, {})).rejects.toThrow(
      "Demo seed requires DEMO=true on the Convex deployment.",
    );

    const demoOrg = await t.run(async (ctx) =>
      ctx.db
        .query("orgs")
        .withIndex("by_slug", (q) => q.eq("slug", "postwork-demo"))
        .unique(),
    );
    expect(demoOrg).toBeNull();
  });

  test("preserves seed behavior when DEMO is true", async () => {
    vi.stubEnv("DEMO", "true");
    const t = convexTest(schema, modules);

    await expect(t.mutation(internal.seed.run, {})).resolves.toEqual({
      message: "Seeded Postwork demo data.",
      orgs: 1,
      posts: 15,
      spaces: 3,
      users: 9,
    });

    const demoOrg = await t.run(async (ctx) =>
      ctx.db
        .query("orgs")
        .withIndex("by_slug", (q) => q.eq("slug", "postwork-demo"))
        .unique(),
    );
    expect(demoOrg?.name).toBe("Postwork Demo");
  });
});
