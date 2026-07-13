import { useState, type ReactNode } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Button } from "../../components/Button";
import { DemoBanner } from "../../components/DemoBanner";
import { ProductProfileCard } from "../../components/ProductProfileCard";
import { QuickPostBar } from "../../components/QuickPostBar";
import { Sheet } from "../../components/Sheet";
import { UserSwitcher } from "../../components/UserSwitcher";
import { demoPolicy } from "../../lib/demoMode";
import { useSession } from "../../lib/session";
import { useCounts } from "../../lib/store";

export function RedesignShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
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
        <Sheet title="Navigation" onClose={() => setMobileNavOpen(false)}>
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

const NAV = [
  { label: "home", to: "/app" as const, search: {} as const, exact: true },
  { label: "catch up", to: "/app/catch-up" as const, exact: false },
  {
    label: "priority",
    to: "/app" as const,
    search: { priority: "urgent" } as const,
    exact: true,
  },
  { label: "spaces", to: "/app/spaces" as const, exact: false },
  { label: "agents", to: "/app/agents" as const, exact: false },
] as const;

const SIDEBAR_TOP = demoPolicy.publicDemoBanner ? "md:top-8" : "md:top-0";
const SIDEBAR_HEIGHT = demoPolicy.publicDemoBanner
  ? "md:h-[calc(100vh-2rem)]"
  : "md:h-screen";

function MobileHeader({ onOpen }: { onOpen: () => void }) {
  const counts = useCounts();
  return (
    <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border bg-bg/95 px-4 backdrop-blur md:hidden">
      <Link to="/app" className="text-base font-semibold tracking-tight">
        post<span className="text-accent-soft">work</span>
      </Link>
      <div className="ml-auto flex items-center gap-2 text-xs text-muted" aria-label="Your queue">
        <span><strong className="text-fg">{counts?.unread ?? 0}</strong> unread</span>
        {counts?.urgent ? <span className="text-urgent">{counts.urgent} urgent</span> : null}
      </div>
      <Button variant="icon" aria-label="Open navigation" onClick={onOpen}>
        <MenuIcon />
      </Button>
    </header>
  );
}

function Sidebar() {
  return (
    <aside className={`sticky ${SIDEBAR_TOP} hidden h-screen ${SIDEBAR_HEIGHT} w-[clamp(12rem,18vw,15rem)] shrink-0 flex-col border-r border-border py-6 md:flex`}>
      <div className="px-5">
        <Link to="/app" className="text-base font-semibold tracking-tight">
          post<span className="text-accent-soft">work</span>
        </Link>
      </div>
      <Queue />
      <NavLinks />
      <div
        className={`mt-auto max-h-[48vh] space-y-3 px-4 pb-2 ${demoPolicy.userSwitcher ? "overflow-visible" : "overflow-y-auto"}`}
      >
        {demoPolicy.userSwitcher && <UserSwitcher />}
        {demoPolicy.productAuth && <ProductProfileCard />}
      </div>
    </aside>
  );
}

function Queue() {
  const counts = useCounts();
  return (
    <div className="mt-4 flex flex-wrap gap-4 border-y border-border px-5 py-3 text-xs text-muted" aria-label="Your queue">
      <span><strong className="text-fg">{counts?.unread ?? 0}</strong> unread</span>
      {counts?.urgent ? <span className="font-medium text-urgent">{counts.urgent} urgent</span> : null}
    </div>
  );
}

function NavLinks({ onSelect }: { onSelect?: () => void }) {
  const { currentUser } = useSession();
  return (
    <nav aria-label="Primary navigation" className="mt-4 flex flex-col gap-1 px-3 text-sm">
      {NAV.map((item) => (
        <Link
          key={item.label}
          to={item.to}
          search={"search" in item ? item.search : undefined}
          activeOptions={{ exact: item.exact, includeSearch: "search" in item }}
          activeProps={{ className: "bg-surface text-accent-soft", "aria-current": "page" }}
          className="flex min-h-11 items-center rounded-md px-3 py-2 text-muted transition-colors hover:bg-surface hover:text-fg"
          onClick={onSelect}
        >
          {item.label}
        </Link>
      ))}
      {demoPolicy.flashExperimentsLab ? (
        <Link
          to="/app/flash-experiments"
          activeProps={{ className: "bg-surface text-accent-soft", "aria-current": "page" }}
          className="flex min-h-11 items-center rounded-md px-3 py-2 text-muted transition-colors hover:bg-surface hover:text-fg"
          onClick={onSelect}
        >
          experiments
        </Link>
      ) : null}
      {demoPolicy.productAuth && currentUser?.role === "admin" ? (
        <Link
          to="/admin"
          className="flex min-h-11 items-center rounded-md px-3 py-2 text-muted transition-colors hover:bg-surface hover:text-fg"
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
        <Queue />
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
