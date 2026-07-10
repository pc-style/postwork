import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSession } from "./session";
import { useStore } from "./store";

export type AgentTask = {
  _id: string;
  postId: Id<"posts">;
  sourceReplyId?: Id<"replies">;
  agentId: Id<"users">;
  requestedById?: Id<"users">;
  status: "pending" | "running" | "done" | "failed";
  prompt: string;
  result?: string;
  model?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
};

type DispatchArgs = {
  postId: Id<"posts">;
  sourceReplyId?: Id<"replies">;
  agentId: Id<"users">;
  agentName: string;
  prompt: string;
  contextText: string;
};

type AgentTasksValue = {
  tasks: AgentTask[];
  tasksForPost: (postId: Id<"posts">) => AgentTask[];
  dispatch: (args: DispatchArgs) => Promise<void>;
};

const AgentTasksContext = createContext<AgentTasksValue | null>(null);

export function AgentTasksProvider({ children }: { children: ReactNode }) {
  const { currentUserId } = useSession();
  const store = useStore();
  const runAgent = useAction(api.agentTasks.runAgent);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const counter = useRef(0);

  const patchTask = useCallback((id: string, patch: Partial<AgentTask>) => {
    setTasks((prev) =>
      prev.map((task) => (task._id === id ? { ...task, ...patch } : task)),
    );
  }, []);

  const dispatch = useCallback(
    async (args: DispatchArgs) => {
      counter.current += 1;
      const id = `local_at${counter.current}`;
      const now = Date.now();
      const task: AgentTask = {
        _id: id,
        postId: args.postId,
        sourceReplyId: args.sourceReplyId,
        agentId: args.agentId,
        requestedById: currentUserId,
        status: "pending",
        prompt: args.prompt,
        createdAt: now,
      };
      setTasks((prev) => [task, ...prev]);
      patchTask(id, { status: "running" });

      try {
        const res = await runAgent({
          agentName: args.agentName,
          prompt: args.prompt,
          contextText: args.contextText,
        });
        if (res.disabled) {
          // No AI provider configured for the demo — surface a calm notice
          // instead of posting the fallback string as an agent reply.
          patchTask(id, {
            status: "failed",
            completedAt: Date.now(),
            error: res.result,
            model: res.model,
          });
          return;
        }
        patchTask(id, {
          status: "done",
          result: res.result,
          model: res.model,
          completedAt: Date.now(),
        });
        await store.createReply({
          postId: args.postId,
          parentId: args.sourceReplyId,
          authorId: args.agentId,
          body: res.result,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        patchTask(id, {
          status: "failed",
          completedAt: Date.now(),
          error: /API_KEY|not set/i.test(msg)
            ? "AI is disabled for the time of the demo."
            : msg,
        });
      }
    },
    [currentUserId, patchTask, runAgent, store],
  );

  const tasksForPost = useCallback(
    (postId: Id<"posts">) => tasks.filter((task) => task.postId === postId),
    [tasks],
  );

  const value = useMemo<AgentTasksValue>(
    () => ({ tasks, tasksForPost, dispatch }),
    [tasks, tasksForPost, dispatch],
  );

  return (
    <AgentTasksContext.Provider value={value}>
      {children}
    </AgentTasksContext.Provider>
  );
}

export function useAgentTasks() {
  const ctx = useContext(AgentTasksContext);
  if (!ctx) {
    throw new Error("useAgentTasks must be used within AgentTasksProvider");
  }
  return ctx;
}
