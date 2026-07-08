import { useRef, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { EnrichedReply, AttachmentWithUrl } from "../lib/types";
import { useSession } from "../lib/session";
import { useStore, isLocalId } from "../lib/store";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { AgentTag } from "./AgentTag";
import { UserRoleTag } from "./UserRoleTag";
import { RichText } from "./RichText";
import { SendAgentButton } from "./SendAgentButton";
import { AttachmentGallery } from "./AttachmentPicker";
import { timeAgo } from "../lib/format";
import { buildReplyTree, type ReplyTreeNode } from "../lib/replyTree";

type Node = ReplyTreeNode<EnrichedReply>;

/** Flatten a reply and its descendants into a transcript an agent can read. */
function subthreadText(node: Node): string {
  const lines: string[] = [];
  const walk = (n: Node, depth: number) => {
    const who = n.author?.name ?? "Unknown";
    lines.push(`${"  ".repeat(depth)}- ${who}: ${n.body}`);
    n.children.forEach((c) => walk(c, depth + 1));
  };
  walk(node, 0);
  return lines.join("\n");
}

function ReplyNode({
  node,
  postId,
  depth,
  attachments,
}: {
  node: Node;
  postId: Id<"posts">;
  depth: number;
  attachments: AttachmentWithUrl[];
}) {
  const store = useStore();
  const { currentUserId, currentUser } = useSession();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(node.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const replyAttachments = attachments.filter(
    (a) => a.replyId === node._id,
  );

  const local = isLocalId(node._id);
  const isAuthor = currentUserId === node.authorId;
  const isAdmin = currentUser?.role === "admin";
  // Demo mode: only local (session-created) replies can be moderated, and only
  // by their author. Product mode: edit is author-only, delete is author/admin.
  const canEdit = isAuthor && (store.mode === "product" || local);
  const canDelete =
    (store.mode === "product" || local) &&
    (isAuthor || (isAdmin && store.mode === "product"));

  const saveEdit = async () => {
    if (!editBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await store.editReply({ replyId: node._id, body: editBody.trim() });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save edit.");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await store.deleteReply({ replyId: node._id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete reply.");
      setBusy(false);
    }
  };

  return (
    <div className={depth > 0 ? "ml-4 border-l border-border pl-4" : ""}>
      <div className="py-2.5">
        <div className="flex items-start gap-2.5">
          <Avatar user={node.author} size={30} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium">
                {node.author?.name ?? "Unknown"}
              </span>
              {node.author?.isAgent && <AgentTag />}
              <UserRoleTag role={node.author?.role} />
              <span className="text-label text-muted">
                {timeAgo(node.createdAt)}
              </span>
              {node.editedAt && (
                <span className="text-label text-faint">edited</span>
              )}
            </div>
            <div className="mt-0.5">
              {editing ? (
                <div className="rounded-md border border-border bg-surface p-2">
                  <textarea
                    ref={editRef}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    autoFocus
                    rows={3}
                    className="w-full resize-y rounded border border-border bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent/50"
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setError(null);
                      }}
                      disabled={busy}
                      className="text-xs text-muted transition hover:text-fg disabled:opacity-40"
                    >
                      cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveEdit()}
                      disabled={busy || !editBody.trim()}
                      className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-fg transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy ? "saving…" : "save"}
                    </button>
                  </div>
                  {error && (
                    <p className="mt-1.5 text-xs text-urgent">{error}</p>
                  )}
                </div>
              ) : (
                <>
                  <RichText text={node.body} className="prose-post text-sm text-fg" />
                  <AttachmentGallery attachments={replyAttachments} />
                </>
              )}
            </div>
            {!editing && (
              <div className="mt-1 flex items-center gap-3">
                <button
                  onClick={() => setReplying((r) => !r)}
                  className="text-xs text-muted transition hover:text-accent-soft"
                >
                  {replying ? "cancel" : "reply"}
                </button>
                {canEdit && (
                  <button
                    onClick={() => {
                      setEditBody(node.body);
                      setError(null);
                      setEditing(true);
                    }}
                    className="text-xs text-muted transition hover:text-fg"
                  >
                    edit
                  </button>
                )}
                {canDelete && !confirmingDelete && (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="text-xs text-muted transition hover:text-urgent"
                  >
                    delete
                  </button>
                )}
                {confirmingDelete && (
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-faint">delete?</span>
                    <button
                      type="button"
                      onClick={() => void confirmDelete()}
                      disabled={busy}
                      className="rounded bg-urgent/15 px-1.5 py-0.5 text-xs text-urgent transition hover:bg-urgent/25 disabled:opacity-40"
                    >
                      {busy ? "deleting…" : "yes"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={busy}
                      className="text-xs text-muted transition hover:text-fg disabled:opacity-40"
                    >
                      no
                    </button>
                  </span>
                )}
                {error && <span className="text-xs text-urgent">{error}</span>}
                <SendAgentButton
                  postId={postId}
                  replyId={node._id}
                  contextText={subthreadText(node)}
                />
              </div>
            )}
          </div>
        </div>

        {replying && (
          <div className="mt-2 ml-10">
            <Composer
              postId={postId}
              parentId={node._id}
              compact
              autoFocus
              placeholder={`reply to ${node.author?.name ?? "this"}…`}
              onDone={() => setReplying(false)}
            />
          </div>
        )}
      </div>

      {node.children.map((child) => (
        <ReplyNode
          key={child._id}
          node={child}
          postId={postId}
          depth={depth + 1}
          attachments={attachments}
        />
      ))}
    </div>
  );
}

export function ReplyTree({
  replies,
  postId,
  attachments = [],
}: {
  replies: EnrichedReply[];
  postId: Id<"posts">;
  attachments?: AttachmentWithUrl[];
}) {
  const tree = buildReplyTree(replies);
  if (tree.length === 0) {
    return (
      <p className="py-4 text-sm text-muted">
        No replies yet. Start the thread.
      </p>
    );
  }
  return (
    <div className="divide-y divide-border/60">
      {tree.map((node) => (
        <ReplyNode
          key={node._id}
          node={node}
          postId={postId}
          depth={0}
          attachments={attachments}
        />
      ))}
    </div>
  );
}
