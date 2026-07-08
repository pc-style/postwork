import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useStore, usePost, useReplies, isLocalId } from "../../lib/store";
import { useAttachments } from "../../lib/attachments";
import type { Id } from "../../../convex/_generated/dataModel";
import type { EnrichedPost } from "../../lib/types";
import { ReplyTree } from "../../components/ReplyTree";
import { Composer } from "../../components/Composer";
import { ComposerShell } from "../../components/ComposerShell";
import { RichText } from "../../components/RichText";
import { Markdown } from "../../components/Markdown";
import { AgentTag } from "../../components/AgentTag";
import { AttachmentGallery } from "../../components/AttachmentPicker";
import { PostModeration } from "../../components/PostModeration";
import { LoadingState } from "../../components/LoadingState";
import { timeAgo, priorityStyles } from "../../lib/format";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

export function RedesignPostPage() {
  const { postId: postIdParam } = useParams({ strict: false });
  const postId = postIdParam as Id<"posts">;
  const store = useStore();

  const post = usePost(postId);
  const repliesResult = useReplies(postId);
  const replies = repliesResult.replies;
  const attachments = useAttachments(postId);
  const [editing, setEditing] = useState(false);

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
        <Link to="/app" className="text-accent-soft">
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
        <Link to="/app" search={{ space: post.space }} className="text-muted transition hover:text-fg">
          {post.space.toLowerCase()}
        </Link>
        {post.pinned && <span> / pinned</span>}
      </div>

      {/* the post is the hero — or the edit form when editing */}
      {editing ? (
        <PostEditForm post={post} onDone={() => setEditing(false)} />
      ) : (
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-fg">
          {post.title}
        </h1>
      )}

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
        {post.editedAt && (
          <span className="text-faint">· edited {timeAgo(post.editedAt)}</span>
        )}
      </div>

      {!editing && (
        <PostModeration
          post={post}
          onStartEdit={() => setEditing(true)}
        />
      )}

      {/* body in a ~65ch reading column */}
      {!editing && (
        <div className="mt-8 max-w-[65ch]">
          <RichText text={post.body} className="prose-post text-[15px] text-fg/90" />
          <AttachmentGallery
            attachments={attachments.filter((a) => !a.replyId)}
          />
        </div>
      )}

      <AgentSummarySection
        postId={post._id}
        summary={post.summary}
        model={post.summaryModel}
        updatedAt={post.summaryUpdatedAt}
      />

      <h2 className="mb-2 text-xs text-faint">
        {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}
      </h2>
      <ReplyTree
        replies={replies}
        postId={post._id}
        attachments={attachments}
      />
      {repliesResult.status === "CanLoadMore" && repliesResult.loadMore && (
        <button
          onClick={repliesResult.loadMore}
          className="mt-2 text-xs text-muted transition hover:text-fg"
        >
          load more replies
        </button>
      )}

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

// Inline edit form for a post's title + body (Phase 3.5). Replaces the hero
// title and body in place while editing; calls `store.editPost` on save.
function PostEditForm({
  post,
  onDone,
}: {
  post: EnrichedPost;
  onDone: () => void;
}) {
  const store = useStore();
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const save = async () => {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await store.editPost({
        postId: post._id,
        title: title.trim(),
        body: body.trim(),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save edits.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <ComposerShell
        title={title}
        setTitle={setTitle}
        titleRef={titleRef}
        titleAutoFocus
        titlePlaceholder="title"
        titleClassName="w-full rounded-lg border border-border bg-bg px-3 py-2 text-2xl font-bold tracking-tight outline-none focus:border-accent/50"
        body={body}
        setBody={setBody}
        textareaRef={bodyRef}
        placeholder="body"
        rows={8}
        textareaClassName="mt-2 w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-[15px] outline-none focus:border-accent/50"
        footerClassName="mt-3 flex items-center justify-between gap-2"
        actions={
          <button
            type="button"
            onClick={onDone}
            disabled={busy}
            className="rounded-md text-xs text-muted transition hover:text-fg disabled:opacity-40"
          >
            cancel
          </button>
        }
        submitLabel={busy ? "saving…" : "save"}
        submittingLabel="saving…"
        submitting={busy}
        disabled={busy || !title.trim() || !body.trim()}
        submitButtonClassName="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-fg transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
        onSubmit={() => void save()}
      />
      {error && <p className="mt-2 text-xs text-urgent">{error}</p>}
    </div>
  );
}
