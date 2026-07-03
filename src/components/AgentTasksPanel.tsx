import { useMemo, useState } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useAgentTasks } from "../lib/agentTasks";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";
import { timeAgo } from "../lib/format";
import { AgentTag } from "./AgentTag";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Markdown } from "./Markdown";
import { StatusChip } from "./StatusChip";

function buildContextText({
  post,
  replies,
  users,
}: {
  post: NonNullable<ReturnType<ReturnType<typeof useStore>["usePost"]>>;
  replies: ReturnType<ReturnType<typeof useStore>["useReplies"]>;
  users: Doc<"users">[];
}) {
  const userById = new Map(users.map((user) => [user._id, user.name]));
  const lines = replies.map((reply) => {
    const authorName = reply.author?.name ?? userById.get(reply.authorId) ?? "Unknown";
    return `- ${authorName}: ${reply.body}`;
  });
  return `POST: ${post.title}\n${post.body}\n\nREPLIES:\n${lines.join("\n")}`;
}

export function AgentTasksPanel({ postId }: { postId: Id<"posts"> }) {
  const { users } = useSession();
  const store = useStore();
  const { tasksForPost, dispatch } = useAgentTasks();
  const post = store.usePost(postId);
  const replies = store.useReplies(postId);
  const tasks = tasksForPost(postId);
  const agents = users.filter((user) => user.isAgent);
  const [agentId, setAgentId] = useState<Id<"users"> | "">(agents[0]?._id ?? "");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedAgent = agents.find((agent) => agent._id === agentId) ?? agents[0];
  const contextText = useMemo(
    () => (post ? buildContextText({ post, replies, users }) : ""),
    [post, replies, users],
  );

  const send = async () => {
    if (!selectedAgent || !post || !prompt.trim()) return;
    setBusy(true);
    try {
      await dispatch({
        postId,
        agentId: selectedAgent._id,
        agentName: selectedAgent.name,
        prompt: prompt.trim(),
        contextText,
      });
      setPrompt("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-accent/25 bg-accent/[0.06] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-sm bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent-soft">
          agents
        </span>
        <span className="text-xs font-semibold tracking-wide text-accent-soft lowercase">
          investigations
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-[160px_1fr_auto]">
        <select
          value={selectedAgent?._id ?? ""}
          onChange={(e) => setAgentId(e.target.value as Id<"users">)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-2 text-sm text-fg outline-none focus:border-accent/50"
        >
          {agents.map((agent) => (
            <option key={agent._id} value={agent._id}>
              {agent.name}
            </option>
          ))}
        </select>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="ask an agent to investigate…"
          className="resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-fg outline-none focus:border-accent/50"
        />
        <Button
          onClick={send}
          disabled={busy || !selectedAgent || !post || !prompt.trim()}
        >
          {busy ? "sending…" : "send agent"}
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          no agent investigations yet. dispatch one to explore this thread.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {tasks.map((task) => {
            const agent = users.find((user) => user._id === task.agentId) ?? null;
            return (
              <article key={task._id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar user={agent} size={28} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm text-fg">
                        <span>{agent?.name ?? "agent"}</span>
                        {agent?.isAgent && <AgentTag />}
                      </div>
                      <p className="text-[11px] text-[var(--color-muted)]">
                        {timeAgo(task.createdAt)}
                      </p>
                    </div>
                  </div>
                  <StatusChip status={task.status} />
                </div>
                <p className="mt-2 text-xs text-[var(--color-muted)]">{task.prompt}</p>
                {task.status === "done" && task.result && (
                  <div className="mt-3 text-fg">
                    <Markdown text={task.result} />
                  </div>
                )}
                {task.status === "failed" && task.error && (
                  <p className="mt-2 rounded-md bg-[var(--color-urgent)]/10 px-2 py-1.5 text-xs text-[var(--color-urgent)]">
                    {task.error}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
