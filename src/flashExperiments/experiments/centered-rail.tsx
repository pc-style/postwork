import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useStore } from "../../lib/store";
import { NewPostDialog } from "../../components/NewPostDialog";
import { UserSwitcher } from "../../components/UserSwitcher";
import type { FlashExperiment } from "../registry";

const NAV_ITEMS: { label: string; to?: string; accent?: boolean }[] = [
  { label: "home", to: "/", accent: true },
  { label: "priority", to: "/" },
  { label: "spaces", to: "/spaces" },
  { label: "agents", to: "/agents" },
  { label: "orgs", to: "/orgs" },
];

// Galicius's suggestion: navigation on the sides, main content centered in the
// middle like twitter, so the reading column stays narrow and scannable.
export function CenteredRailShell({ children }: { children: ReactNode }) {
  const store = useStore();
  const counts = store.useCounts();
  const [composing, setComposing] = useState(false);

  return (
    <div className="min-h-full">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,640px)_240px] lg:justify-center">
        {/* left nav rail */}
        <aside className="flex flex-col gap-4 md:sticky md:top-6 md:h-[calc(100vh-3rem)]">
          <Link to="/" className="px-2 text-base font-semibold text-fg">
            postwork
          </Link>
          <nav className="space-y-1 text-sm text-muted">
            {NAV_ITEMS.map((item) =>
              item.to ? (
                <Link
                  key={item.label}
                  to={item.to}
                  className={`block rounded-md px-3 py-2 transition hover:bg-surface hover:text-fg [&.active]:text-accent-soft ${
                    item.accent ? "text-accent-soft" : ""
                  }`}
                >
                  {item.label}
                </Link>
              ) : (
                <div
                  key={item.label}
                  className="rounded-md px-3 py-2 opacity-60"
                  title="not wired in this preview"
                >
                  {item.label}
                </div>
              ),
            )}
          </nav>
          <button
            onClick={() => setComposing(true)}
            className="mt-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-fg transition hover:bg-accent-soft"
          >
            + new post
          </button>
          <div className="mt-auto">
            <UserSwitcher />
          </div>
        </aside>

        {/* centered reading column */}
        <main className="min-w-0">{children}</main>

        {/* right context rail (large screens only) */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-3">
            <div className="rounded-lg border border-border bg-surface p-4 text-sm">
              <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">
                your queue
              </div>
              {counts ? (
                <div className="space-y-1 text-muted">
                  <div>
                    <span className="text-accent-soft">{counts.unread}</span>{" "}
                    unread
                  </div>
                  {counts.urgent > 0 && (
                    <div>
                      <span className="text-red-300">{counts.urgent}</span>{" "}
                      urgent
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-muted">loading…</div>
              )}
            </div>
            <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted">
              twitter-style three-column reading layout. nav on the left, a
              narrow centered feed, context on the right.
            </div>
          </div>
        </aside>
      </div>

      {composing && <NewPostDialog onClose={() => setComposing(false)} />}
    </div>
  );
}

export const centeredRail: FlashExperiment = {
  slug: "centered-rail",
  title: "centered reading column",
  summary:
    "Move navigation to the sides and keep the main content in a narrow centered column, like twitter, so the feed reads more easily.",
  requestedBy: "@Galicius315715",
  status: "shipped",
  category: "community",
  suggestion: {
    name: "Galicius",
    handle: "@Galicius315715",
    link: "https://x.com/Galicius315715/status/2071353160166232304",
  },
  slots: ["app-shell"],
  notes: [
    "graduated — now the default experience",
    "replaces the whole app shell with a three-column layout",
    "left nav rail (home/priority/spaces/agents/orgs) + new post + user switcher",
    "narrow centered reading column wraps the real feed and post pages",
    "right rail shows unread/urgent context on large screens",
  ],
  appSlots: {
    shell: ({ children }) => <CenteredRailShell>{children}</CenteredRailShell>,
  },
};
