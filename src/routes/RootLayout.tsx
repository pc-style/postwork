import { useState } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { useStore } from "../lib/store";
import { UserSwitcher } from "../components/UserSwitcher";
import { NewPostDialog } from "../components/NewPostDialog";
import { useActiveExperiment } from "../flashExperiments/active";

export function RootLayout({ children }: { children?: React.ReactNode }) {
  const store = useStore();
  const counts = store.useCounts();
  const [composing, setComposing] = useState(false);
  const { experiment, slots, setSlug } = useActiveExperiment();

  const content = children ?? <Outlet />;

  // A shell experiment replaces the entire app chrome; render its shell around
  // the routed page and keep only the exit control on top.
  if (slots.shell) {
    return (
      <>
        {slots.shell({ children: content })}
        {experiment && (
          <ExperimentControl title={experiment.title} onExit={() => setSlug(null)} />
        )}
      </>
    );
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-accent font-bold text-fg">
              P
            </div>
            <div className="text-sm font-semibold leading-tight">postwork</div>
          </Link>

          {slots.nav ?? <DefaultNav />}

          <div className="flex shrink-0 items-center gap-2.5">
            {counts && counts.unread > 0 && (
              <div className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs whitespace-nowrap sm:flex">
                <span className="text-accent-soft">{counts.unread} unread</span>
                {counts.urgent > 0 && (
                  <span className="text-red-300">· {counts.urgent} urgent</span>
                )}
              </div>
            )}
            <button
              onClick={() => setComposing(true)}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium whitespace-nowrap text-fg transition hover:bg-accent-soft"
            >
              + new post
            </button>
            <UserSwitcher />
          </div>
        </div>
      </header>

      {slots.sidebar ? (
        <div className="mx-auto grid max-w-5xl grid-cols-[220px_minmax(0,1fr)] gap-6 px-4 py-6">
          <aside className="sticky top-20 h-fit">{slots.sidebar}</aside>
          <main className="min-w-0">{content}</main>
        </div>
      ) : (
        <main className="mx-auto max-w-3xl px-4 py-6">{content}</main>
      )}

      {composing && <NewPostDialog onClose={() => setComposing(false)} />}

      {experiment && (
        <ExperimentControl title={experiment.title} onExit={() => setSlug(null)} />
      )}
    </div>
  );
}

function DefaultNav() {
  return (
    <nav className="hidden shrink-0 items-center gap-1 text-xs md:flex">
      <Link
        to="/flash-experiments"
        className="rounded-md px-2 py-1 text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-fg [&.active]:text-accent-soft"
      >
        experiments
      </Link>
      <Link
        to="/agents"
        className="rounded-md px-2 py-1 text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-fg [&.active]:text-accent-soft"
      >
        agents
      </Link>
      <Link
        to="/spaces"
        className="rounded-md px-2 py-1 text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-fg [&.active]:text-accent-soft"
      >
        spaces
      </Link>
      <Link
        to="/orgs"
        className="rounded-md px-2 py-1 text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-fg [&.active]:text-accent-soft"
      >
        orgs
      </Link>
    </nav>
  );
}

/**
 * Small floating control shown whenever an experiment is being previewed: it
 * names the active experiment and lets you exit back to the lab. Deliberately
 * the only experiment chrome — the rest of the page is the real app + the change.
 */
function ExperimentControl({
  title,
  onExit,
}: {
  title: string;
  onExit: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-accent/40 bg-[var(--color-surface)]/95 py-1.5 pr-3 pl-1.5 font-mono text-xs shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur">
        <Link
          to="/flash-experiments"
          onClick={onExit}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 text-[var(--color-muted)] transition hover:border-accent/40 hover:text-fg"
        >
          ← back
        </Link>
        <span className="inline-flex items-center gap-1.5 text-accent-soft">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent-soft opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-accent-soft" />
          </span>
          experiment
        </span>
        <span className="text-[var(--color-faint)]">·</span>
        <span className="max-w-[40vw] truncate text-fg">{title}</span>
      </div>
    </div>
  );
}
