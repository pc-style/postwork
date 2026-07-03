import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar } from "../components/Avatar";
import { Markdown } from "../components/Markdown";
import { UserRoleTag } from "../components/UserRoleTag";
import { timeAgo } from "../lib/format";
import { signIn } from "../shoo";

type Thread = FunctionReturnType<typeof api.discussions.getThread>;
type Reply = Thread["replies"][number];

type ReplyNode = Reply & { children: ReplyNode[] };

function buildTree(replies: Reply[]): ReplyNode[] {
  const byId = new Map<string, ReplyNode>();
  for (const r of replies) byId.set(r._id, { ...r, children: [] });

  const roots: ReplyNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

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
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs text-muted transition hover:text-fg"
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
            <p className="text-xs text-muted">loading…</p>
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
  const tree = useMemo(() => buildTree(thread.replies), [thread.replies]);

  const post = async (body: string, parentId?: Id<"replies">) => {
    if (isLoading) return false;
    if (!isAuthenticated) {
      void signIn();
      return false;
    }
    try {
      await addMessage({ slug, title, body, parentId });
      return true;
    } catch (err) {
      if (isUnauthenticated(err)) {
        void signIn();
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
          no replies yet — start the conversation about this experiment.
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
        placeholder="add to the discussion…"
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
        <button
          onClick={() => setReplyingTo(isReplying ? null : node._id)}
          className="mt-1.5 text-label text-muted transition hover:text-accent-soft"
        >
          {isReplying ? "cancel" : "reply"}
        </button>
      </div>

      {isReplying && (
        <div className="mt-2">
          <Composer
            placeholder={`reply to ${node.author?.name ?? "member"}…`}
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
      <button
        onClick={() => void signIn()}
        className="w-full rounded-md border border-dashed border-accent/40 bg-bg px-3 py-2 text-xs text-accent-soft transition hover:border-accent/60"
      >
        sign in to discuss
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <textarea
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        rows={2}
        className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 font-sans text-sm text-fg placeholder:text-muted focus:border-accent/50 focus:outline-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-label text-muted">
          ⌘/ctrl + enter to post
        </span>
        <button
          onClick={() => void submit()}
          disabled={!body.trim() || submitting}
          className="rounded-md border border-accent/50 bg-accent/15 px-3 py-1 text-xs text-accent-soft transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "posting…" : "post"}
        </button>
      </div>
    </div>
  );
}
