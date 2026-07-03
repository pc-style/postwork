import { Link } from "@tanstack/react-router";
import type { Doc } from "../../convex/_generated/dataModel";
import { AgentTag } from "../components/AgentTag";
import { Avatar } from "../components/Avatar";
import { useAgentTasks, type AgentTask } from "../lib/agentTasks";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";
import { timeAgo } from "../lib/format";
import { StatusChip } from "../components/StatusChip";
import { AccentPanel } from "../components/AccentPanel";
import { PageHeader } from "../components/PageHeader";

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function AgentCard({
  agent,
  agentTasks,
  isLocalId,
}: {
  agent: Doc<"users">;
  agentTasks: AgentTask[];
  isLocalId: (id: string) => boolean;
}) {
  const recent = agentTasks.slice(0, 5);

  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar user={agent} size={38} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-fg">{agent.name}</h2>
              <AgentTag />
            </div>
            <p className="text-sm text-muted">{agent.title}</p>
          </div>
        </div>
        <div className="rounded-md border border-accent/25 bg-accent/10 px-2 py-1 text-xs text-accent-soft">
          {agentTasks.length} {agentTasks.length === 1 ? "task" : "tasks"}
        </div>
      </div>

      {recent.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          no investigations assigned yet.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {recent.map((task) => (
            <div key={task._id} className="rounded-md border border-border bg-bg p-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <StatusChip status={task.status} />
                <span className="text-label text-muted">
                  {timeAgo(task.createdAt)}
                </span>
                {isLocalId(task.postId) ? (
                  <span className="text-label text-muted">session post</span>
                ) : (
                  <Link
                    to="/posts/$postId"
                    params={{ postId: task.postId }}
                    className="text-label text-accent-soft transition hover:text-fg"
                  >
                    open post
                  </Link>
                )}
              </div>
              <p className="text-sm text-fg">{truncate(task.prompt, 120)}</p>
              {task.status === "done" && task.result && (
                <p className="mt-1.5 text-xs text-muted">
                  {truncate(task.result.replace(/\s+/g, " ").trim(), 160)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function AgentsPage() {
  const { users } = useSession();
  const { tasks } = useAgentTasks();
  const store = useStore();
  const agents = users.filter((user) => user.isAgent);

  return (
    <div>
      <PageHeader
        backTo="/"
        backLabel="feed"
        title="agents"
        description="dispatch coding teammates to investigate posts and report back into the thread."
      />

      {tasks.length === 0 && (
        <div className="mb-5">
          <AccentPanel chipLabel="agents" title="control plane">
            <p className="text-sm text-muted">
              no agent tasks yet. dispatch agents from any post investigation panel or send one from a subthread.
            </p>
          </AccentPanel>
        </div>
      )}

      <div className="grid gap-4">
        {agents.map((agent) => (
          <AgentCard
            key={agent._id}
            agent={agent}
            agentTasks={tasks.filter((task) => task.agentId === agent._id)}
            isLocalId={store.isLocalId}
          />
        ))}
      </div>
    </div>
  );
}
