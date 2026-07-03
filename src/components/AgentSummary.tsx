import { useState } from "react";
import { useStore } from "../lib/store";
import type { Id } from "../../convex/_generated/dataModel";
import { Markdown } from "./Markdown";
import { timeAgo } from "../lib/format";
import { Button } from "./Button";

export function AgentSummary({
  postId,
  summary,
  model,
  updatedAt,
}: {
  postId: Id<"posts">;
  summary?: string;
  model?: string;
  updatedAt?: number;
}) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const local = store.isLocalId(postId);

  const onRegenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      await store.summarize(postId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /API_KEY|not set/i.test(msg)
          ? "No AI provider configured. Set PIONEER_API_KEY (or AI_GATEWAY_API_KEY) in your Convex env to enable live summaries."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-accent/25 bg-accent/[0.06] p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-sm bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent-soft">
            ai
          </span>
          <span className="text-xs font-semibold tracking-wide text-accent-soft lowercase">
            agent summary
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRegenerate}
          disabled={busy || local}
          title={local ? "Save the post to generate a summary" : undefined}
        >
          {busy ? "summarizing…" : local ? "unsaved" : summary ? "regenerate" : "generate"}
        </Button>
      </div>

      {summary ? (
        <Markdown text={summary} />
      ) : (
        <p className="text-sm text-[var(--color-muted)]">
          No summary yet. Generate one to catch up on this thread instantly.
        </p>
      )}

      {error && (
        <p className="mt-2 rounded-md bg-red-500/10 px-2 py-1.5 text-xs text-red-300">
          {error}
        </p>
      )}

      {(model || updatedAt) && !error && (
        <p className="mt-2.5 text-[11px] text-[var(--color-muted)]">
          {model === "seed/baked" ? "demo summary" : `model: ${model}`}
          {updatedAt ? ` · updated ${timeAgo(updatedAt)}` : ""}
        </p>
      )}
    </div>
  );
}
