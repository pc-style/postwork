import { describe, expect, test } from "vitest";
import {
  composeXDigest,
  engagementScore,
  formatCount,
  pickTopOriginals,
  type XPulseMetricItem,
} from "./xPulseDigest";

function item(overrides: Partial<XPulseMetricItem> & { externalId: string }): XPulseMetricItem {
  return {
    text: `post ${overrides.externalId}`,
    url: `https://x.com/h/status/${overrides.externalId}`,
    sourceCreatedAt: 1,
    ...overrides,
  };
}

describe("formatCount", () => {
  test("humanizes counts and keeps a dash for unknown", () => {
    expect(formatCount(undefined)).toBe("–");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1500)).toBe("1.5k");
    expect(formatCount(2_000_000)).toBe("2m");
  });
});

describe("pickTopOriginals", () => {
  test("orders by engagement, breaking ties by recency", () => {
    const items = [
      item({ externalId: "small", views: 100 }),
      item({ externalId: "viral", views: 100000, likes: 500 }),
      item({ externalId: "recent", sourceCreatedAt: 99 }),
      item({ externalId: "old", sourceCreatedAt: 1 }),
    ];
    const top = pickTopOriginals(items, 3);
    expect(top[0].externalId).toBe("viral");
    expect(engagementScore(top[0])).toBeGreaterThan(engagementScore(top[1]));
    // zero-engagement tie: newer first
    expect(top.map((entry) => entry.externalId)).toContain("recent");
  });
});

describe("composeXDigest", () => {
  test("includes follower delta, top posts with stats, and a compact summary", () => {
    const composed = composeXDigest({
      handle: "acme",
      localDate: "2026-08-17",
      followersNow: 12500,
      followersPrev: 12400,
      items: [
        item({ externalId: "a", text: "We shipped the thing", views: 50000, likes: 200, reposts: 12, replies: 30 }),
        item({ externalId: "b", text: "quiet post", views: 100 }),
      ],
    });
    expect(composed.title).toBe("x pulse — @acme — 2026-08-17");
    expect(composed.body).toContain("**12.5k followers** (+100 today)");
    expect(composed.body).toContain("We shipped the thing");
    expect(composed.body).toContain("50k views · 200 likes · 12 reposts · 30 replies");
    expect(composed.summary).toContain("12.5k followers (+100 today)");
    expect(composed.summary).toContain("top post:");
  });

  test("handles a metrics-free day gracefully", () => {
    const composed = composeXDigest({
      handle: "acme",
      localDate: "2026-08-17",
      followersNow: undefined,
      followersPrev: undefined,
      items: [],
    });
    expect(composed.body).toContain("No new posts in this window.");
    expect(composed.summary).toBe("no new posts");
  });
});
