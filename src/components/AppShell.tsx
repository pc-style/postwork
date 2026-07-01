import { type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useStore } from "../lib/store";
import { type FeedSearch } from "../router";
import { UserSwitcher } from "./UserSwitcher";

// "priority" is the urgent triage view of the same feed — a genuine shortcut,
// not a duplicate of "home". Both point at "/" but carry different search.
const ROUTE_NAV = [
  { label: "spaces", to: "/spaces" },
  { label: "agents", to: "/agents" },
  { label: "orgs", to: "/orgs" },
  { label: "experiments", to: "/flash-experiments" },
] as const;

const ACTIVE = "bg-[var(--color-surface)] text-accent-soft";

export function AppShell({ children }: { children: ReactNode }) {
  const store = useStore();
  const counts = store.useCounts();
  const feedPriority = useRouterState({
    select: (s) => (s.location.search as Partial<FeedSearch>).priority,
  });

  return (
    <div className="min-h-full">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,640px)_240px] lg:justify-center">
        <aside className="flex flex-col gap-4 md:sticky md:top-6 md:h-[calc(100vh-3rem)]">
          <Link to="/" className="px-2 text-base font-semibold text-fg">
            postwork
          </Link>

          <nav className="space-y-1 text-sm text-[var(--color-muted)]">
            <Link
              to="/"
              search={{}}
              className={`block rounded-md px-3 py-2 transition hover:bg-[var(--color-surface)] hover:text-fg ${
                !feedPriority ? ACTIVE : ""
              }`}
            >
              home
            </Link>
            <Link
              to="/"
              search={{ priority: "urgent" }}
              className={`block rounded-md px-3 py-2 transition hover:bg-[var(--color-surface)] hover:text-fg ${
                feedPriority === "urgent" ? ACTIVE : ""
              }`}
            >
              priority
            </Link>
            {ROUTE_NAV.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="block rounded-md px-3 py-2 transition hover:bg-[var(--color-surface)] hover:text-fg [&.active]:bg-[var(--color-surface)] [&.active]:text-accent-soft"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            to="/"
            className="mt-1 rounded-lg bg-accent px-3 py-2 text-center text-sm font-medium text-fg transition hover:bg-accent-soft"
          >
            + new post
          </Link>

          <div className="mt-auto">
            <UserSwitcher />
          </div>
        </aside>

        <main className="min-w-0 px-4 py-6">{children}</main>

        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-3">
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm">
              <div className="mb-2 text-[11px] tracking-wide text-[var(--color-muted)] uppercase">
                your queue
              </div>
              {counts ? (
                <div className="space-y-1 text-[var(--color-muted)]">
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
                <div className="text-[var(--color-muted)]">loading…</div>
              )}
            </div>

            <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-xs text-[var(--color-muted)]">
              posts stay centered for reading; navigation and queue context stay
              close at hand.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
