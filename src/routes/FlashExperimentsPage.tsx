import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import {
  flashExperiments,
  experimentsByCategory,
  EXPERIMENT_CATEGORY_ORDER,
  type ExperimentStatus,
  type ExperimentCategory,
  type FlashExperiment,
} from "../flashExperiments/registry";
import { useActiveExperiment } from "../flashExperiments/active";
import { signIn, useAuth } from "../shoo";

const statusStyles: Record<ExperimentStatus, string> = {
  new: "border-accent/40 text-accent-soft",
  reviewing: "border-[var(--color-high)]/40 text-[var(--color-high)]",
  liked: "border-accent/50 text-accent-soft",
  rejected: "border-[var(--color-border)] text-[var(--color-muted)]",
};

const categoryMeta: Record<
  ExperimentCategory,
  { label: string; blurb: string }
> = {
  community: {
    label: "community",
    blurb: "suggested from outside the team — with credit to whoever asked.",
  },
  testing: {
    label: "testing",
    blurb: "our own in-house probes still being evaluated.",
  },
  vip: {
    label: "vip",
    blurb: "high-priority, stakeholder-driven bets.",
  },
};

type VoteState = {
  up?: number;
  down?: number;
  viewerVote?: "up" | "down" | null;
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
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="relative overflow-hidden rounded-lg border border-dashed border-accent/50 bg-[var(--color-surface)]/90 p-5 backdrop-blur">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-accent-soft">
            <span className="size-1.5 rounded-full bg-accent-soft" />
            flow lab · work in progress
          </div>
          <h1 className="mt-2 text-2xl font-semibold lowercase text-fg">
            flash experiments
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted)]">
            sandboxed single-change previews, grouped by where they came from.
            open one to use it as if it shipped; vote here to make review
            pressure visible. nothing here is production behavior.
          </p>
        </header>

        {EXPERIMENT_CATEGORY_ORDER.map((category) => {
          const items = experimentsByCategory(category);
          const meta = categoryMeta[category];
          return (
            <section key={category} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-[var(--color-border)] pb-2">
                <h2 className="text-sm font-semibold lowercase tracking-wide text-fg">
                  {meta.label}
                  <span className="ml-2 text-[var(--color-muted)]">
                    ({items.length})
                  </span>
                </h2>
                <p className="text-right text-[11px] text-[var(--color-muted)]">
                  {meta.blurb}
                </p>
              </div>

              {items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-6 text-center text-xs text-[var(--color-muted)]">
                  nothing here yet.
                </div>
              ) : (
                <div className="grid gap-3">
                  {items.map((experiment) => (
                    <ExperimentCard
                      key={experiment.slug}
                      experiment={experiment}
                      vote={votesBySlug.get(experiment.slug)}
                      isLoading={isLoading}
                      isAuthenticated={isAuthenticated}
                      onVote={handleVote}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ExperimentCard({
  experiment,
  vote,
  isLoading,
  isAuthenticated,
  onVote,
}: {
  experiment: FlashExperiment;
  vote: VoteState | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  onVote: (slug: string, next: "up" | "down") => void;
}) {
  const { suggestion } = experiment;
  return (
    <div className="group rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur transition hover:border-accent/50">
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
        <h3 className="text-base font-semibold lowercase text-fg">
          {experiment.title}
        </h3>
        <p className="mt-1 font-sans text-sm text-[var(--color-muted)]">
          {experiment.summary}
        </p>

        {suggestion ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <span className="text-[var(--color-muted)]">suggested by</span>
            <span className="text-fg">{suggestion.name}</span>
            <span className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-accent-soft">
              {suggestion.handle}
            </span>
            {suggestion.link && (
              <a
                href={suggestion.link}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-accent-soft underline-offset-2 transition hover:underline"
              >
                view suggestion →
              </a>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-[var(--color-muted)]">
            requested by {experiment.requestedBy}
          </p>
        )}
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
              !isLoading && !isAuthenticated ? "sign in to vote" : undefined
            }
            onClick={() => onVote(experiment.slug, "up")}
          >
            +{vote?.up ?? 0}
          </VoteButton>
          <VoteButton
            active={vote?.viewerVote === "down"}
            disabled={isLoading}
            title={
              !isLoading && !isAuthenticated ? "sign in to vote" : undefined
            }
            onClick={() => onVote(experiment.slug, "down")}
          >
            -{vote?.down ?? 0}
          </VoteButton>
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
