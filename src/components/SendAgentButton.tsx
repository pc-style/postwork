import { useEffect, useRef, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { AGENT_HANDLES, resolveAgentUser } from "../lib/agentMentions";
import { useAgentTasks } from "../lib/agentTasks";
import { usePopoverDismiss } from "../lib/usePopoverDismiss";
import { useSession } from "../lib/session";
import { Button } from "./Button";

export function SendAgentButton({
  postId,
  replyId,
  contextText,
}: {
  postId: Id<"posts">;
  replyId: Id<"replies">;
  contextText: string;
}) {
  const { users } = useSession();
  const { dispatch } = useAgentTasks();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  usePopoverDismiss(ref, () => setOpen(false));

  useEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  const send = async (handle: string) => {
    const agent = resolveAgentUser(handle, users);
    if (!agent || busy) return;
    setBusy(true);
    setError(null);
    try {
      await dispatch({
        postId,
        sourceReplyId: replyId,
        agentId: agent._id,
        agentName: agent.name,
        prompt: "Investigate this reply thread and report your findings.",
        contextText,
      });
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't send the agent task. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="relative inline-flex" ref={ref}>
      <Button
        variant="quiet"
        size="sm"
        className="min-h-9 px-1.5 text-xs"
        onClick={() => {
          setError(null);
          setOpen((value) => !value);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ask agent
      </Button>
      {open ? (
        <span
          role="menu"
          aria-label="Choose an agent"
          className="absolute right-0 top-full z-30 mt-1 w-44 rounded-md border border-border bg-surface p-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
        >
          {Object.keys(AGENT_HANDLES).map((handle, index) => (
            <button
              ref={index === 0 ? firstItemRef : undefined}
              key={handle}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => void send(handle)}
              className="flex min-h-11 w-full items-center rounded-sm px-3 py-2 text-left text-xs text-muted transition-colors hover:bg-accent/10 hover:text-fg disabled:text-muted/70"
            >
              {AGENT_HANDLES[handle]}
            </button>
          ))}
          {error ? <span role="alert" className="ui-error mt-1 block">{error}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
