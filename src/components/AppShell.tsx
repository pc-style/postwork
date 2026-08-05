import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useCounts } from "../lib/store";
import { navItemClass, useActiveNavKey, type NavKey } from "../lib/activeNav";
import { UserSwitcher } from "./UserSwitcher";
import { NewPostDialog } from "./NewPostDialog";
import { Button } from "./Button";
import { demoPolicy } from "../lib/demoMode";
import { ProductProfileCard } from "./ProductProfileCard";
import { useUnreadTabBadge } from "../lib/useDocumentTitle";
import { useUnreadNotifier } from "../lib/notifications";

// "priority" is the urgent triage view of the same feed — a genuine shortcut,
// not a duplicate of "home". Both point at "/" but carry different search.
// "settings" appears exactly once in the shell, here in the nav.
const NAV: ReadonlyArray<{
  key: NavKey;
  label: string;
  to: "/app" | "/app/spaces" | "/app/agents" | "/app/settings";
  search?: { priority: "urgent" };
}> = [
  { key: "home", label: "home", to: "/app" },
  { key: "priority", label: "priority", to: "/app", search: { priority: "urgent" } },
  { key: "spaces", label: "spaces", to: "/app/spaces" },
  { key: "agents", label: "agents", to: "/app/agents" },
  { key: "settings", label: "settings", to: "/app/settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const counts = useCounts();
  useUnreadTabBadge(counts?.unread);
  useUnreadNotifier(counts?.unread);
  const [composing, setComposing] = useState(false);
  const composeTriggerRef = useRef<HTMLButtonElement>(null);
  const activeKey = useActiveNavKey();

  return (
    <div className="min-h-full">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[100] rounded-md bg-surface px-3 py-2 text-body text-fg focus:not-sr-only"
      >
        skip to content
      </a>
      <div className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] md:gap-6 md:px-4 md:py-6 lg:grid-cols-[220px_minmax(0,640px)_240px] lg:justify-center">
        <aside
          aria-label="workspace navigation"
          className="sticky top-0 z-30 flex min-w-0 flex-col gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur-sm md:top-6 md:z-auto md:h-[calc(100vh-3rem)] md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none"
        >
          <Link to="/app" className="shrink-0 px-2 text-title font-semibold text-fg">
            postwork
          </Link>

          {/* The nav list is the flexible region on md+: it scrolls when the
              viewport is short so the compose button and profile below keep
              their size and never spawn a stray scrollbar. */}
          <nav
            aria-label="Primary"
            className="flex min-w-0 gap-1 overflow-x-auto pb-1 md:block md:min-h-0 md:flex-1 md:space-y-1 md:overflow-y-auto md:overflow-x-visible md:pb-0"
          >
            {NAV.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                search={item.search}
                aria-current={activeKey === item.key ? "page" : undefined}
                className={`shrink-0 ${navItemClass(activeKey === item.key)}`}
              >
                {item.label}
              </Link>
            ))}
            {demoPolicy.flashExperimentsLab && (
              <Link
                to="/app/flash-experiments"
                aria-current={activeKey === "experiments" ? "page" : undefined}
                className={`shrink-0 ${navItemClass(activeKey === "experiments")}`}
              >
                experiments
              </Link>
            )}
          </nav>

          <Button
            ref={composeTriggerRef}
            onClick={() => setComposing(true)}
            className="w-full shrink-0"
          >
            new post
          </Button>

          {demoPolicy.userSwitcher && (
            <div className="shrink-0">
              <UserSwitcher />
            </div>
          )}
        </aside>

        <main id="main-content" tabIndex={-1} className="min-w-0 scroll-mt-24 md:scroll-mt-4">{children}</main>

        <aside aria-label="queue summary" className="hidden lg:block">
          <div className="sticky top-6 space-y-3">
            <div className="rounded-lg border border-border bg-surface p-4 text-body">
              <div className="mb-2 text-body font-medium text-muted">
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

            <div className="rounded-lg border border-dashed border-border p-4 text-body text-muted">
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
