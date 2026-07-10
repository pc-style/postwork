import { describe, expect, test } from "bun:test";
import {
  DEMO_BANNER_MESSAGE,
  getDemoPolicy,
  parseDemoFlag,
} from "../src/lib/demoMode";

describe("demo mode policy", () => {
  test("defaults to the public demo", () => {
    expect(parseDemoFlag(undefined)).toBe(true);
    expect(getDemoPolicy(parseDemoFlag(undefined)).mode).toBe("demo");
  });

  test("shows the banner and lab in demo mode", () => {
    const policy = getDemoPolicy(true);

    expect(policy.publicDemoBanner).toBe(true);
    expect(policy.flashExperimentsLab).toBe(true);
    expect(DEMO_BANNER_MESSAGE).toBe(
      "public demo — data resets, pick a teammate",
    );
  });

  test("keeps demo-only surfaces out of product mode", () => {
    const policy = getDemoPolicy(false);

    expect(policy.publicDemoBanner).toBe(false);
    expect(policy.flashExperimentsLab).toBe(false);
    expect(policy.userSwitcher).toBe(false);
    expect(policy.productAuth).toBe(true);
  });

  test("recognizes explicit product-mode values", () => {
    expect(parseDemoFlag("false")).toBe(false);
    expect(parseDemoFlag("0")).toBe(false);
    expect(parseDemoFlag("off")).toBe(false);
    expect(parseDemoFlag("true")).toBe(true);
  });
});
