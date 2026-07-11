import type { CatchUpDigest, CatchUpItem, EnrichedPost, Priority } from "./types";

export const CATCH_UP_PRIORITIES = ["urgent", "high", "normal"] as const;

export type CatchUpGroup = {
  priority: Priority;
  items: CatchUpItem[];
};

export function catchUpSummaryPreview(text: string): string {
  return text
    .replace(/^\*\*TL;DR\*\*\s*/i, "")
    .split(/\n\s*\n\*\*[^*]+\*\*/)[0]
    .replace(/\*\*/g, "")
    .trim();
}

export function groupCatchUpItems(items: CatchUpItem[]): CatchUpGroup[] {
  return CATCH_UP_PRIORITIES.flatMap((priority) => {
    const grouped = items.filter((item) => item.post.priority === priority);
    return grouped.length ? [{ priority, items: grouped }] : [];
  });
}

export function composeDemoCatchUp(posts: EnrichedPost[]): CatchUpDigest {
  const items = posts
    .filter((post) => post.unread)
    .sort(
      (a, b) =>
        CATCH_UP_PRIORITIES.indexOf(a.priority) -
          CATCH_UP_PRIORITIES.indexOf(b.priority) ||
        b.lastActivityAt - a.lastActivityAt,
    )
    .slice(0, 25)
    .map((post) => ({
      post,
      summary: post.summary?.trim()
        ? {
            status: post.isStale ? ("stale" as const) : ("fresh" as const),
            text: post.summary,
            model: post.summaryModel ?? null,
            updatedAt: post.summaryUpdatedAt ?? null,
          }
        : { status: "missing" as const, text: null, model: null, updatedAt: null },
    }));

  return {
    items,
    eligibleInWindow: posts.filter((post) => post.unread).length,
    omittedEligibleInWindow: Math.max(0, posts.filter((post) => post.unread).length - 25),
    scan: { scannedPosts: posts.length, maxPosts: 200, complete: true },
  };
}
