import { generateText } from "ai";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { resolveModel } from "./ai";

export const runAgent = action({
  args: { agentName: v.string(), prompt: v.string(), contextText: v.string() },
  handler: async (_ctx, args): Promise<{ result: string; model: string }> => {
    // agentName is interpolated into the system prompt — collapse whitespace
    // and cap length so it can't carry injected multi-line instructions.
    const agentName =
      args.agentName.replace(/\s+/g, " ").trim().slice(0, 60) || "an agent";
    const { model, modelId } = resolveModel();
    const { text } = await generateText({
      model,
      system: `You are ${agentName}, an AI coding agent dispatched by a teammate to investigate a discussion thread and report back concise findings. You operate in the same control plane as the team. Read the thread context, then answer the request. Be concrete and brief. Use markdown: '**Findings**' (bullets) and '**Recommendation**' (1-2 sentences). If you'd need to inspect code you can't see, say what you'd check.`,
      prompt: `THREAD CONTEXT:\n${args.contextText}\n\nREQUEST:\n${args.prompt}`,
    });
    return { result: text.trim(), model: modelId };
  },
});
