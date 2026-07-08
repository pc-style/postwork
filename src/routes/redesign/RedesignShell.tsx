import { useState, type ReactNode } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useCounts } from "../../lib/store";
import { UserSwitcher } from "../../components/UserSwitcher";
import { QuickPostBar } from "../../components/QuickPostBar";
import { ProductProfileCard } from "../../components/ProductProfileCard";
import { isDemo } from "../../lib/demoMode";

/**
 * The "ink" redesign chrome. This is a self-contained shell (not a flash
 * experiment slot) so every pixel — background, spacing, the reading column —
 * follows the new design without leaking old app chrome through the seams.
 *
 * We deliberately KEEP our own sidebar (it just collapses); we do not adopt the
 * reference comp's feed-as-nav terminal rail.
 */
export function RedesignShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  // Post pages carry their own sticky reply composer at the bottom, and the
  // flash experiments bring their own chrome — the dock stays out of the way.
  const showComposerDock =
    !pathname.startsWith("/app/posts/") && !pathname.startsWith("/app/flash-experiments");

  return (
    <div className="theme-ink flex min-h-screen w-full bg-bg text-fg">
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          aria-label="show sidebar"
          className="fixed top-4 left-4 z-30 flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface hover:text-fg"
        >
          »
        </button>
      ) : (
        <Sidebar onCollapse={() => setCollapsed(true)} />
      )}

      <main className="min-w-0 flex-1">
        {children}
      </main>

      {showComposerDock && <QuickPostBar />}
    </div>
  );
}

export function RedesignLayout() {
  return (
    <RedesignShell>
      <Outlet />
    </RedesignShell>
  );
}

const NAV = [
  { label: "home", to: "/app", search: {} as const, exact: true },
  {
    label: "priority",
    to: "/app",
    search: { priority: "urgent" } as const,
    exact: true,
  },
] as const;

function Sidebar({ onCollapse }: { onCollapse: () => void }) {
  const counts = useCounts();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border py-6">
      <div className="flex items-center justify-between px-5">
        <Link to="/app" className="text-base font-semibold tracking-tight">
          post<span className="text-accent">work</span>
        </Link>
        <button
          onClick={onCollapse}
          aria-label="hide sidebar"
          className="text-muted transition hover:text-fg"
        >
          «
        </button>
      </div>

      <div className="mt-4 flex gap-4 border-y border-border px-5 py-2.5 text-xs text-muted">
        <span>
          <span className="font-semibold text-fg">{counts?.unread ?? 0}</span>{" "}
          unread
        </span>
        {counts && counts.urgent > 0 && (
          <span className="font-semibold text-accent">
            {counts.urgent} urgent
          </span>
        )}
      </div>

      <nav className="mt-4 flex flex-col gap-0.5 px-3 text-sm">
        {NAV.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            search={item.search}
            activeOptions={{ exact: item.exact, includeSearch: true }}
            activeProps={{ className: "text-accent-soft" }}
            className="rounded-md px-2 py-1.5 text-muted transition hover:bg-surface hover:text-fg"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto max-h-[50vh] space-y-3 overflow-y-auto px-4 pb-2">
        {isDemo ? <UserSwitcher /> : <ProductProfileCard />}
      </div>
    </aside>
  );
}
