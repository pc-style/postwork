import { describe, expect, test } from "vitest";
import {
  composeCatchUpDigest,
  type CatchUpCandidate,
  type CatchUpPriority,
} from "./catchUpComposer";

function candidate(
  postId: string,
  priority: CatchUpPriority,
  lastActivityAt: number,
  overrides: Partial<CatchUpCandidate<{ id: string }>> = {},
): CatchUpCandidate<{ id: string }> {
  return {
    post: { id: postId },
    postId,
    priority,
    unread: true,
    createdAt: lastActivityAt,
    lastActivityAt,
    summary: `Summary ${postId}`,
    summaryModel: "test/model",
    summaryUpdatedAt: lastActivityAt,
    isStale: false,
    ...overrides,
  };
}

describe("composeCatchUpDigest", () => {
  test("keeps only unread posts and orders by priority, activity, creation, then id", () => {
    const digest = composeCatchUpDigest([
      candidate("normal", "normal", 100),
      candidate("high-old", "high", 50),
      candidate("urgent", "urgent", 1),
      candidate("read", "urgent", 999, { unread: false }),
      candidate("high-b", "high", 100, { createdAt: 80 }),
      candidate("high-a", "high", 100, { createdAt: 80 }),
      candidate("high-newer-created", "high", 100, { createdAt: 90 }),
    ]);

    expect(digest.items.map((item) => item.post.id)).toEqual([
      "urgent",
      "high-newer-created",
      "high-a",
      "high-b",
      "high-old",
      "normal",
    ]);
    expect(digest).toMatchObject({ totalEligible: 6, omittedCount: 0 });
  });

  test("retains stale and missing summaries with explicit status and bounds output", () => {
    const digest = composeCatchUpDigest(
      [
        candidate("missing", "urgent", 3, { summary: undefined }),
        candidate("stale", "high", 2, { isStale: true }),
        candidate("fresh", "normal", 1),
      ],
      2,
    );

    expect(digest.items.map((item) => item.summary.status)).toEqual([
      "missing",
      "stale",
    ]);
    expect(digest).toMatchObject({ totalEligible: 3, omittedCount: 1 });
  });
});
