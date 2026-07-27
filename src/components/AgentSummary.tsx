import { useState } from "react";
import { useStore, isLocalId } from "../lib/store";
import type { Id } from "../../convex/_generated/dataModel";
import { Markdown } from "./Markdown";
import { timeAgo } from "../lib/format";
import { Button } from "./Button";

function teaserFrom(summary?: string) {
  if (!summary) return "Generate a catch-up on key decisions and open questions.";
  const line = summary
    .split("\n")
    .map((part) => part.replace(/^[#>\-*\s]+/, "").replace(/\*\*/g, "").trim())
    .find((part) => part.length > 0 && !/^tl;?dr:?$/i.test(part));
  return line ?? "Summary available.";
}

export function AgentSummary({
  postId,
  summary,
  model,
  updatedAt,
  isStale,
}: {
  postId: Id<"posts">;
  summary?: string;
  model?: string;
  updatedAt?: number;
  isStale: boolean;
}) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const local = isLocalId(postId);

  const onRegenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      await store.summarize(postId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /NO_AI_KEY|API_KEY|not set|AI_PROVIDER/i.test(msg)
          ? "AI summaries aren't configured for this deployment. Set AI_PROVIDER and its matching API key in the Convex environment, then try again."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-accent/25 bg-accent/[0.06]">
      <details open={expanded}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setExpanded((value) => !value);
          }}
          className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-2.5 transition-colors hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft [&::-webkit-details-marker]:hidden"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="rounded-sm bg-accent/20 px-1.5 py-0.5 text-label font-semibold text-accent-soft">
              ai
            </span>
            <span className="text-xs font-semibold lowercase text-accent-soft">
              agent summary
            </span>
            {!expanded && summary && isStale ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-accent-soft"
                aria-hidden="true"
              />
            ) : null}
            {!expanded ? (
              <span className="hidden truncate text-xs text-muted sm:inline">
                {teaserFrom(summary)}
                {summary && isStale ? (
                  <span className="sr-only"> New replies since this summary.</span>
                ) : null}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 text-xs text-muted">{expanded ? "hide" : "open"}</span>
        </summary>

        <div className="ui-reveal px-4 pb-4">
          {summary ? <Markdown text={summary} /> : (
            <p className="text-sm text-muted">
              No summary yet. Generate one to catch up on key decisions and open questions.
            </p>
          )}

          {summary && isStale && (
            <p className="mt-2.5 text-label text-muted">
              New replies arrived after this summary. Regenerate to include them.
            </p>
          )}

          {error && (
            <p role="alert" className="ui-error mt-2">
              {error}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {(model || updatedAt) && !error ? (
              <p className="text-label text-muted">
                {model ? (model === "seed/baked" ? "Demo summary" : `Model: ${model}`) : null}
                {model && updatedAt ? ", " : ""}
                {updatedAt ? `covers activity through ${timeAgo(updatedAt)}` : ""}
              </p>
            ) : (
              <span />
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={onRegenerate}
              disabled={local}
              loading={busy}
              loadingLabel="summarizing…"
              title={local ? "Save the post before generating a summary" : undefined}
            >
              {local ? "save first" : summary ? "regenerate" : "generate"}
            </Button>
          </div>
        </div>
      </details>
    </section>
  );
}
