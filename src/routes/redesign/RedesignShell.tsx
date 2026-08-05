import { useState, type ReactNode } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Button } from "../../components/Button";
import { DemoBanner } from "../../components/DemoBanner";
import { ProductProfileCard } from "../../components/ProductProfileCard";
import { QuickPostBar } from "../../components/QuickPostBar";
import { Sheet } from "../../components/Sheet";
import { UserSwitcher } from "../../components/UserSwitcher";
import { demoPolicy } from "../../lib/demoMode";
import { navItemClass, useActiveNavKey, type NavKey } from "../../lib/activeNav";
import { useSession } from "../../lib/session";
import { useCounts, usePrefetchNav } from "../../lib/store";
import { useUnreadTabBadge } from "../../lib/useDocumentTitle";
import { useUnreadNotifier } from "../../lib/notifications";

export function RedesignShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const counts = useCounts();
  useUnreadTabBadge(counts?.unread);
  useUnreadNotifier(counts?.unread);
  const showComposerDock =
    !pathname.startsWith("/app/posts/") &&
    !pathname.startsWith("/app/catch-up") &&
    !pathname.startsWith("/app/flash-experiments");

  return (
    <div className="theme-ink min-h-screen w-full bg-bg text-fg">
      <div className="sticky top-0 z-40 bg-bg">
        {demoPolicy.publicDemoBanner ? <DemoBanner /> : null}
        <MobileHeader onOpen={() => setMobileNavOpen(true)} />
      </div>
      <div className="flex min-h-screen w-full">
        <Sidebar />
        <main className={`min-w-0 flex-1 ${showComposerDock ? "pb-20" : ""}`}>
          {children}
        </main>
      </div>

      {showComposerDock ? <QuickPostBar /> : null}
      {mobileNavOpen ? (
        <Sheet title="navigation" onClose={() => setMobileNavOpen(false)}>
          <MobileNavigation onSelect={() => setMobileNavOpen(false)} />
        </Sheet>
      ) : null}
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

// The single settings entry point for the shell lives here in the nav; the
// profile card at the bottom of the sidebar only handles sign out.
const NAV: ReadonlyArray<{
  key: NavKey;
  label: string;
  to: "/app" | "/app/catch-up" | "/app/spaces" | "/app/agents" | "/app/settings";
  search?: { priority: "urgent" };
}> = [
  { key: "home", label: "home", to: "/app" },
  { key: "catch-up", label: "catch up", to: "/app/catch-up" },
  { key: "priority", label: "priority", to: "/app", search: { priority: "urgent" } },
  { key: "spaces", label: "spaces", to: "/app/spaces" },
  { key: "agents", label: "agents", to: "/app/agents" },
  { key: "settings", label: "settings", to: "/app/settings" },
];

const SIDEBAR_TOP = demoPolicy.publicDemoBanner ? "md:top-8" : "md:top-0";
const SIDEBAR_HEIGHT = demoPolicy.publicDemoBanner
  ? "md:h-[calc(100vh-2rem)]"
  : "md:h-screen";

function MobileHeader({ onOpen }: { onOpen: () => void }) {
  const counts = useCounts();
  return (
    <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border bg-bg/95 px-4 backdrop-blur md:hidden">
      <Link to="/app" className="text-title font-semibold tracking-tight">
        post<span className="text-accent-soft">work</span>
      </Link>
      <div className="ml-auto flex items-center gap-2 text-label text-muted" aria-label="Your queue">
        <Link
          to="/app"
          search={{ unread: true }}
          className="flex min-h-11 items-center gap-1 transition-colors hover:text-fg"
        >
          <strong className="text-fg">{counts?.unread ?? 0}</strong> unread
        </Link>
        {counts?.urgent ? (
          <Link
            to="/app"
            search={{ priority: "urgent" }}
            className="flex min-h-11 items-center text-urgent transition-colors hover:text-fg"
          >
            {counts.urgent} urgent
          </Link>
        ) : null}
      </div>
      <Button variant="icon" aria-label="Open navigation" onClick={onOpen}>
        <MenuIcon />
      </Button>
    </header>
  );
}

function Sidebar() {
  return (
    <aside className={`sticky ${SIDEBAR_TOP} hidden h-screen ${SIDEBAR_HEIGHT} w-[clamp(12rem,18vw,15rem)] shrink-0 flex-col border-r border-border pt-6 md:flex`}>
      <div className="shrink-0 px-5">
        <Link to="/app" className="text-title font-semibold tracking-tight">
          post<span className="text-accent-soft">work</span>
        </Link>
      </div>
      <Queue />
      {/* The nav list is the flexible region: it absorbs short viewports by
          scrolling, so the profile block below is never squeezed and never
          grows its own scrollbar. */}
      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        <NavLinks />
      </div>
      <div className="shrink-0 space-y-3 px-4 pb-4 pt-3">
        {demoPolicy.userSwitcher && <UserSwitcher />}
        {demoPolicy.productAuth && <ProductProfileCard />}
      </div>
    </aside>
  );
}

function Queue({ onSelect }: { onSelect?: () => void }) {
  const counts = useCounts();
  return (
    <div className="mt-4 flex shrink-0 flex-wrap gap-4 border-y border-border px-5 py-3 text-label text-muted" aria-label="Your queue">
      <Link
        to="/app"
        search={{ unread: true }}
        onClick={onSelect}
        className="flex items-center gap-1 transition-colors hover:text-fg"
      >
        <strong className="text-fg">{counts?.unread ?? 0}</strong> unread
      </Link>
      {counts?.urgent ? (
        <Link
          to="/app"
          search={{ priority: "urgent" }}
          onClick={onSelect}
          className="flex items-center font-medium text-urgent transition-colors hover:text-fg"
        >
          {counts.urgent} urgent
        </Link>
      ) : null}
    </div>
  );
}

function NavLinks({ onSelect }: { onSelect?: () => void }) {
  const { currentUser } = useSession();
  const activeKey = useActiveNavKey();
  const prefetchNav = usePrefetchNav();
  return (
    <nav aria-label="Primary navigation" className="flex flex-col gap-1 px-3">
      {NAV.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          search={item.search}
          aria-current={activeKey === item.key ? "page" : undefined}
          className={navItemClass(activeKey === item.key)}
          onClick={onSelect}
          onMouseEnter={() => prefetchNav(item.key)}
          onFocus={() => prefetchNav(item.key)}
          onTouchStart={() => prefetchNav(item.key)}
        >
          {item.label}
        </Link>
      ))}
      {demoPolicy.flashExperimentsLab ? (
        <Link
          to="/app/flash-experiments"
          aria-current={activeKey === "experiments" ? "page" : undefined}
          className={navItemClass(activeKey === "experiments")}
          onClick={onSelect}
        >
          experiments
        </Link>
      ) : null}
      {demoPolicy.productAuth && currentUser?.role === "admin" ? (
        <Link
          to="/admin"
          aria-current={activeKey === "admin" ? "page" : undefined}
          className={navItemClass(activeKey === "admin")}
          onClick={onSelect}
        >
          admin
        </Link>
      ) : null}
    </nav>
  );
}

function MobileNavigation({ onSelect }: { onSelect: () => void }) {
  return (
    <div className="flex min-h-full flex-col">
      <NavLinks onSelect={onSelect} />
      <div className="mt-6 border-t border-border pt-5">
        <Queue onSelect={onSelect} />
      </div>
      <div className="mt-auto pt-6">
        {demoPolicy.userSwitcher && <UserSwitcher />}
        {demoPolicy.productAuth && <ProductProfileCard />}
      </div>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
