import type { FlashExperiment } from "../registry";
import type { EnrichedPost } from "../../lib/types";
import { timeAgo, priorityStyles } from "../../lib/format";

function CompactCard({ post }: { post: EnrichedPost }) {
  const p = priorityStyles[post.priority];

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 transition hover:border-accent/40 hover:bg-surface-2">
      <span
        className={`size-2 shrink-0 rounded-full ${post.unread ? "bg-accent-soft" : p.dot}`}
        title={post.unread ? "Unread" : p.label}
      />

      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          post.unread ? "font-semibold text-fg" : "font-medium text-fg/90"
        }`}
      >
        {post.pinned ? <span className="mr-1.5 text-xs text-accent-soft">Pinned</span> : null}
        {post.unread ? <span className="sr-only">Unread: </span> : null}
        {post.title}
      </span>

      <span className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 text-label text-muted sm:inline">
        {post.space}
      </span>

      <span className="shrink-0 text-xs tabular-nums text-muted">
        {post.replyCount}
        <span className="ml-0.5 hidden sm:inline">
          {post.replyCount === 1 ? "reply" : "replies"}
        </span>
      </span>

      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted">
        {timeAgo(post.lastActivityAt)}
      </span>
    </div>
  );
}

export const compactCards: FlashExperiment = {
  slug: "compact-cards",
  title: "compact feed cards",
  summary:
    "Collapse each post into one scannable line with priority, title, space, reply count, and last activity.",
  requestedBy: "triage workflow",
  status: "liked",
  category: "testing",
  notes: [
    "overrides only the feed item; the real feed, filters and navigation stay",
    "uses priorityStyles dots and timeAgo from src/lib/format",
    "density tradeoff: drops body snippet and avatars for line height",
  ],
  appSlots: { postCard: ({ post }) => <CompactCard post={post} /> },
};
