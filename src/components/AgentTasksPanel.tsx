import { useMemo, useState } from "react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useAgentTasks } from "../lib/agentTasks";
import { timeAgo } from "../lib/format";
import { useSession } from "../lib/session";
import { usePost, useReplies } from "../lib/store";
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
  const [expanded, setExpanded] = useState(tasks.length > 0);
  const [previousTaskCount, setPreviousTaskCount] = useState(tasks.length);

  if (tasks.length !== previousTaskCount) {
    setPreviousTaskCount(tasks.length);
    if (tasks.length > 0) setExpanded(true);
  }

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
    <section className="border-y border-border py-1">
      <details
        open={expanded}
      >
        <summary
          onClick={(event) => {
            event.preventDefault();
            setExpanded((value) => !value);
          }}
          className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 py-2 text-body text-fg transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft [&::-webkit-details-marker]:hidden"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-sm bg-accent/15 px-1.5 py-px text-body leading-tight lowercase text-accent-soft">
              agents
            </span>
            <span className="shrink-0 whitespace-nowrap text-body lowercase text-accent-soft">
              ask an agent
            </span>
            <span className="min-w-0 truncate text-body font-normal text-muted">
              {tasks.length === 0
                ? "investigate this post"
                : `${tasks.length} ${tasks.length === 1 ? "investigation" : "investigations"}`}
            </span>
          </span>
          <span className="shrink-0 text-body text-muted">{expanded ? "hide" : "open"}</span>
        </summary>

        <div className="ui-reveal px-2 pb-3 pt-2">
          <div className="rounded-lg border border-border bg-surface p-3 sm:p-4">
            <div className="grid gap-3">
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
              <FormField label="Task">
                <textarea
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    setError(null);
                  }}
                  rows={4}
                  placeholder="Example: Check the release risks and report back."
                  className="ui-field min-h-28 resize-none"
                />
              </FormField>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-body text-muted">
                Ask for a focused investigation of this thread.
              </p>
              <Button
                onClick={() => void send()}
                disabled={!selectedAgent || !post || !prompt.trim()}
                loading={busy}
                loadingLabel="sending…"
              >
                send
              </Button>
            </div>
            {error ? <p role="alert" className="ui-error mt-3">{error}</p> : null}
          </div>

          {tasks.length > 0 ? (
            <div className="mt-4 divide-y divide-border/60 border-y border-border/60" aria-live="polite">
              {tasks.map((task) => {
                const agent = users.find((user) => user._id === task.agentId) ?? null;
                return (
                  <article key={task._id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar user={agent} size={28} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-body text-fg">
                            <span>{agent?.name ?? "Agent"}</span>
                            {agent?.isAgent ? <AgentTag /> : null}
                          </div>
                          <p className="text-body text-muted">{timeAgo(task.createdAt)}</p>
                        </div>
                      </div>
                      <StatusChip status={task.status} />
                    </div>
                    <p className="mt-2 text-body text-muted">{task.prompt}</p>
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
          ) : null}
        </div>
      </details>
    </section>
  );
}
