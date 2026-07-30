import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useCounts } from "../lib/store";
import { UserSwitcher } from "./UserSwitcher";
import { NewPostDialog } from "./NewPostDialog";
import { Button } from "./Button";
import { demoPolicy } from "../lib/demoMode";
import { ProductProfileCard } from "./ProductProfileCard";
import { useUnreadTabBadge } from "../lib/useDocumentTitle";
import { useUnreadNotifier } from "../lib/notifications";

// "priority" is the urgent triage view of the same feed — a genuine shortcut,
// not a duplicate of "home". Both point at "/" but carry different search.
const ROUTE_NAV = [
  { label: "spaces", to: "/app/spaces" },
  { label: "agents", to: "/app/agents" },
] as const;

const DEMO_ROUTE_NAV = [{ label: "experiments", to: "/app/flash-experiments" }] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const counts = useCounts();
  useUnreadTabBadge(counts?.unread);
  useUnreadNotifier(counts?.unread);
  const [composing, setComposing] = useState(false);
  const composeTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="min-h-full">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-md bg-surface px-3 py-2 text-sm text-fg focus:not-sr-only"
      >
        skip to content
      </a>
      <div className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] md:gap-6 md:px-4 md:py-6 lg:grid-cols-[220px_minmax(0,640px)_240px] lg:justify-center">
        <aside
          aria-label="workspace navigation"
          className="sticky top-0 z-30 flex min-w-0 flex-col gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur-sm md:top-6 md:z-auto md:h-[calc(100vh-3rem)] md:gap-4 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none"
        >
          <Link to="/app" className="px-2 text-base font-semibold text-fg">
            postwork
          </Link>

          <nav aria-label="Primary" className="flex min-w-0 gap-1 overflow-x-auto pb-1 text-sm text-muted md:block md:space-y-1 md:overflow-visible md:pb-0">
            <Link
              to="/app"
              search={{}}
              activeOptions={{ exact: true, includeSearch: true }}
              activeProps={{
                className: "bg-surface text-accent-soft",
              }}
              className="block shrink-0 rounded-md px-3 py-2 transition hover:bg-surface hover:text-fg"
            >
              home
            </Link>
            <Link
              to="/app"
              search={{ priority: "urgent" }}
              activeOptions={{ exact: true, includeSearch: true }}
              activeProps={{
                className: "bg-surface text-accent-soft",
              }}
              className="block shrink-0 rounded-md px-3 py-2 transition hover:bg-surface hover:text-fg"
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
                className="block shrink-0 rounded-md px-3 py-2 transition hover:bg-surface hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
            {demoPolicy.flashExperimentsLab && DEMO_ROUTE_NAV.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                activeOptions={{ exact: true, includeSearch: true }}
                activeProps={{
                  className: "bg-surface text-accent-soft",
                }}
                className="block shrink-0 rounded-md px-3 py-2 transition hover:bg-surface hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Button
            ref={composeTriggerRef}
            onClick={() => setComposing(true)}
            className="mt-1 text-center"
          >
            + new post
          </Button>

          {demoPolicy.userSwitcher && (
            <div className="mt-auto">
              <UserSwitcher />
            </div>
          )}
        </aside>

        <main id="main-content" tabIndex={-1} className="min-w-0 scroll-mt-24 md:scroll-mt-4">{children}</main>

        <aside aria-label="queue summary" className="hidden lg:block">
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

            {demoPolicy.productAuth && <ProductProfileCard />}
          </div>
        </aside>
      </div>

      {composing && (
        <NewPostDialog
          onClose={() => setComposing(false)}
          returnFocusRef={composeTriggerRef}
        />
      )}
    </div>
  );
}
