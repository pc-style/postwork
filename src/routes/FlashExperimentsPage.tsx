import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import {
  flashExperiments,
  EXPERIMENT_CATEGORY_ORDER,
  type ExperimentStatus,
  type ExperimentCategory,
  type ExperimentSlot,
  type FlashExperiment,
} from "../flashExperiments/registry";
import { useActiveExperiment } from "../flashExperiments/active";
import { ExperimentDiscussion } from "../flashExperiments/ExperimentDiscussion";
import { isDemo } from "../lib/demoMode";
import { useDocumentTitle } from "../lib/useDocumentTitle";

const SLOT_LABELS: Partial<Record<ExperimentSlot, string>> = {
  shell: "app-shell",
};

const statusStyles: Record<ExperimentStatus, string> = {
  new: "border-accent/40 text-accent-soft",
  reviewing: "border-high/40 text-high",
  liked: "border-accent/50 text-accent-soft",
  rejected: "border-border text-muted",
  shipped: "border-accent/50 text-accent-soft",
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

// Shipped experiments graduate out of the lab list into a compact "implemented"
// archive row: no votes, no open discussion, no slot chips — just a title, an
// implemented badge, and a link to still preview them.
const activeExperiments = flashExperiments.filter(
  (experiment) => experiment.status !== "shipped",
);
const implementedExperiments = flashExperiments.filter(
  (experiment) => experiment.status === "shipped",
);

export function FlashExperimentsPage() {
  useDocumentTitle("flash experiments · postwork");
  const votes = useQuery(api.flashExperiments.listVotes, {
    slugs: activeExperiments.map((experiment) => experiment.slug),
  });
  const votesBySlug = new Map(votes?.map((vote) => [vote.slug, vote]));
  const counts = useQuery(api.discussions.listCounts, {
    slugs: activeExperiments.map((experiment) => experiment.slug),
  });
  const countsBySlug = new Map(counts?.map((c) => [c.slug, c]));
  const setVote = useMutation(api.flashExperiments.setVote);
  const { setSlug } = useActiveExperiment();

  // The lab list is "outside" any experiment — clear an active preview on entry.
  useEffect(() => {
    setSlug(null);
  }, [setSlug]);

  const handleVote = async (slug: string, next: "up" | "down") => {
    if (isDemo) return;
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
        return;
      }
      console.error(err);
    }
  };

  return (
    // Deliberately set apart from the rest of the app: a "lab" zone with a
    // blueprint grid, dashed accent edges, and all-mono chrome so you always
    // know you've stepped out of the normal product surface.
    <div className="-mx-4 -my-6 min-h-[calc(100vh-3.25rem)] bg-bg px-4 py-6 font-mono [background-image:linear-gradient(var(--color-border)_1px,transparent_1px),linear-gradient(90deg,var(--color-border)_1px,transparent_1px)] [background-size:28px_28px] [background-position:center]">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="relative overflow-hidden rounded-lg border border-dashed border-accent/50 bg-surface/90 p-5 backdrop-blur">
          <div className="flex items-center gap-2 text-label font-medium text-accent-soft">
            <span className="size-1.5 rounded-full bg-accent-soft" />
            flow lab · work in progress
          </div>
          <h1 className="mt-2 text-xl font-semibold lowercase text-fg">
            flash experiments
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            sandboxed single-change previews, grouped by where they came from.
            open one to use it as if it shipped; vote here to make review
            pressure visible. nothing here is production behavior.
          </p>
        </header>

        {/* The full "ink" redesign is too broad for the single-slot preview
            system, so it lives as its own usable surface. Feature it here. */}
        <Link
          to="/redesign"
          className="group relative block overflow-hidden rounded-lg border border-accent/40 bg-surface/90 p-5 backdrop-blur transition hover:border-accent/70"
        >
          <div className="flex items-center gap-2 text-label font-medium text-accent-soft">
            <span className="size-1.5 rounded-full bg-accent-soft" />
            full redesign · usable app
          </div>
          <h2 className="mt-2 text-lg font-semibold lowercase text-fg">
            the ink redesign
          </h2>
          <p className="mt-2 max-w-2xl font-sans text-sm text-muted">
            a true gray-black surface with the magenta accent popping again:
            hero titles, a 65-char reading column, one quiet metadata line, and
            our own collapsible sidebar. open it as the real app, not a preview.
          </p>
          <span className="mt-3 inline-block text-xs text-accent-soft transition group-hover:translate-x-0.5">
            open redesign →
          </span>
        </Link>

        {EXPERIMENT_CATEGORY_ORDER.map((category) => {
          const items = activeExperiments.filter(
            (experiment) => experiment.category === category,
          );
          const meta = categoryMeta[category];
          if (items.length === 0) return null;
          return (
            <section key={category} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-border pb-2">
                <h2 className="text-sm font-semibold lowercase tracking-wide text-fg">
                  {meta.label}
                  <span className="ml-2 text-muted">
                    ({items.length})
                  </span>
                </h2>
                <p className="text-right text-label text-muted">
                  {meta.blurb}
                </p>
              </div>

              <div className="grid gap-3">
                {items.map((experiment) => (
                  <ExperimentCard
                    key={experiment.slug}
                    experiment={experiment}
                    vote={votesBySlug.get(experiment.slug)}
                    replyCount={countsBySlug.get(experiment.slug)?.replyCount ?? 0}
                    isLoading={false}
                    isAuthenticated={!isDemo}
                    onVote={handleVote}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {implementedExperiments.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-border pb-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold lowercase tracking-wide text-fg">
                implemented
                <span className="text-muted">
                  ({implementedExperiments.length})
                </span>
              </h2>
              <p className="text-right text-label text-muted">
                community suggestions that shipped — now part of the default
                app.
              </p>
            </div>
            <div className="grid gap-1.5">
              {implementedExperiments.map((experiment) => (
                <ImplementedRow key={experiment.slug} experiment={experiment} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ExperimentCard({
  experiment,
  vote,
  replyCount,
  isLoading,
  isAuthenticated,
  onVote,
}: {
  experiment: FlashExperiment;
  vote: VoteState | undefined;
  replyCount: number;
  isLoading: boolean;
  isAuthenticated: boolean;
  onVote: (slug: string, next: "up" | "down") => void;
}) {
  const { suggestion } = experiment;
  return (
    <div className="group rounded-lg border border-dashed border-border bg-surface/90 backdrop-blur transition hover:border-accent/50">
      <Link
        to="/flash-experiments/$slug"
        params={{ slug: experiment.slug }}
        className="block p-4"
      >
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-label font-medium text-muted">
          <span
            className={`rounded-md border px-1.5 py-0.5 ${statusStyles[experiment.status]}`}
          >
            {experiment.status}
          </span>
          <span className="text-faint">·</span>
          {Object.keys(experiment.appSlots).map((slot) => (
            <span
              key={slot}
              className="rounded-md border border-border bg-bg px-1.5 py-0.5 tracking-tight"
            >
              {SLOT_LABELS[slot as ExperimentSlot] ?? slot}
            </span>
          ))}
        </div>
        <h3 className="text-base font-semibold lowercase text-fg">
          {experiment.title}
        </h3>
        <p className="mt-1 font-sans text-sm text-muted">
          {experiment.summary}
        </p>

        {suggestion ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-label">
            <span className="text-muted">suggested by</span>
            <span className="text-fg">{suggestion.name}</span>
            <span className="rounded-md border border-border bg-bg px-1.5 py-0.5 text-accent-soft">
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
          <p className="mt-3 text-label text-muted">
            requested by {experiment.requestedBy}
          </p>
        )}
      </Link>

      <div className="flex items-center justify-between gap-3 border-t border-dashed border-border px-4 py-2.5">
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
            disabled={isLoading || !isAuthenticated}
            title={
              !isLoading && !isAuthenticated ? "sign in to vote" : undefined
            }
            onClick={() => onVote(experiment.slug, "up")}
          >
            +{vote?.up ?? 0}
          </VoteButton>
          <VoteButton
            active={vote?.viewerVote === "down"}
            disabled={isLoading || !isAuthenticated}
            title={
              !isLoading && !isAuthenticated ? "sign in to vote" : undefined
            }
            onClick={() => onVote(experiment.slug, "down")}
          >
            -{vote?.down ?? 0}
          </VoteButton>
        </div>
      </div>

      <ExperimentDiscussion
        slug={experiment.slug}
        title={experiment.title}
        replyCount={replyCount}
        isAuthenticated={isAuthenticated}
        isLoading={isLoading}
      />
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
          : "border-border text-muted hover:border-accent/40 hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

function ImplementedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-label font-medium lowercase text-accent-soft">
      <svg viewBox="0 0 24 24" fill="none" className="size-2.5" aria-hidden="true">
        <path
          d="M5 13l4 4L19 7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      implemented
    </span>
  );
}

function ImplementedRow({ experiment }: { experiment: FlashExperiment }) {
  const { suggestion } = experiment;
  return (
    <Link
      to="/flash-experiments/$slug"
      params={{ slug: experiment.slug }}
      title={experiment.summary}
      className="group flex items-center gap-2.5 rounded-lg border border-dashed border-border bg-surface/70 px-3 py-2 transition hover:border-accent/40 hover:bg-surface"
    >
      <ImplementedBadge />
      <span className="min-w-0 flex-1 truncate text-sm font-medium lowercase text-fg">
        {experiment.title}
      </span>
      {suggestion && (
        <span className="hidden shrink-0 text-label text-muted sm:inline">
          {suggestion.name}
        </span>
      )}
      <span className="shrink-0 text-xs text-accent-soft transition group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}
