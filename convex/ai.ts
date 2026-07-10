import { action, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { generateText, type LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGateway } from "@ai-sdk/gateway";
import { aiGenerationKind } from "./schema";
import { getDefaultOrgId } from "./authUsers";
import { isDemo } from "./lib/demo";
import { rateLimiter } from "./lib/rateLimit";
import { logWarn } from "./lib/observability";
import {
  DEFAULT_GATEWAY_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_MODEL,
  normalizeModelId,
} from "./lib/aiModels";

type ResolveModelOptions = {
  openRouterModelId?: string | null;
};

type OpenRouterModel = {
  id: string;
  name?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: Record<string, string | undefined>;
};

/**
 * Resolve a language model from environment variables.
 *
 *   AI_PROVIDER = "openrouter" | "openai" | "gateway" | "pioneer"   (default: "openrouter")
 *
 * OpenRouter (OpenAI-compatible, https://openrouter.ai):
 *   OPENROUTER_API_KEY, OPENROUTER_MODEL  (default DEFAULT_OPENROUTER_MODEL), OPENROUTER_BASE_URL?
 *
 * OpenAI (direct, https://platform.openai.com):
 *   OPENAI_API_KEY, OPENAI_MODEL  (default DEFAULT_OPENAI_MODEL)
 *
 * Vercel AI Gateway (routes to OpenAI & others):
 *   AI_GATEWAY_API_KEY, AI_GATEWAY_MODEL  (default DEFAULT_GATEWAY_MODEL)
 *
 * Pioneer (OpenAI-compatible, https://docs.pioneer.ai):
 *   PIONEER_API_KEY, PIONEER_MODEL, PIONEER_BASE_URL?
 */
export function resolveModel(
  options: ResolveModelOptions = {},
): { model: LanguageModel; modelId: string } {
  if (options.openRouterModelId) {
    const modelId = normalizeModelId(options.openRouterModelId);
    return resolveOpenRouterModel(modelId);
  }

  const provider = (process.env.AI_PROVIDER ?? "openrouter").toLowerCase();

  if (provider === "gateway") {
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey)
      throw new ConvexError({
        code: "NO_AI_KEY",
        message: "AI_GATEWAY_API_KEY is not set",
      });
    const modelId = process.env.AI_GATEWAY_MODEL ?? DEFAULT_GATEWAY_MODEL;
    return { model: createGateway({ apiKey })(modelId), modelId };
  }

  if (provider === "openrouter") {
    const modelId = process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
    return resolveOpenRouterModel(modelId);
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

  if (provider !== "openai") {
    throw new ConvexError({
      code: "INVALID_AI_PROVIDER",
      message: "AI_PROVIDER must be openrouter, openai, gateway, or pioneer.",
    });
  }

  // Direct OpenAI is available when explicitly selected.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new ConvexError({
      code: "NO_AI_KEY",
      message: "OPENAI_API_KEY is not set",
    });
  const modelId = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  return { model: createOpenAI({ apiKey })(modelId), modelId };
}

function resolveOpenRouterModel(modelId: string): { model: LanguageModel; modelId: string } {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey)
    throw new ConvexError({
      code: "NO_AI_KEY",
      message: "OPENROUTER_API_KEY is not set",
    });
  const openrouter = createOpenAICompatible({
    name: "openrouter",
    baseURL: process.env.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL,
    apiKey,
  });
  return { model: openrouter.chatModel(modelId), modelId };
}

/**
 * Whether an AI provider is configured on this deployment, without throwing.
 * Lets actions short-circuit into a friendly "disabled for the demo" result
 * instead of surfacing a Server Error to the client.
 */
export function aiConfigured(options: ResolveModelOptions = {}): boolean {
  if (options.openRouterModelId) return !!process.env.OPENROUTER_API_KEY;
  const provider = (process.env.AI_PROVIDER ?? "openrouter").toLowerCase();
  if (provider === "gateway") return !!process.env.AI_GATEWAY_API_KEY;
  if (provider === "openrouter") return !!process.env.OPENROUTER_API_KEY;
  if (provider === "pioneer")
    return !!process.env.PIONEER_API_KEY && !!process.env.PIONEER_MODEL;
  if (provider === "openai") return !!process.env.OPENAI_API_KEY;
  return false;
}

export const getGenerationModelSetting = internalQuery({
  args: {
    orgId: v.optional(v.id("orgs")),
    kind: aiGenerationKind,
  },
  handler: async (ctx, args): Promise<string | null> => {
    const orgId = args.orgId ?? (await getDefaultOrgId(ctx));
    const setting = await ctx.db
      .query("aiGenerationSettings")
      .withIndex("by_org_id_and_kind", (q) =>
        q.eq("orgId", orgId).eq("kind", args.kind),
      )
      .first();
    return setting?.modelId ?? null;
  },
});

function priceIsZero(value: string | undefined): boolean {
  if (value === undefined) return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed === 0;
}

function isFreeOpenRouterModel(model: OpenRouterModel): boolean {
  if (model.id === DEFAULT_OPENROUTER_MODEL || model.id.endsWith(":free")) {
    return true;
  }
  const pricing = model.pricing;
  if (!pricing) return false;
  return [
    pricing.prompt,
    pricing.completion,
    pricing.request,
    pricing.image,
    pricing.web_search,
    pricing.internal_reasoning,
    pricing.input_cache_read,
    pricing.input_cache_write,
  ].every(priceIsZero);
}

function isAllowedOpenRouterModel(model: OpenRouterModel): boolean {
  if (model.id === DEFAULT_OPENROUTER_MODEL) return true;

  const id = model.id.toLowerCase();
  const name = model.name?.toLowerCase() ?? "";
  if (
    id.startsWith("liquid/") ||
    id.startsWith("meta-llama/") ||
    id.includes("nemotron")
  ) {
    return false;
  }
  if (
    /channel[-_ ]?rating|content[-_ ]?safety|moderation|guardrail/.test(
      `${id} ${name}`,
    )
  ) {
    return false;
  }

  const inputModalities = model.architecture?.input_modalities;
  const outputModalities = model.architecture?.output_modalities;
  return (
    inputModalities?.length === 1 &&
    inputModalities[0] === "text" &&
    outputModalities?.length === 1 &&
    outputModalities[0] === "text"
  );
}

export const listOpenRouterFreeModels = action({
  args: {},
  handler: async (): Promise<
    { id: string; name: string; contextLength?: number }[]
  > => {
    const response = await fetch(
      `${DEFAULT_OPENROUTER_BASE_URL}/models?output_modalities=text&sort=pricing-low-to-high`,
    );
    if (!response.ok) {
      throw new ConvexError({
        code: "OPENROUTER_MODELS_ERROR",
        message: "Could not load OpenRouter models. Try again.",
      });
    }
    const payload = (await response.json()) as { data?: OpenRouterModel[] };
    const models = payload.data ?? [];
    const free = models
      .filter(
        (model) =>
          isFreeOpenRouterModel(model) && isAllowedOpenRouterModel(model),
      )
      .map((model) => ({
        id: model.id,
        name: model.name ?? model.id,
        contextLength: model.context_length,
      }));

    const byId = new Map<string, { id: string; name: string; contextLength?: number }>();
    byId.set(DEFAULT_OPENROUTER_MODEL, {
      id: DEFAULT_OPENROUTER_MODEL,
      name: "OpenRouter free router",
    });
    for (const model of free) byId.set(model.id, model);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  },
});

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

    const openRouterModelId = await ctx.runQuery(internal.ai.getGenerationModelSetting, {
      orgId: accessiblePost.orgId,
      kind: "postSummary",
    });
    const { model, modelId } = resolveModel({ openRouterModelId });
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
