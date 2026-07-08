import { useState, type ReactNode } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { useCounts } from "../../lib/store";
import { UserSwitcher } from "../../components/UserSwitcher";
import { NewPostDialog } from "../../components/NewPostDialog";
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

      <main className="min-w-0 flex-1">
        <LoveNotice />
        {children}
      </main>

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

function LoveNotice() {
  return (
    <section className="mx-auto mt-5 mb-2 flex max-w-3xl items-center gap-4 rounded-2xl border border-accent/35 bg-[radial-gradient(circle_at_20%_20%,rgba(225,75,143,0.2),transparent_34%),linear-gradient(135deg,rgba(225,75,143,0.16),rgba(21,21,23,0.95))] px-5 py-4 shadow-[0_22px_80px_rgba(225,75,143,0.16)]">
      <KittenHeartIcon />
      <div className="min-w-0">
        <p className="text-label font-medium tracking-[0.16em] text-accent-soft uppercase">
          notification
        </p>
        <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-fg">
          kocham cię roksanko
        </p>
      </div>
    </section>
  );
}

function KittenHeartIcon() {
  return (
    <div
      aria-hidden="true"
      className="relative grid size-16 shrink-0 place-items-center rounded-2xl border border-accent/30 bg-bg/70"
    >
      <div className="absolute top-3 left-4 h-4 w-3 -rotate-12 rounded-t-full bg-accent-soft" />
      <div className="absolute top-3 right-4 h-4 w-3 rotate-12 rounded-t-full bg-accent-soft" />
      <div className="relative size-10 rounded-[44%_44%_50%_50%] bg-accent-soft shadow-[inset_0_-7px_0_rgba(0,0,0,0.16)]">
        <div className="absolute top-3 left-2 size-1.5 rounded-full bg-bg" />
        <div className="absolute top-3 right-2 size-1.5 rounded-full bg-bg" />
        <div className="absolute top-5 left-1/2 size-1 -translate-x-1/2 rotate-45 rounded-[1px] bg-bg" />
        <div className="absolute right-1 bottom-1 h-5 w-5 rotate-45 rounded-tl-lg rounded-tr-lg rounded-bl-lg bg-[#f3a3c6]" />
      </div>
    </div>
  );
}

const NAV = [
  { label: "home", to: "/", search: {} as const, exact: true },
  {
    label: "priority",
    to: "/",
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
        <Link to="/" className="text-base font-semibold tracking-tight">
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

      <div className="mt-auto max-h-[50vh] space-y-3 overflow-y-auto px-4 pb-2">
        {isDemo ? <UserSwitcher /> : <ProductProfileCard />}
      </div>
    </aside>
  );
}
