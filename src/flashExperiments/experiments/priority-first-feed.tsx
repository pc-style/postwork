import { Link } from "@tanstack/react-router";
import type { FlashExperiment } from "../registry";

const ENTRY_POINTS: { label: string; detail: string }[] = [
  ["urgent", "2 need a decision"],
  ["high", "4 active threads"],
  ["unread", "9 updates"],
].map(([label, detail]) => ({ label, detail }));

function PriorityFirstHeader() {
  return (
    <section className="mb-4 rounded-lg border border-accent/30 bg-accent/10 p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-accent-soft">
        <span>proposed flow</span>
        <span className="rounded-md border border-accent/30 px-1.5 py-0.5 text-label uppercase tracking-wide">
          preview
        </span>
      </div>
      <h1 className="mt-1 text-xl font-semibold text-fg">
        start from what needs attention
      </h1>
      <p className="mt-2 text-sm text-muted">
        This experiment would make urgent, high-priority, and unread work the
        first-class entry points before the chronological feed. The cards below
        drop you into the real feed — the filtering proposal itself is what's
        under review.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {ENTRY_POINTS.map(({ label, detail }) => (
          <Link
            key={label}
            to="/"
            className="rounded-lg border border-border bg-surface p-3 text-left transition hover:border-accent/40 hover:bg-surface-2"
          >
            <div className="text-sm text-fg">{label}</div>
            <div className="mt-1 text-xs text-muted">{detail}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export const priorityFirstFeed: FlashExperiment = {
  slug: "priority-first-feed",
  title: "priority-first feed",
  summary:
    "Make priority and unread state feel like the primary navigation model, not secondary filters.",
  requestedBy: "flow review",
  status: "rejected",
  category: "testing",
  slots: ["feedHeader"],
  notes: [
    "deprecated — the entry cards do not actually filter (they link to / and no-op) and the real feed already has priority filter chips; not worth shipping as-is",
    "keeps the real app shell and feed",
    "adds a priority-first header above the chronological feed",
    "entry-point cards link back into the real feed; per-filter routing is a follow-up",
  ],
  appSlots: { feedHeader: <PriorityFirstHeader /> },
};
