import { useEffect, useRef, useState } from "react";
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

  // Focus via effect rather than the `autoFocus` prop so cold-load restores
  // (e.g. a flash experiment rehydrated from sessionStorage that mounts the
  // composer after the initial render) still land the cursor in the field.
  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

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
      const replyId = await store.createReply({
        postId,
        parentId,
        authorId: currentUserId,
        body: text,
      });
      setBody("");
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
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
          placeholder={placeholder}
          rows={compact ? 2 : 3}
          className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent/50"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCodeFence}
              title="insert code block"
              className="rounded-md border border-border px-2 py-1 text-[11px] text-muted transition hover:text-fg"
            >
              {"</> code"}
            </button>
            {mentioned.length > 0 ? (
              <span className="text-[11px] text-accent-soft">
                summons {mentioned.map((h) => AGENT_HANDLES[h]).join(", ")}
              </span>
            ) : (
              <span className="hidden text-[11px] text-muted sm:inline">
                ⌘/Ctrl + Enter · @cursor to summon an agent
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {onDone && (
              <Button variant="quiet" onClick={onDone}>
                cancel
              </Button>
            )}
            <Button onClick={submit} disabled={busy || !body.trim()}>
              {busy ? "sending…" : "reply"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
