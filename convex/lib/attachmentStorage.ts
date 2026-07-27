import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  attachmentMaxBytes,
  type attachmentInputSchema,
} from "./validation";
import type { z } from "zod";

type AttachmentInput = z.infer<typeof attachmentInputSchema>;

/** Reject storage already owned by a durable post or reply attachment. */
export async function assertStorageUnattached(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
) {
  const existingAttachment = await ctx.db
    .query("postAttachments")
    .withIndex("by_storage_id", (q) => q.eq("storageId", storageId))
    .unique();
  if (existingAttachment) {
    throwInvalid("This uploaded media has already been attached.");
  }
}

export async function validateStoredAttachment(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  orgId: Id<"orgs"> | undefined,
  attachment: AttachmentInput,
): Promise<AttachmentInput & { storageId: Id<"_storage"> }> {
  const storageId = attachment.storageId as Id<"_storage">;
  const uploadToken = attachment.uploadToken as Id<"attachmentUploadTickets">;
  const ticket = await ctx.db.get(uploadToken);
  if (
    !ticket ||
    ticket.userId !== ownerId ||
    ticket.orgId !== orgId ||
    ticket.expiresAt <= Date.now() ||
    ticket.storageId !== storageId
  ) {
    throwInvalid("This upload is no longer available. Upload the media again.");
  }
  const stored = await ctx.db.system.get(storageId);
  if (!stored) throwInvalid("The uploaded media could not be found.");
  await assertStorageUnattached(ctx, storageId);
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
  await ctx.db.delete(ticket._id);
  return { ...attachment, storageId };
}

function throwInvalid(message: string): never {
  throw new ConvexError({
    code: "INVALID_INPUT" as const,
    field: "attachment",
    message,
  });
}
