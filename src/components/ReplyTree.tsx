import {
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { buildReplyTree, type ReplyTreeNode } from "../lib/replyTree";
import { timeAgo } from "../lib/format";
import { isLocalId, useStore } from "../lib/store";
import { useSession } from "../lib/session";
import type { AttachmentWithUrl, EnrichedReply } from "../lib/types";
import { AgentTag } from "./AgentTag";
import { AnchoredConfirmation } from "./AnchoredConfirmation";
import { AttachmentGallery } from "./AttachmentGallery";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Composer } from "./Composer";
import { FormField } from "./FormField";
import { RichText } from "./RichText";
import { RichEmbedList } from "./RichEmbedList";
import { SendAgentButton } from "./SendAgentButton";
import { UserRoleTag } from "./UserRoleTag";

type Node = ReplyTreeNode<EnrichedReply>;

function hasUnreadDescendant(node: Node): boolean {
  return node.children.some(
    (child) => child.unread || hasUnreadDescendant(child),
  );
}

function subthreadText(node: Node) {
  const lines: string[] = [];
  const walk = (item: Node, depth: number) => {
    const author = item.author?.name ?? "Unknown";
    lines.push(`${"  ".repeat(depth)}- ${author}: ${item.body}`);
    item.children.forEach((child) => walk(child, depth + 1));
  };
  walk(node, 0);
  return lines.join("\n");
}

function ReplyNode({
  node,
  postId,
  depth,
  attachments,
  fallbackFocusRef,
}: {
  node: Node;
  postId: Id<"posts">;
  depth: number;
  attachments: AttachmentWithUrl[];
  fallbackFocusRef: RefObject<HTMLDivElement | null>;
}) {
  const store = useStore();
  const { currentUserId, currentUser } = useSession();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(node.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const childRepliesId = useId();
  const subtreeHasUnread = hasUnreadDescendant(node);
  const [childrenExpanded, setChildrenExpanded] = useState(subtreeHasUnread);
  const previousSubtreeHasUnread = useRef(subtreeHasUnread);
  const replyAttachments = attachments.filter(
    (attachment) => attachment.replyId === node._id,
  );

  const local = isLocalId(node._id);
  const isAuthor = currentUserId === node.authorId;
  const isAdmin = currentUser?.role === "admin";
  const canEdit = isAuthor && (store.mode === "product" || local);
  const canDelete =
    (store.mode === "product" || local) &&
    (isAuthor || (isAdmin && store.mode === "product"));

  const saveEdit = async () => {
    if (!editBody.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await store.editReply({ replyId: node._id, body: editBody.trim() });
      setEditing(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't save the reply. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const indentation =
    depth === 0
      ? ""
      : depth < 4
        ? "ml-2 border-l border-border pl-2 sm:ml-4 sm:pl-4"
        : "border-l border-border pl-2 sm:pl-4";

  useEffect(() => {
    if (subtreeHasUnread && !previousSubtreeHasUnread.current) {
      setChildrenExpanded(true);
    }
    previousSubtreeHasUnread.current = subtreeHasUnread;
  }, [subtreeHasUnread]);

  const childReplyLabel =
    node.children.length === 1 ? "1 reply" : `${node.children.length} replies`;

  return (
    <div className={indentation}>
      <article className="py-3">
        <div className="flex items-start gap-2.5">
          <Avatar user={node.author} size={30} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm font-medium text-fg">
                {node.author?.name ?? "Unknown"}
              </span>
              {node.author?.isAgent ? <AgentTag /> : null}
              <UserRoleTag role={node.author?.role} />
              <span className="text-label text-muted">{timeAgo(node.createdAt)}</span>
              {node.editedAt ? <span className="text-label text-muted">edited</span> : null}
            </div>

            <div className="mt-1">
              {editing ? (
                <div className="rounded-md border border-border bg-surface p-3">
                  <FormField label="Reply" error={error} required>
                    <textarea
                      value={editBody}
                      onChange={(event) => {
                        setEditBody(event.target.value);
                        setError(null);
                      }}
                      autoFocus
                      rows={3}
                      className="ui-field resize-y"
                    />
                  </FormField>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditing(false);
                        setError(null);
                      }}
                      disabled={busy}
                    >
                      cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void saveEdit()}
                      disabled={!editBody.trim()}
                      loading={busy}
                      loadingLabel="saving…"
                    >
                      save
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <RichText text={node.body} className="prose-post text-sm text-fg" />
                  <RichEmbedList text={node.body} />
                  <AttachmentGallery attachments={replyAttachments} />
                </>
              )}
            </div>

            {!editing ? (
              <div className="mt-1 flex min-h-11 flex-wrap items-center gap-1 sm:min-h-9">
                <Button
                  variant="quiet"
                  size="sm"
                  className="min-h-11 px-1.5 text-xs sm:min-h-9"
                  onClick={() => setReplying((value) => !value)}
                  aria-expanded={replying}
                >
                  {replying ? "cancel" : "reply"}
                </Button>
                {node.children.length > 0 ? (
                  <Button
                    variant="quiet"
                    size="sm"
                    className="min-h-11 px-1.5 text-xs sm:min-h-9"
                    onClick={() => setChildrenExpanded((value) => !value)}
                    aria-controls={childRepliesId}
                    aria-expanded={childrenExpanded}
                  >
                    {childrenExpanded
                      ? `hide ${childReplyLabel}`
                      : `show ${childReplyLabel}`}
                  </Button>
                ) : null}
                {canEdit ? (
                  <Button
                    variant="quiet"
                    size="sm"
                    className="min-h-11 px-1.5 text-xs sm:min-h-9"
                    onClick={() => {
                      setEditBody(node.body);
                      setError(null);
                      setEditing(true);
                    }}
                  >
                    edit
                  </Button>
                ) : null}
                {canDelete ? (
                  <AnchoredConfirmation
                    triggerLabel="delete"
                    title="Delete reply?"
                    description="This can't be undone."
                    confirmLabel="delete reply"
                    fallbackFocusRef={fallbackFocusRef}
                    onConfirm={() => store.deleteReply({ replyId: node._id })}
                  />
                ) : null}
                <SendAgentButton
                  postId={postId}
                  replyId={node._id}
                  contextText={subthreadText(node)}
                />
              </div>
            ) : null}
          </div>
        </div>

        {replying ? (
          <div className="mt-2 pl-8 sm:pl-10">
            <Composer
              postId={postId}
              parentId={node._id}
              compact
              autoFocus
              placeholder={`Reply to ${node.author?.name ?? "this reply"}.`}
              onDone={() => setReplying(false)}
            />
          </div>
        ) : null}
      </article>

      {node.children.length > 0 ? (
        <div
          id={childRepliesId}
          role="group"
          aria-label={`Replies to ${node.author?.name ?? "this reply"}`}
          hidden={!childrenExpanded}
        >
          {node.children.map((child) => (
            <ReplyNode
              key={child._id}
              node={child}
              postId={postId}
              depth={depth + 1}
              attachments={attachments}
              fallbackFocusRef={fallbackFocusRef}
            />
          ))}
        </div>
      ) : null}
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
  const focusFallbackRef = useRef<HTMLDivElement>(null);

  if (tree.length === 0) {
    return <p className="py-4 text-sm text-muted">No replies yet. Start the thread.</p>;
  }

  return (
    <div
      ref={focusFallbackRef}
      tabIndex={-1}
      aria-label="Replies"
      className="divide-y divide-border/60 focus:outline-none"
    >
      {tree.map((node) => (
        <ReplyNode
          key={node._id}
          node={node}
          postId={postId}
          depth={0}
          attachments={attachments}
          fallbackFocusRef={focusFallbackRef}
        />
      ))}
    </div>
  );
}
