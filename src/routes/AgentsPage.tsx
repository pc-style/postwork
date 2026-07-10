import { Link } from "@tanstack/react-router";
import type { Doc } from "../../convex/_generated/dataModel";
import { AgentTag } from "../components/AgentTag";
import { Avatar } from "../components/Avatar";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { StatusChip } from "../components/StatusChip";
import { useAgentTasks, type AgentTask } from "../lib/agentTasks";
import { timeAgo } from "../lib/format";
import { useSession } from "../lib/session";
import { isLocalId, usePrefetchPost } from "../lib/store";
import { useDocumentTitle } from "../lib/useDocumentTitle";

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function AgentCard({ agent, agentTasks }: { agent: Doc<"users">; agentTasks: AgentTask[] }) {
  const recent = agentTasks.slice(0, 5);
  const prefetchPost = usePrefetchPost();

  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar user={agent} size={38} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-fg">{agent.name}</h2>
              <AgentTag />
            </div>
            <p className="text-sm text-muted">{agent.title}</p>
          </div>
        </div>
        <div className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs text-accent-soft">
          {agentTasks.length} {agentTasks.length === 1 ? "task" : "tasks"}
        </div>
      </div>

      {recent.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No tasks have been assigned to this agent.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {recent.map((task) => (
            <div key={task._id} className="rounded-md border border-border bg-bg p-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <StatusChip status={task.status} />
                <span className="text-label text-muted">{timeAgo(task.createdAt)}</span>
                {isLocalId(task.postId) ? (
                  <span className="text-label text-muted">Session post</span>
                ) : (
                  <Link
                    to="/app/posts/$postId"
                    params={{ postId: task.postId }}
                    className="inline-flex min-h-11 items-center text-label text-accent-soft transition-colors hover:text-fg sm:min-h-9"
                    onMouseEnter={() => prefetchPost(task.postId)}
                    onFocus={() => prefetchPost(task.postId)}
                    onTouchStart={() => prefetchPost(task.postId)}
                  >
                    open post
                  </Link>
                )}
              </div>
              <p className="break-words text-sm text-fg">{truncate(task.prompt, 120)}</p>
              {task.status === "done" && task.result ? (
                <p className="mt-1.5 break-words text-xs text-muted">{truncate(task.result.replace(/\s+/g, " ").trim(), 160)}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function AgentsPage() {
  useDocumentTitle("Agents · postwork");
  const { users } = useSession();
  const { tasks } = useAgentTasks();
  const agents = users.filter((user) => user.isAgent);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <PageHeader
        backTo="/app"
        backLabel="feed"
        title="Agents"
        description="Review agent tasks and open the posts where they were requested."
      />

      {tasks.length === 0 ? (
        <div className="mb-5">
          <EmptyState>No agent tasks yet. Open a post to ask an agent for help.</EmptyState>
        </div>
      ) : null}

      {agents.length === 0 ? (
        <EmptyState>No agents are available.</EmptyState>
      ) : (
        <div className="grid gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent._id} agent={agent} agentTasks={tasks.filter((task) => task.agentId === agent._id)} />
          ))}
        </div>
      )}
    </div>
  );
}
