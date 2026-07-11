import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  attachmentMaxBytes,
  type attachmentInputSchema,
} from "./validation";
import type { z } from "zod";

type AttachmentInput = z.infer<typeof attachmentInputSchema>;

export async function validateStoredAttachment(
  ctx: MutationCtx,
  attachment: AttachmentInput,
): Promise<AttachmentInput & { storageId: Id<"_storage"> }> {
  const storageId = attachment.storageId as Id<"_storage">;
  const stored = await ctx.db.system.get(storageId);
  if (!stored) throwInvalid("The uploaded media could not be found.");
  if (stored.contentType !== attachment.contentType) {
    throwInvalid("The uploaded media type does not match its metadata.");
  }
  if (stored.size !== attachment.size) {
    throwInvalid("The uploaded media size does not match its metadata.");
  }
  const maxBytes = attachmentMaxBytes(stored.contentType ?? "");
  if (maxBytes === null || stored.size > maxBytes) {
    throwInvalid("The uploaded media exceeds its allowed size.");
  }
  return { ...attachment, storageId };
}

function throwInvalid(message: string): never {
  throw new ConvexError({
    code: "INVALID_INPUT" as const,
    field: "attachment",
    message,
  });
}

