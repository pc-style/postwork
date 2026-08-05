import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useParams } from "@tanstack/react-router";
import type { Id } from "../../../convex/_generated/dataModel";
import { AgentSummary } from "../../components/AgentSummary";
import { AgentTasksPanel } from "../../components/AgentTasksPanel";
import { AgentTag } from "../../components/AgentTag";
import { AttachmentGallery } from "../../components/AttachmentGallery";
import { Button } from "../../components/Button";
import { Composer } from "../../components/Composer";
import { ComposerShell } from "../../components/ComposerShell";
import { LoadingState } from "../../components/LoadingState";
import { PostModeration } from "../../components/PostModeration";
import { ReplyTree } from "../../components/ReplyTree";
import { RichText } from "../../components/RichText";
import { RichEmbedList } from "../../components/RichEmbedList";
import { useAttachments } from "../../lib/attachments";
import { priorityStyles, timeAgo } from "../../lib/format";
import { usePost, useReplies, useStore } from "../../lib/store";
import type { EnrichedPost } from "../../lib/types";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { useDeferredFlag } from "../../lib/useDeferredFlag";

const AGENT_SIDEBAR_WIDTH_KEY = "postwork.agentSidebarWidth";
const AGENT_SIDEBAR_DEFAULT = 336;
const AGENT_SIDEBAR_MIN = 280;
const AGENT_SIDEBAR_MAX = 560;
// Wide enough for a normal horizontal "agents" button — never rotated text.
const AGENT_SIDEBAR_COLLAPSED = 104;

function clampSidebarWidth(width: number) {
  return Math.min(AGENT_SIDEBAR_MAX, Math.max(AGENT_SIDEBAR_MIN, Math.round(width)));
}

function readSidebarWidth() {
  if (typeof window === "undefined") return AGENT_SIDEBAR_DEFAULT;
  const raw = window.localStorage.getItem(AGENT_SIDEBAR_WIDTH_KEY);
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : AGENT_SIDEBAR_DEFAULT;
}

export function RedesignPostPage() {
  const { postId: postIdParam } = useParams({ strict: false });
  const postId = postIdParam as Id<"posts">;
  const store = useStore();
  const post = usePost(postId);
  const repliesResult = useReplies(postId);
  const attachments = useAttachments(postId);
  const [editing, setEditing] = useState(false);
  const showSkeleton = useDeferredFlag(150);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Lazy initializer: the saved width applies on first paint (no jump from
  // the default); readSidebarWidth already guards `typeof window`.
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number; currentWidth: number } | null>(
    null,
  );

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!sidebarOpen) return;
      // preventDefault stops text selection during the drag, but also
      // suppresses the default pointerdown focus — refocus explicitly so the
      // separator keeps its keyboard-resize affordance after a drag.
      event.preventDefault();
      event.currentTarget.focus();
      resizeRef.current = {
        startX: event.clientX,
        startWidth: sidebarWidth,
        currentWidth: sidebarWidth,
      };
      setResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [sidebarOpen, sidebarWidth],
  );

  const onResizePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeRef.current;
    if (!drag) return;
    // Handle sits on the left edge; dragging left grows the sidebar.
    const next = clampSidebarWidth(drag.startWidth + (drag.startX - event.clientX));
    drag.currentWidth = next;
    setSidebarWidth(next);
  }, []);

  const endResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeRef.current;
    if (!drag) return;
    resizeRef.current = null;
    setResizing(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    window.localStorage.setItem(AGENT_SIDEBAR_WIDTH_KEY, String(drag.currentWidth));
  }, []);

  useDocumentTitle(post ? `${post.title} · postwork` : "Post · postwork");

  useEffect(() => {
    if (post) store.markRead(postId);
    // Re-run only when the post identity or latest activity changes,
    // not on every object identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, post?.lastActivityAt]);

  if (post === undefined) {
    if (!showSkeleton) return null;
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

  const agentPanels = (
    <>
      <AgentSummary
        postId={post._id}
        summary={post.summary}
        model={post.summaryModel}
        updatedAt={post.summaryUpdatedAt}
        isStale={post.isStale}
      />
      <div className="mt-4">
        <AgentTasksPanel postId={post._id} />
      </div>
    </>
  );

  const openSidebarWidth = sidebarOpen ? sidebarWidth : AGENT_SIDEBAR_COLLAPSED;

  return (
    <div
      className={`mx-auto w-full max-w-3xl px-4 pb-8 pt-6 sm:px-6 sm:pt-8 xl:grid xl:max-w-6xl xl:grid-cols-[minmax(0,1fr)_var(--agent-sidebar-width)] xl:gap-0 xl:px-8 xl:pt-10 ${
        resizing ? "xl:select-none xl:cursor-col-resize" : ""
      }`}
      style={
        {
          ["--agent-sidebar-width" as string]: `${openSidebarWidth}px`,
        } as CSSProperties
      }
    >
    <article className="min-w-0 xl:pr-8">
      <nav aria-label="Breadcrumb" className="mb-2 text-xs text-muted">
        <Link
          to="/app"
          search={{ space: post.space }}
          className="inline-flex min-h-11 items-center hover:text-fg"
        >
          {post.space}
        </Link>
        {post.pinned ? <span className="ml-3 text-accent-soft">Pinned</span> : null}
      </nav>

      <header className="group/post">
      {editing ? (
        <PostEditForm post={post} onDone={() => setEditing(false)} />
      ) : (
        <h1 className="text-xl font-semibold leading-tight tracking-tight text-fg">
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
      </header>

      {!editing ? (
        <div className="mt-7 max-w-[65ch]">
          <RichText text={post.body} className="prose-post text-[15px] text-fg/80" />
          <RichEmbedList text={post.body} />
          <AttachmentGallery attachments={attachments.filter((attachment) => !attachment.replyId)} />
        </div>
      ) : null}

      <div className="mt-8 border-t border-border pt-5 xl:hidden">{agentPanels}</div>

      <section aria-labelledby="replies-heading" className="mt-10">
        <h2 id="replies-heading" className="mb-2 text-sm font-semibold text-fg">
          {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}
        </h2>
        {repliesResult.status === "LoadingFirstPage" ? (
          showSkeleton ? (
            <LoadingState label="Loading replies" preset="feed" count={3} />
          ) : null
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

    <aside
      aria-label="Agent panels"
      className="relative hidden min-w-0 xl:block"
    >
      {sidebarOpen ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize agent sidebar"
          aria-valuemin={AGENT_SIDEBAR_MIN}
          aria-valuemax={AGENT_SIDEBAR_MAX}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const delta = event.key === "ArrowLeft" ? 16 : -16;
            const next = clampSidebarWidth(sidebarWidth + delta);
            setSidebarWidth(next);
            window.localStorage.setItem(AGENT_SIDEBAR_WIDTH_KEY, String(next));
          }}
          className={`absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none ${
            resizing ? "bg-accent/30" : "hover:bg-accent/20"
          }`}
        />
      ) : null}
      <div className="h-full border-l border-border pl-6">
        <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto overflow-x-hidden">
          {sidebarOpen ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="shrink-0 text-body font-semibold text-muted">agents</span>
                <Button
                  variant="quiet"
                  size="sm"
                  className="min-h-8 shrink-0 text-xs"
                  onClick={() => setSidebarOpen(false)}
                  aria-expanded={true}
                >
                  hide
                </Button>
              </div>
              {agentPanels}
            </>
          ) : (
            <Button
              variant="quiet"
              size="sm"
              className="w-full text-body"
              onClick={() => setSidebarOpen(true)}
              aria-expanded={false}
            >
              agents
            </Button>
          )}
        </div>
      </div>
    </aside>
    </div>
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
