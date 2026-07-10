import { useEffect, useState } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useStore, usePost, useReplies, isLocalId } from "../../lib/store";
import type { Id } from "../../../convex/_generated/dataModel";
import { ReplyTree } from "../../components/ReplyTree";
import { Composer } from "../../components/Composer";
import { RichText } from "../../components/RichText";
import { Markdown } from "../../components/Markdown";
import { AgentTag } from "../../components/AgentTag";
import { LoadingState } from "../../components/LoadingState";
import { timeAgo, priorityStyles } from "../../lib/format";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

const routeApi = getRouteApi("/redesign/posts/$postId");

export function RedesignPostPage() {
  const { postId: postIdParam } = routeApi.useParams();
  const postId = postIdParam as Id<"posts">;
  const store = useStore();

  const post = usePost(postId);
  const replies = useReplies(postId);

  useDocumentTitle(post ? `${post.title} · postwork` : "postwork · ink");

  useEffect(() => {
    if (post) store.markRead(postId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, post?.lastActivityAt]);

  if (post === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <LoadingState />
      </div>
    );
  }
  if (post === null) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-16 text-center text-sm text-muted">
        post not found.{" "}
        <Link to="/redesign" className="text-accent-soft">
          back to feed
        </Link>
      </div>
    );
  }

  const showPriority = post.priority !== "normal";
  const p = priorityStyles[post.priority];

  return (
    <div className="mx-auto max-w-3xl px-8 pb-40 pt-10">
      {/* breadcrumb — quiet, one line */}
      <div className="mb-6 text-xs text-faint">
        <Link to="/redesign" className="text-muted transition hover:text-fg">
          {post.space.toLowerCase()}
        </Link>
        {post.pinned && <span> / pinned</span>}
      </div>

      {/* the post is the hero */}
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-fg">
        {post.title}
      </h1>

      {/* one quiet byline line */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-muted">
        <span className="font-medium text-fg">{post.author?.name}</span>
        {post.author?.isAgent && <AgentTag />}
        <span>posted {timeAgo(post.createdAt)}</span>
        {showPriority && (
          <span className={p.dot === "bg-urgent" ? "text-urgent" : "text-high"}>
            · {p.label.toLowerCase()} priority
          </span>
        )}
      </div>

      {/* body in a ~65ch reading column */}
      <div className="mt-8 max-w-[65ch]">
        <RichText text={post.body} className="prose-post text-[15px] text-fg/90" />
      </div>

      <AgentSummarySection
        postId={post._id}
        summary={post.summary}
        model={post.summaryModel}
        updatedAt={post.summaryUpdatedAt}
      />

      <h2 className="mb-2 text-xs text-faint">
        {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}
      </h2>
      <ReplyTree replies={replies ?? []} postId={post._id} />

      {/* sticky composer that fades up from the page */}
      <div className="sticky bottom-0 -mx-8 mt-8 bg-gradient-to-t from-bg from-40% to-transparent px-8 pt-10 pb-6">
        <Composer postId={post._id} placeholder="add to the discussion…" />
      </div>
    </div>
  );
}

// A quiet, ruled agent-summary section — no boxed card, matching rule 3.
function AgentSummarySection({
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
          ? "no ai provider configured — set a key in the convex env to enable live summaries."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="my-9 border-y border-border py-5">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          agent summary
        </span>
        <button
          onClick={onRegenerate}
          disabled={busy || local}
          title={local ? "save the post to generate a summary" : undefined}
          className="text-xs text-faint transition hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "summarizing…" : local ? "unsaved" : summary ? "regenerate" : "generate"}
        </button>
      </div>

      {summary ? (
        <div className="max-w-[65ch] text-[15px] text-fg/90">
          <Markdown text={summary} />
        </div>
      ) : (
        <p className="text-sm text-muted">
          no summary yet. generate one to catch up on this thread instantly.
        </p>
      )}

      {error && (
        <p className="mt-2 rounded-md bg-red-500/10 px-2 py-1.5 text-xs text-red-300">
          {error}
        </p>
      )}

      {(model || updatedAt) && !error && (
        <p className="mt-3 text-label text-faint">
          {model === "seed/baked" ? "demo summary" : `model: ${model}`}
          {updatedAt ? ` · updated ${timeAgo(updatedAt)}` : ""}
        </p>
      )}
    </section>
  );
}
