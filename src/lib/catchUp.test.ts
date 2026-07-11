import { describe, expect, test } from "vitest";
import { catchUpSummaryPreview, groupCatchUpItems } from "./catchUp";
import type { CatchUpItem } from "./types";

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
  test("keeps the tldr and removes later summary sections", () => {
    expect(catchUpSummaryPreview("**TL;DR**\nDecision made.\n\n**Action items**\n- Ship it")).toBe("Decision made.");
  });
});
