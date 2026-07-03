import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useStore } from "../lib/store";
import { UserSwitcher } from "./UserSwitcher";
import { NewPostDialog } from "./NewPostDialog";
import { Button } from "./Button";

// "priority" is the urgent triage view of the same feed — a genuine shortcut,
// not a duplicate of "home". Both point at "/" but carry different search.
const ROUTE_NAV = [
  { label: "spaces", to: "/spaces" },
  { label: "agents", to: "/agents" },
  { label: "orgs", to: "/orgs" },
  { label: "experiments", to: "/flash-experiments" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const store = useStore();
  const counts = store.useCounts();
  const [composing, setComposing] = useState(false);

  return (
    <div className="min-h-full">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,640px)_240px] lg:justify-center">
        <aside className="flex flex-col gap-4 md:sticky md:top-6 md:h-[calc(100vh-3rem)]">
          <Link to="/" className="px-2 text-base font-semibold text-fg">
            postwork
          </Link>

          <nav className="space-y-1 text-sm text-muted">
            <Link
              to="/"
              search={{}}
              activeOptions={{ exact: true, includeSearch: true }}
              activeProps={{
                className: "bg-surface text-accent-soft",
              }}
              className="block rounded-md px-3 py-2 transition hover:bg-surface hover:text-fg"
            >
              home
            </Link>
            <Link
              to="/"
              search={{ priority: "urgent" }}
              activeOptions={{ exact: true, includeSearch: true }}
              activeProps={{
                className: "bg-surface text-accent-soft",
              }}
              className="block rounded-md px-3 py-2 transition hover:bg-surface hover:text-fg"
            >
              priority
            </Link>
            {ROUTE_NAV.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                activeOptions={{ exact: true, includeSearch: true }}
                activeProps={{
                  className: "bg-surface text-accent-soft",
                }}
                className="block rounded-md px-3 py-2 transition hover:bg-surface hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Button onClick={() => setComposing(true)} className="mt-1 text-center">
            + new post
          </Button>

          <div className="mt-auto">
            <UserSwitcher />
          </div>
        </aside>

        <main className="min-w-0 px-4 py-6">{children}</main>

        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-3">
            <div className="rounded-lg border border-border bg-surface p-4 text-sm">
              <div className="mb-2 text-label font-medium text-muted">
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
                      <span className="text-urgent">{counts.urgent}</span>{" "}
                      urgent
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-muted">loading…</div>
              )}
            </div>

            <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted">
              posts stay centered for reading; navigation and queue context stay
              close at hand.
            </div>
          </div>
        </aside>
      </div>

      {composing && <NewPostDialog onClose={() => setComposing(false)} />}
    </div>
  );
}
