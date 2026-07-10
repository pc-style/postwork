import { useRef, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import {
  AGENT_HANDLES,
  parseAgentMentions,
  resolveAgentUser,
} from "../lib/agentMentions";
import { useAgentTasks } from "../lib/agentTasks";
import { insertCodeFence } from "../lib/codeFence";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";
import {
  AttachmentButton,
  AttachmentThumbnails,
  useAttachmentPicker,
} from "./AttachmentPicker";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { ComposerShell } from "./ComposerShell";

export function Composer({
  postId,
  parentId,
  placeholder = "Write a reply.",
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
  const [error, setError] = useState<string | null>(null);
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

  const mentioned = parseAgentMentions(body);

  const onCodeFence = () => {
    const element = textareaRef.current;
    const start = element?.selectionStart ?? body.length;
    const end = element?.selectionEnd ?? body.length;
    const next = insertCodeFence(body, start, end);
    setBody(next.value);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(next.selectionStart, next.selectionEnd);
    });
  };

  const submit = async () => {
    if (!body.trim() || !currentUserId || busy) return;
    setBusy(true);
    setError(null);
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
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't add the reply. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 gap-2.5">
      {!compact ? <Avatar user={currentUser ?? null} size={32} /> : null}
      <div className="min-w-0 flex-1">
        <ComposerShell
          body={body}
          setBody={(value) => {
            setBody(value);
            setError(null);
          }}
          textareaRef={textareaRef}
          autoFocus={autoFocus}
          bodyLabel="Reply"
          srOnlyBodyLabel
          placeholder={placeholder}
          rows={compact ? 2 : 3}
          textareaClassName="ui-field min-h-24 resize-y"
          onPaste={(event) => {
            if (!canUpload) return;
            const files = Array.from(event.clipboardData.files).filter((file) =>
              file.type.startsWith("image/"),
            );
            if (files.length > 0) {
              event.preventDefault();
              void addFiles(files);
            }
          }}
          beforeBody={
            pending.length > 0 ? (
              <div className="mb-2">
                <AttachmentThumbnails pending={pending} onRemove={removeAttachment} />
              </div>
            ) : undefined
          }
          hint={
            <>
              <Button variant="secondary" size="sm" onClick={onCodeFence}>
                add code block
              </Button>
              {canUpload ? <AttachmentButton onFiles={addFiles} /> : null}
              <span aria-live="polite">
                {hasUploading
                  ? "Uploading images…"
                  : hasAttachmentErrors
                    ? "An image failed to upload. Remove it and try again."
                    : mentioned.length > 0
                      ? `Asking ${mentioned.map((handle) => AGENT_HANDLES[handle]).join(", ")}`
                      : "Cmd or Ctrl + Enter to reply. Mention @cursor to ask an agent."}
              </span>
            </>
          }
          actions={
            onDone ? (
              <Button variant="secondary" onClick={onDone} disabled={busy}>
                cancel
              </Button>
            ) : undefined
          }
          submitLabel="reply"
          submittingLabel="sending…"
          submitting={busy}
          disabled={busy || !body.trim() || hasUploading || hasAttachmentErrors}
          onSubmit={() => void submit()}
        />
        {error ? <p role="alert" className="ui-error mt-2">{error}</p> : null}
      </div>
    </div>
  );
}
