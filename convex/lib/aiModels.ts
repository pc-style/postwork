import { ConvexError } from "convex/values";

export type AiGenerationKind = "postSummary" | "agentTask";

export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
export const DEFAULT_GATEWAY_MODEL = "openai/gpt-5.4-mini";
export const DEFAULT_OPENROUTER_MODEL = "openrouter/free";
export const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const MODEL_ID_PATTERN = /^[A-Za-z0-9._~:/+-]+$/;
const MODEL_ID_MAX_LENGTH = 180;

export function normalizeModelId(value: string): string {
  const modelId = value.trim();
  if (!modelId) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      field: "modelId",
      message: "Model ID is required.",
    });
  }
  if (modelId.length > MODEL_ID_MAX_LENGTH) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      field: "modelId",
      message: `Model ID must be under ${MODEL_ID_MAX_LENGTH} characters.`,
    });
  }
  if (!MODEL_ID_PATTERN.test(modelId)) {
    throw new ConvexError({
      code: "INVALID_INPUT",
      field: "modelId",
      message: "Model ID can only contain letters, numbers, dots, dashes, underscores, tildes, slashes, colons, and plus signs.",
    });
  }
  return modelId;
}
