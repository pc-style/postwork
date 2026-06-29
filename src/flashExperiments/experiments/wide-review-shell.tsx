import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useStore } from "../../lib/store";
import { NewPostDialog } from "../../components/NewPostDialog";
import { UserSwitcher } from "../../components/UserSwitcher";
import type { FlashExperiment } from "../registry";

const RAIL_ITEMS: { label: string; to?: string; accent?: boolean }[] = [
  { label: "inbox", to: "/", accent: true },
  { label: "priority", to: "/" },
  { label: "spaces", to: "/spaces" },
  { label: "agents", to: "/agents" },
  { label: "orgs", to: "/orgs" },
];

export function WideReviewShell({ children }: { children: ReactNode }) {
  const store = useStore();
  const counts = store.useCounts();
  const [composing, setComposing] = useState(false);

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top_left,rgba(140,24,98,0.18),transparent_32rem)]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="flex flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm md:sticky md:top-6 md:h-[calc(100vh-3rem)]">
          <Link to="/" className="mb-6 font-semibold text-fg">
            postwork
          </Link>

          <nav className="space-y-1 text-[var(--color-muted)]">
            {RAIL_ITEMS.map((item) =>
              item.to ? (
                <Link
                  key={item.label}
                  to={item.to}
                  className={`block rounded-md px-2 py-1.5 transition hover:bg-[var(--color-surface-2)] hover:text-fg [&.active]:text-accent-soft ${
                    item.accent ? "text-accent-soft" : ""
                  }`}
                >
                  {item.label}
                </Link>
              ) : (
                <div
                  key={item.label}
                  className="rounded-md px-2 py-1.5 opacity-60"
                >
                  {item.label}
                </div>
              ),
            )}
          </nav>

          {counts && counts.unread > 0 && (
            <div className="mt-4 rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs">
              <span className="text-accent-soft">{counts.unread} unread</span>
              {counts.urgent > 0 && (
                <span className="text-red-300"> · {counts.urgent} urgent</span>
              )}
            </div>
          )}

          <div className="mt-auto space-y-2">
            <button
              onClick={() => setComposing(true)}
              className="w-full rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-fg transition hover:bg-accent-soft"
            >
              + new post
            </button>
            <UserSwitcher />
          </div>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>

      {composing && <NewPostDialog onClose={() => setComposing(false)} />}
    </div>
  );
}

export const wideReviewShell: FlashExperiment = {
  slug: "wide-review-shell",
  title: "wide review shell",
  summary:
    "Give experiment review more horizontal room so the app feels like a flow board instead of a narrow feed.",
  requestedBy: "layout discussion",
  status: "new",
  slots: ["app-shell"],
  notes: [
    "replaces the whole app shell",
    "wraps the real routed pages (feed, post detail) in the wide layout",
    "carries new-post, unread counts, and user switcher into the side rail",
    "use shell overrides only for navigation/layout proposals",
  ],
  appSlots: {
    shell: ({ children }) => <WideReviewShell>{children}</WideReviewShell>,
  },
};
