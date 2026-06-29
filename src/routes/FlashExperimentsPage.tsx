import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import {
  flashExperiments,
  type ExperimentStatus,
} from "../flashExperiments/registry";
import { useActiveExperiment } from "../flashExperiments/active";
import { signIn, useAuth } from "../shoo";

const statusStyles: Record<ExperimentStatus, string> = {
  new: "border-accent/40 text-accent-soft",
  reviewing: "border-[var(--color-high)]/40 text-[var(--color-high)]",
  liked: "border-accent/50 text-accent-soft",
  rejected: "border-[var(--color-border)] text-[var(--color-muted)]",
};

export function FlashExperimentsPage() {
  const votes = useQuery(api.flashExperiments.listVotes, {
    slugs: flashExperiments.map((experiment) => experiment.slug),
  });
  const votesBySlug = new Map(votes?.map((vote) => [vote.slug, vote]));
  const setVote = useMutation(api.flashExperiments.setVote);
  const { isLoading, isAuthenticated } = useAuth();
  const { setSlug } = useActiveExperiment();

  // The lab list is "outside" any experiment — clear an active preview on entry.
  useEffect(() => {
    setSlug(null);
  }, [setSlug]);

  const handleVote = async (slug: string, next: "up" | "down") => {
    if (isLoading) return;
    if (!isAuthenticated) {
      void signIn();
      return;
    }
    const current = votesBySlug.get(slug)?.viewerVote;
    const value = current === next ? null : next;
    try {
      await setVote({ slug, vote: value });
    } catch (err) {
      if (
        err instanceof ConvexError &&
        typeof err.data === "object" &&
        err.data !== null &&
        (err.data as { code?: string }).code === "UNAUTHENTICATED"
      ) {
        void signIn();
        return;
      }
      console.error(err);
    }
  };

  return (
    // Deliberately set apart from the rest of the app: a "lab" zone with a
    // blueprint grid, dashed accent edges, and all-mono chrome so you always
    // know you've stepped out of the normal product surface.
    <div className="-mx-4 -my-6 min-h-[calc(100vh-3.25rem)] bg-[var(--color-bg)] px-4 py-6 font-mono [background-image:linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] [background-size:28px_28px] [background-position:center]">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="relative overflow-hidden rounded-lg border border-dashed border-accent/50 bg-[var(--color-surface)]/90 p-5 backdrop-blur">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-accent-soft">
            <span className="size-1.5 rounded-full bg-accent-soft" />
            flow lab
          </div>
          <h1 className="mt-2 text-2xl font-semibold lowercase text-fg">
            flash experiments
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted)]">
            sandboxed single-change previews. open one to use it as if it shipped;
            vote here to make review pressure visible. nothing here is production
            behavior.
          </p>
        </header>

        <div className="grid gap-3">
          {flashExperiments.map((experiment) => {
            const vote = votesBySlug.get(experiment.slug);
            return (
              <div
                key={experiment.slug}
                className="group rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur transition hover:border-accent/50"
              >
                <Link
                  to="/flash-experiments/$slug"
                  params={{ slug: experiment.slug }}
                  className="block p-4"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                    <span
                      className={`rounded-md border px-1.5 py-0.5 ${statusStyles[experiment.status]}`}
                    >
                      {experiment.status}
                    </span>
                    <span className="text-[var(--color-faint)]">·</span>
                    {experiment.slots.map((slot) => (
                      <span
                        key={slot}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 tracking-tight"
                      >
                        {slot}
                      </span>
                    ))}
                  </div>
                  <h2 className="text-base font-semibold lowercase text-fg">
                    {experiment.title}
                  </h2>
                  <p className="mt-1 font-sans text-sm text-[var(--color-muted)]">
                    {experiment.summary}
                  </p>
                  <p className="mt-3 text-[11px] text-[var(--color-muted)]">
                    requested by {experiment.requestedBy}
                  </p>
                </Link>

                <div className="flex items-center justify-between gap-3 border-t border-dashed border-[var(--color-border)] px-4 py-2.5">
                  <Link
                    to="/flash-experiments/$slug"
                    params={{ slug: experiment.slug }}
                    className="text-xs text-accent-soft transition group-hover:translate-x-0.5"
                  >
                    open experiment →
                  </Link>
                  <div className="flex items-center gap-1.5 text-xs">
                    <VoteButton
                      active={vote?.viewerVote === "up"}
                      disabled={isLoading}
                      title={
                        !isLoading && !isAuthenticated
                          ? "sign in to vote"
                          : undefined
                      }
                      onClick={() => void handleVote(experiment.slug, "up")}
                    >
                      +{vote?.up ?? 0}
                    </VoteButton>
                    <VoteButton
                      active={vote?.viewerVote === "down"}
                      disabled={isLoading}
                      title={
                        !isLoading && !isAuthenticated
                          ? "sign in to vote"
                          : undefined
                      }
                      onClick={() => void handleVote(experiment.slug, "down")}
                    >
                      -{vote?.down ?? 0}
                    </VoteButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function VoteButton({
  active,
  onClick,
  children,
  disabled,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md border px-2 py-1 tabular-nums transition disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "border-accent/50 bg-accent/15 text-accent-soft"
          : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-accent/40 hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
