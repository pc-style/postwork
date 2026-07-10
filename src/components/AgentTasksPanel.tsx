import { useEffect, useMemo, useState } from "react";
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
  const [expanded, setExpanded] = useState(false);

  const selectedAgent = agents.find((agent) => agent._id === agentId) ?? agents[0];
  const contextText = useMemo(
    () => (post ? buildContextText({ post, replies, users }) : ""),
    [post, replies, users],
  );

  useEffect(() => {
    if (tasks.length > 0) setExpanded(true);
  }, [tasks.length]);

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
          className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-fg transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft [&::-webkit-details-marker]:hidden"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-label font-semibold text-accent-soft">
              agents
            </span>
            <span className="font-medium">ask an agent</span>
            <span className="hidden truncate text-xs font-normal text-muted sm:inline">
              {tasks.length === 0
                ? "Investigate this post without starting a side conversation."
                : `${tasks.length} ${tasks.length === 1 ? "investigation" : "investigations"}`}
            </span>
          </span>
          <span className="shrink-0 text-xs text-muted">{expanded ? "hide" : "open"}</span>
        </summary>

        <div className="px-2 pb-3 pt-2">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(10rem,0.55fr)_minmax(0,1fr)]">
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
                  rows={2}
                  placeholder="Example: Check the release risks and report back."
                  className="ui-field min-h-20 resize-y"
                />
              </FormField>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs leading-5 text-muted">
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
          ) : null}
        </div>
      </details>
    </section>
  );
}
