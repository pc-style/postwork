import { action, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { generateText, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGateway } from "@ai-sdk/gateway";
import { isDemo } from "./lib/demo";
import { rateLimiter } from "./lib/rateLimit";
import { logWarn } from "./lib/observability";

/**
 * Resolve a language model from environment variables.
 *
 *   AI_PROVIDER = "openai" | "gateway" | "openrouter" | "pioneer"   (default: "openai")
 *
 * OpenAI (direct, https://platform.openai.com):
 *   OPENAI_API_KEY, OPENAI_MODEL  (default "gpt-5.4-mini")
 *
 * Vercel AI Gateway (routes to OpenAI & others):
 *   AI_GATEWAY_API_KEY, AI_GATEWAY_MODEL  (e.g. "openai/gpt-5.4-mini")
 *
 * OpenRouter (OpenAI-compatible, https://openrouter.ai):
 *   OPENROUTER_API_KEY, OPENROUTER_MODEL  (default "openai/gpt-5.4-mini"), OPENROUTER_BASE_URL?
 *
 * Pioneer (OpenAI-compatible, https://docs.pioneer.ai):
 *   PIONEER_API_KEY, PIONEER_MODEL, PIONEER_BASE_URL?
 */
export function resolveModel(): { model: LanguageModel; modelId: string } {
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();

  if (provider === "gateway") {
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey)
      throw new ConvexError({
        code: "NO_AI_KEY",
        message: "AI_GATEWAY_API_KEY is not set",
      });
    const modelId = process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5.4-mini";
    return { model: createGateway({ apiKey })(modelId), modelId };
  }

  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey)
      throw new ConvexError({
        code: "NO_AI_KEY",
        message: "OPENROUTER_API_KEY is not set",
      });
    const modelId = process.env.OPENROUTER_MODEL ?? "openai/gpt-5.4-mini";
    const openrouter = createOpenAICompatible({
      name: "openrouter",
      baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
      apiKey,
    });
    return { model: openrouter.chatModel(modelId), modelId };
  }

  if (provider === "pioneer") {
    const apiKey = process.env.PIONEER_API_KEY;
    if (!apiKey)
      throw new ConvexError({
        code: "NO_AI_KEY",
        message: "PIONEER_API_KEY is not set",
      });
    const modelId = process.env.PIONEER_MODEL;
    if (!modelId)
      throw new ConvexError({
        code: "NO_AI_KEY",
        message: "PIONEER_MODEL is not set",
      });
    const pioneer = createOpenAICompatible({
      name: "pioneer",
      baseURL: process.env.PIONEER_BASE_URL ?? "https://api.pioneer.ai/v1",
      apiKey,
      // Pioneer authenticates via the X-API-Key header.
      headers: { "X-API-Key": apiKey },
    });
    return { model: pioneer.chatModel(modelId), modelId };
  }

  // Default: OpenAI directly.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new ConvexError({
      code: "NO_AI_KEY",
      message: "OPENAI_API_KEY is not set",
    });
  const modelId = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  return { model: createOpenAI({ apiKey })(modelId), modelId };
}

/**
 * Whether an AI provider is configured on this deployment, without throwing.
 * Lets actions short-circuit into a friendly "disabled for the demo" result
 * instead of surfacing a Server Error to the client.
 */
export function aiConfigured(): boolean {
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  if (provider === "gateway") return !!process.env.AI_GATEWAY_API_KEY;
  if (provider === "openrouter") return !!process.env.OPENROUTER_API_KEY;
  if (provider === "pioneer")
    return !!process.env.PIONEER_API_KEY && !!process.env.PIONEER_MODEL;
  return !!process.env.OPENAI_API_KEY;
}

export const getContext = internalQuery({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post) throw new Error("Post not found");
    const author = await ctx.db.get(post.authorId);
    const replies = await ctx.db
      .query("replies")
      .withIndex("by_org_id_and_post_id_and_created_at", (q) =>
        q.eq("orgId", post.orgId).eq("postId", args.postId),
      )
      .order("asc")
      .collect();
    const repliesWithAuthors = await Promise.all(
      replies.map(async (r) => ({
        name: (await ctx.db.get(r.authorId))?.name ?? "Someone",
        body: r.body,
      })),
    );
    return {
      title: post.title,
      authorName: author?.name ?? "Someone",
      body: post.body,
      replies: repliesWithAuthors,
    };
  },
});

export const summarizePost = action({
  args: { postId: v.id("posts") },
  handler: async (ctx, args): Promise<{ summary: string; model: string }> => {
    if (!isDemo()) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new ConvexError({
          code: "UNAUTHENTICATED",
          message: "Sign in to generate summaries.",
        });
      }
      // Rate limit (Phase 3.1) — only in product mode where we have an identity.
      await rateLimiter.limit(ctx, "summarize", {
        key: identity.tokenIdentifier,
        throws: true,
      });
    }

    const accessiblePost = await ctx.runQuery(api.posts.get, {
      postId: args.postId,
    });
    if (!accessiblePost) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You do not have access to this post.",
      });
    }

    const ctxData = await ctx.runQuery(internal.ai.getContext, {
      postId: args.postId,
    });

    const transcript = [
      `POST by ${ctxData.authorName}: ${ctxData.title}`,
      ctxData.body,
      "",
      "REPLIES:",
      ...(ctxData.replies.length
        ? ctxData.replies.map((r) => `- ${r.name}: ${r.body}`)
        : ["(no replies yet)"]),
    ].join("\n");

    const { model, modelId } = resolveModel();
    let text: string;
    try {
      const result = await generateText({
        model,
        system:
          "You are the team's communication assistant. Summarize the post and its " +
          "discussion for a busy teammate who just got back online. Be concise. " +
          "Use exactly these markdown sections when relevant: '**TL;DR**' (1-2 " +
          "sentences), '**Decisions**' (bullets), '**Open questions**' (bullets), " +
          "and '**Action items**' (bullets with owner names). Omit empty sections.",
        prompt: transcript,
      });
      text = result.text;
    } catch (err) {
      if (err instanceof ConvexError) throw err;
      logWarn("ai.summarize.failed", {
        postId: args.postId,
        model: modelId,
        error: String(err),
      });
      throw new ConvexError({
        code: "AI_ERROR",
        message: "The AI provider failed to generate a summary. Try again.",
      });
    }

    return { summary: text.trim(), model: modelId };
  },
});

export const regeneratePostSummary = action({
  args: { postId: v.id("posts") },
  handler: async (ctx, args): Promise<{ summary: string; model: string }> => {
    const { summary, model } = await ctx.runAction(api.ai.summarizePost, {
      postId: args.postId,
    });
    await ctx.runMutation(api.posts.storeSummary, {
      postId: args.postId,
      summary,
      model,
    });
    return { summary, model };
  },
});
