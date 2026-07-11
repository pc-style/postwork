import { z } from "zod";
import { ConvexError } from "convex/values";

/**
 * Shared input validation (Phase 3.2).
 *
 * Single source of truth for content limits. The zod schemas are used
 * server-side inside mutations (parsed before any write) and the numeric
 * limits are exported for client-side enforcement (char counters, etc.).
 *
 * A failed parse throws a ConvexError with `{ code: "INVALID_INPUT", ... }`
 * so the client gets a structured, localizable error instead of a generic 500.
 */

export const LIMITS = {
  POST_TITLE_MIN: 3,
  POST_TITLE_MAX: 200,
  POST_BODY_MIN: 1,
  POST_BODY_MAX: 20_000,
  REPLY_BODY_MIN: 1,
  REPLY_BODY_MAX: 10_000,
  PROFILE_NAME_MIN: 1,
  PROFILE_NAME_MAX: 80,
  PROFILE_TITLE_MAX: 80,
  PROFILE_INITIALS_MAX: 4,
  SEARCH_TERM_MAX: 200,
  ATTACHMENT_MAX_IMAGE_BYTES: 10 * 1024 * 1024,
  ATTACHMENT_MAX_VIDEO_BYTES: 50 * 1024 * 1024,
  ATTACHMENT_MAX_PER_POST: 8,
  ATTACHMENT_ALLOWED_TYPES: [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/webm",
  ],
} as const;

export type AttachmentMediaKind = "image" | "video";

export function attachmentMediaKind(contentType: string): AttachmentMediaKind | null {
  if ((LIMITS.ATTACHMENT_ALLOWED_TYPES as readonly string[]).includes(contentType)) {
    return contentType.startsWith("video/") ? "video" : "image";
  }
  return null;
}

export function attachmentMaxBytes(contentType: string): number | null {
  const kind = attachmentMediaKind(contentType);
  if (!kind) return null;
  return kind === "video"
    ? LIMITS.ATTACHMENT_MAX_VIDEO_BYTES
    : LIMITS.ATTACHMENT_MAX_IMAGE_BYTES;
}

export const postTitleSchema = z
  .string()
  .trim()
  .min(LIMITS.POST_TITLE_MIN, "Title is too short.")
  .max(LIMITS.POST_TITLE_MAX, `Title must be under ${LIMITS.POST_TITLE_MAX} characters.`);

export const postBodySchema = z
  .string()
  .trim()
  .min(LIMITS.POST_BODY_MIN, "Post body is empty.")
  .max(LIMITS.POST_BODY_MAX, `Post body must be under ${LIMITS.POST_BODY_MAX} characters.`);

export const replyBodySchema = z
  .string()
  .trim()
  .min(LIMITS.REPLY_BODY_MIN, "Reply is empty.")
  .max(LIMITS.REPLY_BODY_MAX, `Reply must be under ${LIMITS.REPLY_BODY_MAX} characters.`);

export const profileNameSchema = z
  .string()
  .trim()
  .min(LIMITS.PROFILE_NAME_MIN, "Name is required.")
  .max(LIMITS.PROFILE_NAME_MAX, `Name must be under ${LIMITS.PROFILE_NAME_MAX} characters.`);

export const profileTitleSchema = z
  .string()
  .trim()
  .max(LIMITS.PROFILE_TITLE_MAX, `Title must be under ${LIMITS.PROFILE_TITLE_MAX} characters.`)
  .or(z.literal(""));

export const profileInitialsSchema = z
  .string()
  .trim()
  .max(LIMITS.PROFILE_INITIALS_MAX, "Initials are too long.");

export const searchTermSchema = z
  .string()
  .trim()
  .max(LIMITS.SEARCH_TERM_MAX, "Search term is too long.");

/** Attachment metadata validated before storing a post attachment record. */
export const attachmentInputSchema = z.object({
  storageId: z.string().min(1),
  filename: z.string().min(1).max(200),
  contentType: z.enum([
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/webm",
  ]),
  mediaKind: z.enum(["image", "video"]),
  size: z.number().positive(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  durationMs: z.number().positive().optional(),
}).superRefine((attachment, ctx) => {
  const expectedKind = attachmentMediaKind(attachment.contentType);
  if (attachment.mediaKind !== expectedKind) {
    ctx.addIssue({ code: "custom", message: "Media kind does not match its content type." });
  }
  const maxBytes = attachmentMaxBytes(attachment.contentType);
  if (maxBytes !== null && attachment.size > maxBytes) {
    ctx.addIssue({
      code: "too_big",
      maximum: maxBytes,
      origin: "number",
      inclusive: true,
      message: attachment.mediaKind === "video"
        ? "Videos must be 50 MB or smaller."
        : "Images must be 10 MB or smaller.",
    });
  }
  if (attachment.mediaKind === "image" && attachment.durationMs !== undefined) {
    ctx.addIssue({ code: "custom", message: "Images cannot include a duration." });
  }
});

/**
 * Parse a value through a zod schema, throwing a typed ConvexError on failure.
 * The error data includes the first issue message so the client can surface it.
 */
export function parse<T>(schema: z.ZodType<T>, value: unknown, field: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const message = result.error.issues[0]?.message ?? "Invalid input.";
  throw new ConvexError({
    code: "INVALID_INPUT" as const,
    field,
    message,
  });
}
