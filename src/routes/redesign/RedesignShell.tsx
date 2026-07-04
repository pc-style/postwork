import { useState, type ReactNode } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { useCounts } from "../../lib/store";
import { UserSwitcher } from "../../components/UserSwitcher";
import { NewPostDialog } from "../../components/NewPostDialog";

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
  const [composing, setComposing] = useState(false);

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
        <Sidebar
          onCollapse={() => setCollapsed(true)}
          onNewPost={() => setComposing(true)}
        />
      )}

      <main className="min-w-0 flex-1">{children}</main>

      {composing && <NewPostDialog onClose={() => setComposing(false)} />}
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
  { label: "home", to: "/redesign", search: {} as const, exact: true },
  {
    label: "priority",
    to: "/redesign",
    search: { priority: "urgent" } as const,
    exact: true,
  },
] as const;

function Sidebar({
  onCollapse,
  onNewPost,
}: {
  onCollapse: () => void;
  onNewPost: () => void;
}) {
  const counts = useCounts();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border py-6">
      <div className="flex items-center justify-between px-5">
        <Link to="/redesign" className="text-base font-semibold tracking-tight">
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
        <button
          onClick={onNewPost}
          className="mt-1 rounded-md px-2 py-1.5 text-left text-muted transition hover:bg-surface hover:text-fg"
        >
          <span className="text-accent">+</span> new post
        </button>
      </nav>

      <div className="mt-auto space-y-3 px-4">
        <Link
          to="/"
          className="block px-1 text-xs text-faint transition hover:text-muted"
        >
          ← classic postwork
        </Link>
        <UserSwitcher />
      </div>
    </aside>
  );
}
