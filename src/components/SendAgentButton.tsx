import { useRef, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { AGENT_HANDLES, resolveAgentUser } from "../lib/agentMentions";
import { useAgentTasks } from "../lib/agentTasks";
import { useSession } from "../lib/session";
import { usePopoverDismiss } from "../lib/usePopoverDismiss";

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
  const ref = useRef<HTMLSpanElement>(null);

  usePopoverDismiss(ref, () => setOpen(false));

  const send = async (handle: string) => {
    const agent = resolveAgentUser(handle, users);
    if (!agent) return;
    setOpen(false);
    await dispatch({
      postId,
      sourceReplyId: replyId,
      agentId: agent._id,
      agentName: agent.name,
      prompt: "Investigate this subthread and report findings.",
      contextText,
    });
  };

  return (
    <span className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-xs text-muted transition hover:text-accent-soft"
      >
        send agent →
      </button>
      {open && (
        <span className="absolute left-0 top-full z-10 mt-1 w-36 rounded-md border border-border bg-surface p-1 shadow-xl">
          {Object.keys(AGENT_HANDLES).map((handle) => (
            <button
              key={handle}
              onClick={() => void send(handle)}
              className="block w-full rounded-sm px-2 py-1.5 text-left text-xs text-muted transition hover:bg-accent/10 hover:text-accent-soft"
            >
              {AGENT_HANDLES[handle]}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
