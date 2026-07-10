import { generateText } from "ai";
import { ConvexError, v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { aiConfigured, resolveModel } from "./ai";
import {
  canAccessPost,
  ensureActiveViewerUser,
  forbidden,
  getDefaultOrgId,
  notFound,
  resolveViewerForRead,
} from "./authUsers";
import { agentTaskStatus } from "./schema";
import { rateLimiter } from "./lib/rateLimit";

type AgentResult = {
  result: string;
  model: string;
  disabled?: boolean;
};

async function generateAgentResult(args: {
  agentName: string;
  prompt: string;
  contextText: string;
}): Promise<AgentResult> {
  // Demo fallback: when no AI provider is configured on the deployment, the
  // action returns a disabled signal instead of throwing — so the client shows
  // a calm "AI is disabled for the demo" state and the Convex backend never
  // logs a Server Error.
  if (!aiConfigured()) {
    return {
      result: "AI is disabled for the time of the demo.",
      model: "disabled",
      disabled: true,
    };
  }

  // agentName is interpolated into the system prompt — collapse whitespace and
  // cap length so it can't carry injected multi-line instructions.
  const agentName =
    args.agentName.replace(/\s+/g, " ").trim().slice(0, 60) || "an agent";
  const { model, modelId } = resolveModel();
  const { text } = await generateText({
    model,
    system: `You are ${agentName}, an AI coding agent dispatched by a teammate to investigate a discussion thread and report back concise findings. You operate in the same control plane as the team. Read the thread context, then answer the request. Be concrete and brief. Use markdown: '**Findings**' (bullets) and '**Recommendation**' (1-2 sentences). If you'd need to inspect code you can't see, say what you'd check.`,
    prompt: `THREAD CONTEXT:\n${args.contextText}\n\nREQUEST:\n${args.prompt}`,
  });
  return { result: text.trim(), model: modelId };
}

function publicTask(task: Doc<"agentTasks">) {
  return {
    _id: task._id,
    _creationTime: task._creationTime,
    postId: task.postId,
    sourceReplyId: task.sourceReplyId,
    agentId: task.agentId,
    requestedById: task.requestedById,
    status: task.status,
    prompt: task.prompt,
    result: task.result,
    model: task.model,
    error: task.error,
    resultReplyId: task.resultReplyId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await resolveViewerForRead(ctx, undefined);
    if (!viewer) return [];
    const orgId = viewer.orgId ?? (await getDefaultOrgId(ctx));
    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_org_id_and_created_at", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(100);
    return tasks.map(publicTask);
  },
});

export const forPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const viewer = await resolveViewerForRead(ctx, undefined);
    const post = await ctx.db.get(args.postId);
    if (!post || !(await canAccessPost(ctx, post, viewer?._id))) return [];
    const tasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_org_id_and_post_id", (q) =>
        q.eq("orgId", post.orgId).eq("postId", args.postId),
      )
      .collect();
    return tasks.sort((a, b) => b.createdAt - a.createdAt).map(publicTask);
  },
});

export const create = mutation({
  args: {
    postId: v.id("posts"),
    sourceReplyId: v.optional(v.id("replies")),
    agentId: v.id("users"),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    await rateLimiter.limit(ctx, "agentTask", { key: viewer._id, throws: true });

    const post = await ctx.db.get(args.postId);
    if (!post || post.orgId !== viewer.orgId) notFound("Post not found.");
    if (!(await canAccessPost(ctx, post, viewer._id))) {
      forbidden("You do not have access to this post.");
    }

    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.orgId !== viewer.orgId || !agent.isAgent) {
      notFound("Agent not found.");
    }

    if (args.sourceReplyId) {
      const sourceReply = await ctx.db.get(args.sourceReplyId);
      if (
        !sourceReply ||
        sourceReply.orgId !== viewer.orgId ||
        sourceReply.postId !== args.postId
      ) {
        notFound("Source reply not found.");
      }
    }

    const prompt = args.prompt.trim().slice(0, 4000);
    if (!prompt) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        field: "prompt",
        message: "Task is required.",
      });
    }

    const now = Date.now();
    const taskId = await ctx.db.insert("agentTasks", {
      orgId: viewer.orgId,
      postId: args.postId,
      sourceReplyId: args.sourceReplyId,
      agentId: args.agentId,
      requestedById: viewer._id,
      status: "queued",
      prompt,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.agentTasks.runSimulated, { taskId });
    return taskId;
  },
});

export const runAgent = action({
  args: { agentName: v.string(), prompt: v.string(), contextText: v.string() },
  handler: async (_ctx, args): Promise<AgentResult> => generateAgentResult(args),
});

export const getRunnableTask = internalQuery({
  args: { taskId: v.id("agentTasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    const [post, agent] = await Promise.all([
      ctx.db.get(task.postId),
      ctx.db.get(task.agentId),
    ]);
    if (!post || !agent || post.orgId !== task.orgId || agent.orgId !== task.orgId) {
      return null;
    }

    const replies = await ctx.db
      .query("replies")
      .withIndex("by_org_id_and_post_id_and_created_at", (q) =>
        q.eq("orgId", task.orgId).eq("postId", task.postId),
      )
      .order("asc")
      .take(200);

    const authorIds = [...new Set([post.authorId, ...replies.map((reply) => reply.authorId)])];
    const authorNames = new Map<string, string>();
    for (const authorId of authorIds) {
      const author = await ctx.db.get(authorId);
      authorNames.set(authorId, author?.name ?? "Unknown");
    }

    const sourceReply = task.sourceReplyId
      ? replies.find((reply) => reply._id === task.sourceReplyId)
      : null;
    const contextText = [
      `POST by ${authorNames.get(post.authorId) ?? "Unknown"}: ${post.title}`,
      post.body,
      "",
      sourceReply
        ? `SOURCE REPLY by ${authorNames.get(sourceReply.authorId) ?? "Unknown"}: ${sourceReply.body}`
        : "SOURCE: whole post thread",
      "",
      "REPLIES:",
      ...(replies.length
        ? replies.map(
            (reply) => `- ${authorNames.get(reply.authorId) ?? "Unknown"}: ${reply.body}`,
          )
        : ["(no replies yet)"]),
    ].join("\n");

    return {
      task,
      agentName: agent.name,
      contextText,
    };
  },
});

export const setStatus = internalMutation({
  args: {
    taskId: v.id("agentTasks"),
    status: agentTaskStatus,
    result: v.optional(v.string()),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    resultReplyId: v.optional(v.id("replies")),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return;
    await ctx.db.patch(args.taskId, {
      status: args.status,
      result: args.result,
      model: args.model,
      error: args.error,
      resultReplyId: args.resultReplyId,
      completedAt: args.completedAt,
      updatedAt: Date.now(),
    });
  },
});

export const runSimulated = internalAction({
  args: { taskId: v.id("agentTasks") },
  handler: async (ctx, args) => {
    const runnable = await ctx.runQuery(internal.agentTasks.getRunnableTask, {
      taskId: args.taskId,
    });
    if (!runnable) {
      await ctx.runMutation(internal.agentTasks.setStatus, {
        taskId: args.taskId,
        status: "failed",
        error: "Task context could not be loaded.",
        completedAt: Date.now(),
      });
      return;
    }

    await ctx.runMutation(internal.agentTasks.setStatus, {
      taskId: args.taskId,
      status: "running",
    });

    try {
      const res = await generateAgentResult({
        agentName: runnable.agentName,
        prompt: runnable.task.prompt,
        contextText: runnable.contextText,
      });
      if (res.disabled) {
        await ctx.runMutation(internal.agentTasks.setStatus, {
          taskId: args.taskId,
          status: "failed",
          error: res.result,
          model: res.model,
          completedAt: Date.now(),
        });
        return;
      }

      const replyId: Id<"replies"> = await ctx.runMutation(
        internal.replies.createAsAgent,
        {
          postId: runnable.task.postId,
          parentId: runnable.task.sourceReplyId,
          authorId: runnable.task.agentId,
          body: res.result,
        },
      );

      await ctx.runMutation(internal.agentTasks.setStatus, {
        taskId: args.taskId,
        status: "done",
        result: res.result,
        model: res.model,
        resultReplyId: replyId,
        completedAt: Date.now(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.agentTasks.setStatus, {
        taskId: args.taskId,
        status: "failed",
        error: /API_KEY|not set/i.test(msg)
          ? "AI is disabled for the time of the demo."
          : msg,
        completedAt: Date.now(),
      });
    }
  },
});
