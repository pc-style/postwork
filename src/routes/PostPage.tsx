import { useEffect } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useStore } from "../lib/store";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar } from "../components/Avatar";
import { AgentSummary } from "../components/AgentSummary";
import { ReplyTree } from "../components/ReplyTree";
import { Composer } from "../components/Composer";
import { timeAgo, priorityStyles } from "../lib/format";
import { AgentTag } from "../components/AgentTag";
import { RichText } from "../components/RichText";
import { AgentTasksPanel } from "../components/AgentTasksPanel";
import { useActiveExperiment } from "../flashExperiments/active";

const routeApi = getRouteApi("/app/posts/$postId");

export function PostPage() {
  const { postId: postIdParam } = routeApi.useParams();
  const postId = postIdParam as Id<"posts">;
  const store = useStore();
  const { slots } = useActiveExperiment();

  const post = store.usePost(postId);
  const replies = store.useReplies(postId);

  // Mark read whenever this post (or its activity) is viewed — session only.
  useEffect(() => {
    if (post) {
      store.markRead(postId);
    }
    // store.markRead is stable enough via useCallback; depend on activity bump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, post?.lastActivityAt]);

  if (post === undefined) {
    return (
      <div className="py-12 text-center text-sm text-[var(--color-muted)]">
        Loading…
      </div>
    );
  }
  if (post === null) {
    return (
      <div className="py-12 text-center text-sm text-[var(--color-muted)]">
        Post not found.{" "}
        <Link to="/" className="text-accent-soft">
          back to feed
        </Link>
      </div>
    );
  }

  const p = priorityStyles[post.priority];

  return (
    <div>
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] transition hover:text-fg"
      >
        ← feed
      </Link>

      {slots.post ? (
        slots.post({ postId: post._id })
      ) : (
      <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
          {post.pinned && (
            <span className="rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-accent-soft">
              Pinned
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${p.className}`}
          >
            <span className={`size-1.5 rounded-full ${p.dot}`} />
            {p.label}
          </span>
          <span className="rounded-md border border-[var(--color-border)] px-1.5 py-0.5 text-[var(--color-muted)]">
            {post.space}
          </span>
        </div>

        <h1 className="text-xl font-semibold text-fg">{post.title}</h1>

        <div className="mt-2 flex items-center gap-2.5 text-sm text-[var(--color-muted)]">
          <Avatar user={post.author} size={28} />
          <span className="text-fg">{post.author?.name}</span>
          {post.author?.isAgent && <AgentTag />}
          <span>· {post.author?.title}</span>
          <span>· {timeAgo(post.createdAt)}</span>
        </div>

        <div className="mt-4">
          <RichText text={post.body} className="prose-post text-[15px] text-fg" />
        </div>

        <div className="mt-5">
          <AgentSummary
            postId={post._id}
            summary={post.summary}
            model={post.summaryModel}
            updatedAt={post.summaryUpdatedAt}
          />
        </div>

        <div className="mt-4">
          <AgentTasksPanel postId={post._id} />
        </div>
      </article>
      )}

      <div className="mt-6">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-muted)]">
          {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}
        </h2>
        {slots.replies ? (
          slots.replies({ postId: post._id })
        ) : (
          <ReplyTree replies={replies ?? []} postId={post._id} />
        )}
      </div>

      <div className="mt-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        {slots.composer ? (
          slots.composer({ postId: post._id })
        ) : (
          <Composer postId={post._id} placeholder="add to the discussion…" />
        )}
      </div>
    </div>
  );
}
