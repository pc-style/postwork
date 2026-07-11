import type { CatchUpDigest, CatchUpItem, EnrichedPost, Priority } from "./types";

export const CATCH_UP_PRIORITIES = ["urgent", "high", "normal"] as const;

export type CatchUpGroup = {
  priority: Priority;
  items: CatchUpItem[];
};

export const DEMO_CATCH_UP_SCAN_LIMIT = 200;
export const DEMO_CATCH_UP_ITEM_LIMIT = 25;

export function catchUpEmptyState(digest: CatchUpDigest): {
  title: string;
  description: string;
} {
  return digest.scan.complete
    ? {
        title: "You’re all caught up.",
        description: "New unread activity will appear here when it needs your attention.",
      }
    : {
        title: "No unread work found in this scan.",
        description: "Older unread work may still exist outside the scanned window.",
      };
}

export function catchUpSummaryPreview(text: string): string {
  return text
    .replace(/^\s*\*\*\s*TL;DR\s*:?\s*\*\*\s*:?\s*/i, "")
    .split(
      /\n\s*\*\*\s*(?:Decisions|Open questions|Action items)\s*\*\*:?[^\n]*/i,
    )[0]
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
  const eligible = posts.filter((post) => post.unread);
  const items = eligible
    .sort(
      (a, b) =>
        CATCH_UP_PRIORITIES.indexOf(a.priority) -
          CATCH_UP_PRIORITIES.indexOf(b.priority) ||
        b.lastActivityAt - a.lastActivityAt ||
        b.createdAt - a.createdAt ||
        a._id.localeCompare(b._id),
    )
    .slice(0, DEMO_CATCH_UP_ITEM_LIMIT)
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
    eligibleInWindow: eligible.length,
    omittedEligibleInWindow: Math.max(0, eligible.length - DEMO_CATCH_UP_ITEM_LIMIT),
    scan: {
      scannedPosts: Math.min(posts.length, DEMO_CATCH_UP_SCAN_LIMIT),
      maxPosts: DEMO_CATCH_UP_SCAN_LIMIT,
      complete: posts.length < DEMO_CATCH_UP_SCAN_LIMIT,
    },
  };
}
