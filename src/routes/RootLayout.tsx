import { Link, Outlet } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { useActiveExperiment } from "../flashExperiments/active";

export function RootLayout({ children }: { children?: React.ReactNode }) {
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
    <>
      <AppShell>{content}</AppShell>
      {experiment && (
        <ExperimentControl title={experiment.title} onExit={() => setSlug(null)} />
      )}
    </>
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
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-accent/40 bg-surface/95 py-1.5 pr-3 pl-1.5 font-mono text-xs shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur">
        <Link
          to="/app/flash-experiments"
          onClick={onExit}
          className="rounded-full border border-border bg-bg px-2.5 py-1 text-muted transition hover:border-accent/40 hover:text-fg"
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
        <span className="text-faint">·</span>
        <span className="max-w-[40vw] truncate text-fg">{title}</span>
      </div>
    </div>
  );
}
