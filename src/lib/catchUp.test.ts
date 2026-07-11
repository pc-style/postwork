import { describe, expect, test } from "vitest";
import { catchUpEmptyState, catchUpSummaryPreview, composeDemoCatchUp, groupCatchUpItems } from "./catchUp";
import type { CatchUpDigest, CatchUpItem, EnrichedPost } from "./types";

function item(priority: "urgent" | "high" | "normal"): CatchUpItem {
  return {
    post: { priority } as CatchUpItem["post"],
    summary: { status: "missing", text: null, model: null, updatedAt: null },
  };
}

describe("groupCatchUpItems", () => {
  test("keeps backend order inside priority groups", () => {
    const urgent = item("urgent");
    const high = item("high");
    const normal = item("normal");
    expect(groupCatchUpItems([urgent, high, normal])).toEqual([
      { priority: "urgent", items: [urgent] },
      { priority: "high", items: [high] },
      { priority: "normal", items: [normal] },
    ]);
  });

  test("omits empty groups", () => {
    expect(groupCatchUpItems([item("high")]).map((group) => group.priority)).toEqual(["high"]);
  });
});

describe("catchUpSummaryPreview", () => {
  test("accepts a tldr heading without a colon", () => {
    expect(catchUpSummaryPreview("**TL;DR**\nDecision made.")).toBe("Decision made.");
  });

  test("accepts a tldr heading with a colon and surrounding whitespace", () => {
    expect(catchUpSummaryPreview("  ** TL;DR: **  Decision made.")).toBe("Decision made.");
  });

  test("stops at an immediate later bold section heading", () => {
    expect(catchUpSummaryPreview("**TL;DR:** Decision made.\n**Action items**\n- Ship it")).toBe("Decision made.");
  });

  test("stops at a later bold section heading after a blank line", () => {
    expect(catchUpSummaryPreview("**TL;DR**\nDecision made.\n\n**Action items**\n- Ship it")).toBe("Decision made.");
  });

  test("keeps a plain summary and removes only bold markup", () => {
    expect(catchUpSummaryPreview("Decision **made** with the launch still on track.")).toBe(
      "Decision made with the launch still on track.",
    );
  });
});

function post(
  id: string,
  priority: "urgent" | "high" | "normal",
  lastActivityAt: number,
  createdAt: number,
  unread = true,
): EnrichedPost {
  return { _id: id, priority, lastActivityAt, createdAt, unread } as EnrichedPost;
}

describe("composeDemoCatchUp", () => {
  test("matches backend ordering through every tie-breaker", () => {
    const digest = composeDemoCatchUp([
      post("high-z", "high", 100, 90),
      post("urgent", "urgent", 1, 1),
      post("high-b", "high", 100, 80),
      post("high-a", "high", 100, 80),
      post("normal", "normal", 200, 200),
    ]);

    expect(digest.items.map((entry) => entry.post._id)).toEqual([
      "urgent",
      "high-z",
      "high-a",
      "high-b",
      "normal",
    ]);
  });

  test("limits items and conservatively marks a capped feed incomplete", () => {
    const posts = Array.from({ length: 200 }, (_, index) =>
      post(`post-${index.toString().padStart(3, "0")}`, "normal", index, index),
    );
    const digest = composeDemoCatchUp(posts);

    expect(digest.items).toHaveLength(25);
    expect(digest).toMatchObject({
      eligibleInWindow: 200,
      omittedEligibleInWindow: 175,
      scan: { scannedPosts: 200, maxPosts: 200, complete: false },
    });
  });
});

describe("catchUpEmptyState", () => {
  test("does not claim an incomplete empty scan is all caught up", () => {
    const digest = {
      items: [],
      eligibleInWindow: 0,
      omittedEligibleInWindow: 0,
      scan: { scannedPosts: 200, maxPosts: 200, complete: false },
    } as CatchUpDigest;

    expect(catchUpEmptyState(digest)).toEqual({
      title: "No unread work found in this scan.",
      description: "Older unread work may still exist outside the scanned window.",
    });
  });
});
