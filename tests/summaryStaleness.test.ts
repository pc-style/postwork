import { expect, test } from "bun:test";
import { isSummaryStale } from "../convex/lib/summaryStaleness";

test("a summary is fresh when it covers the latest activity", () => {
  expect(isSummaryStale(2_000, 2_000)).toBeFalse();
  expect(isSummaryStale(2_000, 2_100)).toBeFalse();
});

test("a reply after a summary makes it stale", () => {
  expect(isSummaryStale(2_001, 2_000)).toBeTrue();
});

test("a post without a summary is not labelled stale", () => {
  expect(isSummaryStale(2_000, undefined)).toBeFalse();
});

test("regenerating after a reply makes the replacement summary fresh", () => {
  const replyAt = 2_500;
  const regeneratedAt = 2_600;

  expect(isSummaryStale(replyAt, regeneratedAt)).toBeFalse();
});
