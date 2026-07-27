import { z } from "zod";
import { ConvexError } from "convex/values";
import {
  formatMediaSize,
  getMediaKind,
  mediaMaxBytes,
  MEDIA_ALLOWED_TYPES,
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_IMAGE_BYTES,
  MEDIA_MAX_PER_MESSAGE,
  MEDIA_MAX_VIDEO_BYTES,
  type MediaKind,
} from "./mediaPolicy";

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
  ATTACHMENT_MAX_IMAGE_BYTES: MEDIA_MAX_IMAGE_BYTES,
  ATTACHMENT_MAX_VIDEO_BYTES: MEDIA_MAX_VIDEO_BYTES,
  ATTACHMENT_MAX_FILE_BYTES: MEDIA_MAX_FILE_BYTES,
  ATTACHMENT_MAX_PER_POST: MEDIA_MAX_PER_MESSAGE,
  ATTACHMENT_ALLOWED_TYPES: MEDIA_ALLOWED_TYPES,
} as const;

export type AttachmentMediaKind = MediaKind;

export function attachmentMediaKind(contentType: string): AttachmentMediaKind | null {
  return getMediaKind(contentType);
}

export function attachmentMaxBytes(contentType: string): number | null {
  return mediaMaxBytes(contentType);
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
  uploadToken: z.string().min(1),
  filename: z.string().min(1).max(200),
  contentType: z.string().trim().min(1),
  mediaKind: z.enum(["image", "video", "file"]),
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
        ? `Videos must be ${formatMediaSize(LIMITS.ATTACHMENT_MAX_VIDEO_BYTES)} or smaller.`
        : attachment.mediaKind === "image"
          ? `Images must be ${formatMediaSize(LIMITS.ATTACHMENT_MAX_IMAGE_BYTES)} or smaller.`
          : `Files must be ${formatMediaSize(LIMITS.ATTACHMENT_MAX_FILE_BYTES)} or smaller.`,
    });
  }
  if (attachment.mediaKind === "image" && attachment.durationMs !== undefined) {
    ctx.addIssue({ code: "custom", message: "Images cannot include a duration." });
  }
  if (
    attachment.mediaKind === "file" &&
    (attachment.width !== undefined ||
      attachment.height !== undefined ||
      attachment.durationMs !== undefined)
  ) {
    ctx.addIssue({ code: "custom", message: "Files cannot include media dimensions or duration." });
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
