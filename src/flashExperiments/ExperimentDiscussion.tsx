import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar } from "../components/Avatar";
import { ComposerShell } from "../components/ComposerShell";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { Markdown } from "../components/Markdown";
import { UserRoleTag } from "../components/UserRoleTag";
import { timeAgo } from "../lib/format";
import { buildReplyTree, type ReplyTreeNode } from "../lib/replyTree";

type Thread = FunctionReturnType<typeof api.discussions.getThread>;
type Reply = Thread["replies"][number];

type ReplyNode = ReplyTreeNode<Reply>;

function isUnauthenticated(err: unknown): boolean {
  return (
    err instanceof ConvexError &&
    typeof err.data === "object" &&
    err.data !== null &&
    (err.data as { code?: string }).code === "UNAUTHENTICATED"
  );
}

export function ExperimentDiscussion({
  slug,
  title,
  replyCount,
  isAuthenticated,
  isLoading,
}: {
  slug: string;
  title: string;
  replyCount: number;
  isAuthenticated: boolean;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const thread = useQuery(
    api.discussions.getThread,
    open ? { slug } : "skip",
  );

  return (
    <div className="border-t border-dashed border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between px-4 py-2.5 text-xs text-muted transition-colors hover:text-fg"
      >
        <span>
          discussion
          {replyCount > 0 && (
            <span className="ml-1.5 tabular-nums text-accent-soft">
              {replyCount}
            </span>
          )}
        </span>
        <span className="text-accent-soft">{open ? "hide −" : "open +"}</span>
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          {thread === undefined ? (
            <Skeleton label="Loading discussion" preset="inline" count={2} />
          ) : (
            <Thread
              slug={slug}
              title={title}
              thread={thread}
              isAuthenticated={isAuthenticated}
              isLoading={isLoading}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Thread({
  slug,
  title,
  thread,
  isAuthenticated,
  isLoading,
}: {
  slug: string;
  title: string;
  thread: Thread;
  isAuthenticated: boolean;
  isLoading: boolean;
}) {
  const addMessage = useMutation(api.discussions.addMessage);
  const [replyingTo, setReplyingTo] = useState<Id<"replies"> | null>(null);
  const tree = useMemo(() => buildReplyTree(thread.replies), [thread.replies]);

  const post = async (body: string, parentId?: Id<"replies">) => {
    if (isLoading) return false;
    if (!isAuthenticated) {
      return false;
    }
    try {
      await addMessage({ slug, title, body, parentId });
      return true;
    } catch (err) {
      if (isUnauthenticated(err)) {
        return false;
      }
      console.error(err);
      return false;
    }
  };

  return (
    <>
      {tree.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-bg px-3 py-3 text-xs text-muted">
          No replies yet. Start the discussion about this experiment.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {tree.map((node) => (
            <ReplyItem
              key={node._id}
              node={node}
              depth={0}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              onReply={post}
              isAuthenticated={isAuthenticated}
              isLoading={isLoading}
            />
          ))}
        </ul>
      )}

      <Composer
        placeholder="Add to the discussion."
        isAuthenticated={isAuthenticated}
        isLoading={isLoading}
        onSubmit={(body) => post(body)}
      />
    </>
  );
}

function ReplyItem({
  node,
  depth,
  replyingTo,
  setReplyingTo,
  onReply,
  isAuthenticated,
  isLoading,
}: {
  node: ReplyNode;
  depth: number;
  replyingTo: Id<"replies"> | null;
  setReplyingTo: (id: Id<"replies"> | null) => void;
  onReply: (body: string, parentId?: Id<"replies">) => Promise<boolean>;
  isAuthenticated: boolean;
  isLoading: boolean;
}) {
  const isReplying = replyingTo === node._id;
  return (
    <li
      className={
        depth > 0
          ? "border-l border-dashed border-border pl-3"
          : ""
      }
    >
      <div className="rounded-md border border-border bg-bg p-2.5">
        <div className="flex items-center gap-2">
          <Avatar user={node.author} size={20} />
          <span className="text-xs text-fg">
            {node.author?.name ?? "member"}
          </span>
          <UserRoleTag role={node.author?.role} />
          <span className="text-label text-muted">
            {timeAgo(node.createdAt)}
          </span>
        </div>
        <div className="mt-1.5 font-sans text-sm text-fg">
          <Markdown text={node.body} />
        </div>
        <Button
          variant="quiet"
          size="sm"
          className="mt-1.5 min-h-9 px-1.5 text-label"
          onClick={() => setReplyingTo(isReplying ? null : node._id)}
          aria-expanded={isReplying}
        >
          {isReplying ? "cancel" : "reply"}
        </Button>
      </div>

      {isReplying && (
        <div className="mt-2">
          <Composer
            placeholder={`Reply to ${node.author?.name ?? "member"}.`}
            autoFocus
            isAuthenticated={isAuthenticated}
            isLoading={isLoading}
            onSubmit={async (body) => {
              const ok = await onReply(body, node._id);
              if (ok) setReplyingTo(null);
              return ok;
            }}
          />
        </div>
      )}

      {node.children.length > 0 && (
        <ul className="mt-2 space-y-2.5">
          {node.children.map((child) => (
            <ReplyItem
              key={child._id}
              node={child}
              depth={depth + 1}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              onReply={onReply}
              isAuthenticated={isAuthenticated}
              isLoading={isLoading}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function Composer({
  placeholder,
  isAuthenticated,
  isLoading,
  autoFocus,
  onSubmit,
}: {
  placeholder: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<boolean>;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    const ok = await onSubmit(trimmed);
    setSubmitting(false);
    if (ok) setBody("");
  };

  if (!isLoading && !isAuthenticated) {
    return (
      <div className="w-full rounded-md border border-dashed border-border bg-bg px-3 py-2 text-xs text-muted">
        Discussion is read-only in demo mode.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <ComposerShell
        body={body}
        setBody={setBody}
        autoFocus={autoFocus}
        placeholder={placeholder}
        rows={2}
        bodyLabel="Discussion reply"
        srOnlyBodyLabel
        textareaClassName="ui-field min-h-20 resize-none font-sans"
        footerClassName="flex flex-wrap items-center justify-between gap-2"
        hint={<span>Cmd or Ctrl + Enter to post.</span>}
        submitLabel="post"
        submittingLabel="posting…"
        submitting={submitting}
        disabled={!body.trim() || submitting}
        onSubmit={() => void submit()}
      />
    </div>
  );
}
