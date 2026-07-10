import { useState } from "react";
import { useStore, isLocalId } from "../lib/store";
import type { Id } from "../../convex/_generated/dataModel";
import { Markdown } from "./Markdown";
import { timeAgo } from "../lib/format";
import { Button } from "./Button";
import { AccentPanel } from "./AccentPanel";

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

  const local = isLocalId(postId);

  const onRegenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      await store.summarize(postId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /API_KEY|not set/i.test(msg)
          ? "No AI provider configured. Set OPENAI_API_KEY, or set AI_PROVIDER with AI_GATEWAY_API_KEY/OPENROUTER_API_KEY/PIONEER_API_KEY, in your Convex env to enable live summaries."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccentPanel
      chipLabel="ai"
      title="agent summary"
      action={
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
      }
    >
      {summary ? (
        <Markdown text={summary} />
      ) : (
        <p className="text-sm text-muted">
          No summary yet. Generate one to catch up on key decisions and open questions.
        </p>
      )}

      {error && (
        <p role="alert" className="ui-error mt-2">
          {error}
        </p>
      )}

      {(model || updatedAt) && !error && (
        <p className="mt-2.5 text-label text-muted">
          {model === "seed/baked" ? "Demo summary" : `Model: ${model}`}
          {updatedAt ? `, updated ${timeAgo(updatedAt)}` : ""}
        </p>
      )}
    </AccentPanel>
  );
}
