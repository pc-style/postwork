import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { isDemo } from "./demoMode";
import { useSession } from "./session";

export type AgentTask = FunctionReturnType<typeof api.agentTasks.list>[number];

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
  if (!isDemo) {
    return <ProductAgentTasksProvider>{children}</ProductAgentTasksProvider>;
  }

  return <DemoAgentTasksProvider>{children}</DemoAgentTasksProvider>;
}

function DemoAgentTasksProvider({ children }: { children: ReactNode }) {
  const { currentUserId } = useSession();
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const counter = useRef(0);

  const patchTask = useCallback((id: string, patch: Partial<AgentTask>) => {
    setTasks((prev) =>
      prev.map((task) => (task._id === id ? { ...task, ...patch } : task)),
    );
  }, []);

  const dispatch = useCallback(
    async (args: DispatchArgs) => {
      if (!currentUserId) {
        throw new Error("Choose a teammate before sending an agent task.");
      }
      counter.current += 1;
      const id = `local_at${counter.current}` as AgentTask["_id"];
      const now = Date.now();
      const task: AgentTask = {
        _id: id,
        _creationTime: now,
        postId: args.postId,
        sourceReplyId: args.sourceReplyId,
        agentId: args.agentId,
        requestedById: currentUserId,
        status: "queued",
        prompt: args.prompt,
        result: undefined,
        model: undefined,
        error: undefined,
        resultReplyId: undefined,
        createdAt: now,
        updatedAt: now,
        completedAt: undefined,
      };
      setTasks((prev) => [task, ...prev]);
      patchTask(id, { status: "running" });

      patchTask(id, {
        status: "failed",
        completedAt: Date.now(),
        error: "Agent execution requires an authenticated product account.",
      });
    },
    [currentUserId, patchTask],
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

function ProductAgentTasksProvider({ children }: { children: ReactNode }) {
  const createTask = useMutation(api.agentTasks.create);
  const queriedTasks = useQuery(api.agentTasks.list);
  const tasks = useMemo(() => queriedTasks ?? [], [queriedTasks]);

  const dispatch = useCallback(
    async (args: DispatchArgs) => {
      await createTask({
        postId: args.postId,
        sourceReplyId: args.sourceReplyId,
        agentId: args.agentId,
        prompt: args.prompt,
      });
    },
    [createTask],
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
