/**
 * Pure composition for the X Pulse daily digest. Deterministic on its inputs
 * so it stays unit-testable without a Convex runtime or network.
 */

export type XPulseMetricItem = {
  externalId: string;
  text: string;
  url: string;
  sourceCreatedAt: number;
  views?: number;
  likes?: number;
  reposts?: number;
  replies?: number;
  quotes?: number;
  bookmarks?: number;
};

const TOP_POSTS = 5;
const TEXT_PREVIEW_CHARS = 90;

export function formatCount(value: number | undefined): string {
  if (value === undefined) return "–";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(value);
}

export function engagementScore(item: XPulseMetricItem): number {
  return (
    (item.views ?? 0) / 100 +
    (item.likes ?? 0) * 2 +
    (item.reposts ?? 0) * 3 +
    (item.replies ?? 0) * 2 +
    (item.quotes ?? 0) * 3 +
    (item.bookmarks ?? 0)
  );
}

export function pickTopOriginals(
  items: readonly XPulseMetricItem[],
  limit = TOP_POSTS,
): XPulseMetricItem[] {
  return [...items]
    .sort(
      (a, b) =>
        engagementScore(b) - engagementScore(a) ||
        b.sourceCreatedAt - a.sourceCreatedAt ||
        a.externalId.localeCompare(b.externalId),
    )
    .slice(0, limit);
}

function preview(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= TEXT_PREVIEW_CHARS) return cleaned;
  const cut = cleaned.slice(0, TEXT_PREVIEW_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : TEXT_PREVIEW_CHARS).trimEnd()}\u2026`;
}

export function composeXDigest({
  handle,
  localDate,
  followersNow,
  followersPrev,
  items,
}: {
  handle: string;
  localDate: string;
  followersNow: number | undefined;
  followersPrev: number | undefined;
  items: readonly XPulseMetricItem[];
}): { title: string; body: string; summary: string } {
  const top = pickTopOriginals(items);
  const delta =
    followersNow !== undefined && followersPrev !== undefined
      ? followersNow - followersPrev
      : undefined;
  const deltaLabel =
    delta === undefined ? "" : delta === 0 ? " (±0 today)" : delta > 0 ? ` (+${formatCount(delta)} today)` : ` (${formatCount(delta)} today)`;

  const lines: string[] = [];
  if (followersNow !== undefined) {
    lines.push(`**${formatCount(followersNow)} followers**${deltaLabel}`);
    lines.push("");
  }
  if (top.length > 0) {
    lines.push(top.length === 1 ? "Top post:" : "Top posts:");
    for (const item of top) {
      const stats = [
        item.views !== undefined ? `${formatCount(item.views)} views` : null,
        item.likes !== undefined ? `${formatCount(item.likes)} likes` : null,
        item.reposts !== undefined ? `${formatCount(item.reposts)} reposts` : null,
        item.replies !== undefined ? `${formatCount(item.replies)} replies` : null,
      ]
        .filter((part): part is string => part !== null)
        .join(" · ");
      lines.push(`- ${preview(item.text)}`);
      lines.push(`  ${stats ? `${stats} — ` : ""}${item.url}`);
    }
  } else {
    lines.push("No new posts in this window.");
  }

  const summaryParts: string[] = [];
  if (followersNow !== undefined) {
    summaryParts.push(`${formatCount(followersNow)} followers${deltaLabel}`);
  }
  if (top.length > 0) {
    const best = top[0];
    summaryParts.push(
      `top post: "${preview(best.text)}"${best.views !== undefined ? ` (${formatCount(best.views)} views)` : ""}`,
    );
  } else {
    summaryParts.push("no new posts");
  }

  return {
    title: `x pulse — @${handle} — ${localDate}`,
    body: lines.join("\n"),
    summary: summaryParts.join(" · "),
  };
}
