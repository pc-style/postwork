import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import type { Id } from "../../../convex/_generated/dataModel";
import { AgentSummary } from "../../components/AgentSummary";
import { AgentTasksPanel } from "../../components/AgentTasksPanel";
import { AgentTag } from "../../components/AgentTag";
import { AttachmentGallery } from "../../components/AttachmentPicker";
import { Button } from "../../components/Button";
import { Composer } from "../../components/Composer";
import { ComposerShell } from "../../components/ComposerShell";
import { LoadingState } from "../../components/LoadingState";
import { PostModeration } from "../../components/PostModeration";
import { ReplyTree } from "../../components/ReplyTree";
import { RichText } from "../../components/RichText";
import { useAttachments } from "../../lib/attachments";
import { priorityStyles, timeAgo } from "../../lib/format";
import { usePost, useReplies, useStore } from "../../lib/store";
import type { EnrichedPost } from "../../lib/types";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

export function RedesignPostPage() {
  const { postId: postIdParam } = useParams({ strict: false });
  const postId = postIdParam as Id<"posts">;
  const store = useStore();
  const post = usePost(postId);
  const repliesResult = useReplies(postId);
  const attachments = useAttachments(postId);
  const [editing, setEditing] = useState(false);

  useDocumentTitle(post ? `${post.title} · postwork` : "Post · postwork");

  useEffect(() => {
    if (post) store.markRead(postId);
    // Re-run only when the post identity or latest activity changes,
    // not on every object identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, post?.lastActivityAt]);

  if (post === undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <LoadingState label="Loading post" preset="post" />
      </div>
    );
  }

  if (post === null) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center text-sm text-muted sm:px-6">
        <p>We couldn't find this post.</p>
        <Link to="/app" className="mt-3 inline-flex min-h-11 items-center text-accent-soft hover:text-fg">
          back to feed
        </Link>
      </div>
    );
  }

  const showPriority = post.priority !== "normal";
  const priority = priorityStyles[post.priority];

  return (
    <article className="mx-auto w-full max-w-3xl px-4 pb-8 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10">
      <nav aria-label="Breadcrumb" className="mb-5 text-xs text-muted">
        <Link
          to="/app"
          search={{ space: post.space }}
          className="inline-flex min-h-11 items-center hover:text-fg"
        >
          {post.space}
        </Link>
        {post.pinned ? <span className="ml-3 text-accent-soft">Pinned</span> : null}
      </nav>

      {editing ? (
        <PostEditForm post={post} onDone={() => setEditing(false)} />
      ) : (
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-fg sm:text-3xl">
          {post.title}
        </h1>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span className="font-medium text-fg">{post.author?.name ?? "Unknown"}</span>
        {post.author?.isAgent ? <AgentTag /> : null}
        <span>Posted {timeAgo(post.createdAt)}</span>
        {showPriority ? (
          <span className={`inline-flex items-center gap-1.5 ${post.priority === "urgent" ? "text-urgent" : "text-high"}`}>
            <span className={`size-1.5 rounded-full ${priority.dot}`} aria-hidden="true" />
            {priority.label} priority
          </span>
        ) : null}
        {post.editedAt ? <span>Edited {timeAgo(post.editedAt)}</span> : null}
      </div>

      {!editing ? (
        <PostModeration post={post} onStartEdit={() => setEditing(true)} />
      ) : null}

      {!editing ? (
        <div className="mt-7 max-w-[65ch]">
          <RichText text={post.body} className="prose-post text-[15px] text-fg/95" />
          <AttachmentGallery attachments={attachments.filter((attachment) => !attachment.replyId)} />
        </div>
      ) : null}

      <div className="mt-8 border-t border-border pt-5">
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

      <section aria-labelledby="replies-heading" className="mt-10">
        <h2 id="replies-heading" className="mb-2 text-sm font-semibold text-fg">
          {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}
        </h2>
        {repliesResult.status === "LoadingFirstPage" ? (
          <LoadingState label="Loading replies" preset="feed" count={3} />
        ) : (
          <ReplyTree replies={repliesResult.replies} postId={post._id} attachments={attachments} />
        )}
        {(repliesResult.status === "CanLoadMore" || repliesResult.status === "LoadingMore") && repliesResult.loadMore ? (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={repliesResult.loadMore}
            loading={repliesResult.status === "LoadingMore"}
            loadingLabel="loading…"
          >
            load more replies
          </Button>
        ) : null}
        <div className="mt-7 border-t border-border pt-5">
          <h2 className="mb-3 text-sm font-semibold text-fg">add a reply</h2>
          <Composer postId={post._id} placeholder="Add a reply." />
        </div>
      </section>
    </article>
  );
}

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
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await store.editPost({
        postId: post._id,
        title: title.trim(),
        body: body.trim(),
      });
      onDone();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't save the post. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <ComposerShell
        title={title}
        setTitle={(value) => {
          setTitle(value);
          setError(null);
        }}
        titleRef={titleRef}
        titleAutoFocus
        titleLabel="Title"
        titleRequired
        titlePlaceholder="Post title"
        titleClassName="ui-field text-lg font-semibold"
        body={body}
        setBody={(value) => {
          setBody(value);
          setError(null);
        }}
        textareaRef={bodyRef}
        bodyLabel="Post"
        placeholder="Post content"
        rows={8}
        textareaClassName="ui-field min-h-48 resize-y"
        footerClassName="mt-3 flex flex-wrap items-center justify-end gap-2"
        actions={
          <Button variant="secondary" onClick={onDone} disabled={busy}>
            cancel
          </Button>
        }
        submitLabel="save"
        submittingLabel="saving…"
        submitting={busy}
        disabled={!title.trim() || !body.trim()}
        onSubmit={() => void save()}
      />
      {error ? <p role="alert" className="ui-error mt-3">{error}</p> : null}
    </div>
  );
}
