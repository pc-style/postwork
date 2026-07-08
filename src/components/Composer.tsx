import { useRef, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";
import { useAgentTasks } from "../lib/agentTasks";
import {
  parseAgentMentions,
  resolveAgentUser,
  AGENT_HANDLES,
} from "../lib/agentMentions";
import { insertCodeFence } from "../lib/codeFence";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { ComposerShell } from "./ComposerShell";
import {
  useAttachmentPicker,
  AttachmentButton,
  AttachmentThumbnails,
} from "./AttachmentPicker";

export function Composer({
  postId,
  parentId,
  placeholder = "write a reply…",
  autoFocus = false,
  compact = false,
  onDone,
}: {
  postId: Id<"posts">;
  parentId?: Id<"replies">;
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
  onDone?: () => void;
}) {
  const { currentUser, currentUserId, users } = useSession();
  const store = useStore();
  const { dispatch } = useAgentTasks();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    pending,
    addFiles,
    removeAttachment,
    getReadyAttachments,
    clear: clearAttachments,
    canUpload,
    hasUploading,
    hasAttachmentErrors,
  } = useAttachmentPicker();

  // Live preview of which agents this message will summon.
  const mentioned = parseAgentMentions(body);

  const onCodeFence = () => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = insertCodeFence(body, start, end);
    setBody(next.value);
    // Restore focus + selection after React re-renders.
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  };

  const submit = async () => {
    if (!body.trim() || !currentUserId) return;
    setBusy(true);
    try {
      const text = body.trim();
      const attachments = getReadyAttachments();
      const replyId = await store.createReply({
        postId,
        parentId,
        body: text,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setBody("");
      clearAttachments();
      onDone?.();

      // @agent invocation: any @cursor/@codex/@claude mention dispatches an
      // agent task seeded with this message as the prompt + context.
      for (const handle of parseAgentMentions(text)) {
        const agent = resolveAgentUser(handle, users);
        if (!agent) continue;
        void dispatch({
          postId,
          sourceReplyId: replyId,
          agentId: agent._id,
          agentName: agent.name,
          prompt: text,
          contextText: text,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-2.5">
      {!compact && <Avatar user={currentUser ?? null} size={32} />}
      <div className="flex-1">
        <ComposerShell
          body={body}
          setBody={setBody}
          textareaRef={textareaRef}
          autoFocus={autoFocus}
          placeholder={placeholder}
          rows={compact ? 2 : 3}
          textareaClassName="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent/50"
          onPaste={(e) => {
            if (!canUpload) return;
            const files = Array.from(e.clipboardData.files).filter((f) =>
              f.type.startsWith("image/"),
            );
            if (files.length > 0) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
          beforeBody={
            pending.length > 0 ? (
              <div className="mb-2">
                <AttachmentThumbnails
                  pending={pending}
                  onRemove={removeAttachment}
                />
              </div>
            ) : undefined
          }
          hint={
            <>
              <button
                type="button"
                onClick={onCodeFence}
                title="insert code block"
                className="rounded-md border border-border px-2 py-1 text-label text-muted transition hover:text-fg"
              >
                {"</> code"}
              </button>
              {canUpload && <AttachmentButton onFiles={addFiles} />}
              {hasUploading ? (
                <span className="text-label text-accent-soft">uploading…</span>
              ) : hasAttachmentErrors ? (
                <span className="text-label text-urgent">image failed — remove or retry</span>
              ) : mentioned.length > 0 ? (
                <span className="text-label text-accent-soft">
                  summons {mentioned.map((h) => AGENT_HANDLES[h]).join(", ")}
                </span>
              ) : (
                <span className="hidden text-label text-muted sm:inline">
                  ⌘/Ctrl + Enter · @cursor to summon an agent
                </span>
              )}
            </>
          }
          actions={
            onDone && (
              <Button variant="quiet" onClick={onDone}>
                cancel
              </Button>
            )
          }
          submitLabel="reply"
          submittingLabel="sending…"
          submitting={busy}
          disabled={busy || !body.trim() || hasUploading || hasAttachmentErrors}
          submitButtonClassName="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-fg transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
          onSubmit={() => void submit()}
        />
      </div>
    </div>
  );
}
