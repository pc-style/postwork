import { useMemo, useState } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useAgentTasks } from "../lib/agentTasks";
import { timeAgo } from "../lib/format";
import { useSession } from "../lib/session";
import { usePost, useReplies } from "../lib/store";
import { AccentPanel } from "./AccentPanel";
import { AgentTag } from "./AgentTag";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { FormField } from "./FormField";
import { Markdown } from "./Markdown";
import { StatusChip } from "./StatusChip";

function buildContextText({
  post,
  replies,
  users,
}: {
  post: NonNullable<ReturnType<typeof usePost>>;
  replies: ReturnType<typeof useReplies>;
  users: Doc<"users">[];
}) {
  const userById = new Map(users.map((user) => [user._id, user.name]));
  const lines = replies.replies.map((reply) => {
    const authorName = reply.author?.name ?? userById.get(reply.authorId) ?? "Unknown";
    return `- ${authorName}: ${reply.body}`;
  });
  return `POST: ${post.title}\n${post.body}\n\nREPLIES:\n${lines.join("\n")}`;
}

export function AgentTasksPanel({ postId }: { postId: Id<"posts"> }) {
  const { users } = useSession();
  const { tasksForPost, dispatch } = useAgentTasks();
  const post = usePost(postId);
  const replies = useReplies(postId);
  const tasks = tasksForPost(postId);
  const agents = users.filter((user) => user.isAgent);
  const [agentId, setAgentId] = useState<Id<"users"> | "">(agents[0]?._id ?? "");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAgent = agents.find((agent) => agent._id === agentId) ?? agents[0];
  const contextText = useMemo(
    () => (post ? buildContextText({ post, replies, users }) : ""),
    [post, replies, users],
  );

  const send = async () => {
    if (!selectedAgent || !post || !prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await dispatch({
        postId,
        agentId: selectedAgent._id,
        agentName: selectedAgent.name,
        prompt: prompt.trim(),
        contextText,
      });
      setPrompt("");
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
    <AccentPanel chipLabel="agents" title="Agent tasks">
      <div className="grid gap-3 md:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.5fr)_auto] md:items-end">
        <FormField label="Agent">
          <select
            value={selectedAgent?._id ?? ""}
            onChange={(event) => setAgentId(event.target.value as Id<"users">)}
            className="ui-field"
          >
            {agents.map((agent) => (
              <option key={agent._id} value={agent._id}>
                {agent.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Task" help="Ask for a focused investigation of this thread.">
          <textarea
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              setError(null);
            }}
            rows={2}
            placeholder="Example: Check the release risks and report back."
            className="ui-field min-h-20 resize-y"
          />
        </FormField>
        <Button
          onClick={() => void send()}
          disabled={!selectedAgent || !post || !prompt.trim()}
          loading={busy}
          loadingLabel="sending…"
          className="w-full md:w-auto"
        >
          send
        </Button>
      </div>
      {error ? <p role="alert" className="ui-error mt-3">{error}</p> : null}

      {tasks.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No agent tasks yet. Send one to investigate this thread.
        </p>
      ) : (
        <div className="mt-4 space-y-3" aria-live="polite">
          {tasks.map((task) => {
            const agent = users.find((user) => user._id === task.agentId) ?? null;
            return (
              <article key={task._id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar user={agent} size={28} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm text-fg">
                        <span>{agent?.name ?? "Agent"}</span>
                        {agent?.isAgent ? <AgentTag /> : null}
                      </div>
                      <p className="text-label text-muted">{timeAgo(task.createdAt)}</p>
                    </div>
                  </div>
                  <StatusChip status={task.status} />
                </div>
                <p className="mt-2 text-xs text-muted">{task.prompt}</p>
                {task.status === "done" && task.result ? (
                  <div className="mt-3 text-fg"><Markdown text={task.result} /></div>
                ) : null}
                {task.status === "failed" && task.error ? (
                  <p role="alert" className="ui-error mt-2">{task.error}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </AccentPanel>
  );
}
