import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  ensureActiveViewerUser,
  canAccessPost,
  getViewerFromAuth,
} from "./authUsers";
import { rateLimiter } from "./lib/rateLimit";
import { logInfo } from "./lib/observability";
import { attachmentMediaKind, type AttachmentMediaKind } from "./lib/validation";
import { assertStorageUnattached } from "./lib/attachmentStorage";

export const ATTACHMENT_UPLOAD_TICKET_TTL_MS = 15 * 60 * 1000;
const UPLOAD_TICKET_CLEANUP_BATCH_SIZE = 100;

/**
 * Image and video attachments via Convex file storage.
 *
 * Flow:
 *   1. Client calls `generateUploadUrl` → gets a one-time upload URL and an ownership ticket.
 *   2. Client uploads the image (POST the file blob to that URL).
 *   3. The upload response returns `{ storageId }`.
 *   4. Client claims the returned storageId against the ownership ticket.
 *   5. Client passes the claimed storageId + ownership ticket + metadata in the `attachments`
 *      array to `posts.create` / `replies.create`, which persist `postAttachments` rows.
 *   6. `listForPost` returns all attachments for a thread with signed URLs.
 *
 * Product mode only — the demo overlay can't hold files, so the upload
 * mutation is auth-gated and the UI hides attachment affordances in demo.
 */

/** Generate a one-time upload URL. Auth-gated + rate-limited. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await ensureActiveViewerUser(ctx);
    await rateLimiter.limit(ctx, "uploadAttachment", {
      key: viewer._id,
      throws: true,
    });
    const now = Date.now();
    const uploadToken = await ctx.db.insert("attachmentUploadTickets", {
      orgId: viewer.orgId,
      userId: viewer._id,
      createdAt: now,
      expiresAt: now + ATTACHMENT_UPLOAD_TICKET_TTL_MS,
    });
    await ctx.scheduler.runAfter(
      ATTACHMENT_UPLOAD_TICKET_TTL_MS,
      internal.attachments.cleanupExpiredUploadTicket,
      { uploadToken },
    );
    return { postUrl: await ctx.storage.generateUploadUrl(), uploadToken };
  },
});

/**
 * Associate a direct-upload result with its ticket before the attachment
 * mutation can consume it. Convex upload URLs create the storage ID only once
 * the browser POST succeeds, so this claim is the durable ticket-to-blob
 * association used by post and reply creation.
 */
export const claimUploadedStorage = mutation({
  args: {
    uploadToken: v.id("attachmentUploadTickets"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const ticket = await ctx.db.get(args.uploadToken);
    if (
      !ticket ||
      ticket.userId !== viewer._id ||
      ticket.orgId !== viewer.orgId ||
      ticket.expiresAt <= Date.now()
    ) {
      throwUploadUnavailable();
    }

    // A fresh ticket must never claim a blob already referenced by a durable
    // attachment: expiry cleanup would otherwise delete that in-use file.
    await assertStorageUnattached(ctx, args.storageId);

    if (ticket.storageId) {
      if (ticket.storageId !== args.storageId) {
        throwInvalidUpload("This upload ticket is already bound to a different file.");
      }
      return { storageId: ticket.storageId };
    }

    const stored = await ctx.db.system.get(args.storageId);
    if (!stored) throwInvalidUpload("The uploaded media could not be found.");
    if (stored._creationTime < ticket.createdAt) {
      throwInvalidUpload("The uploaded media predates this upload ticket.");
    }

    const existingClaim = await ctx.db
      .query("attachmentUploadTickets")
      .withIndex("by_storage_id", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (existingClaim) {
      throwInvalidUpload("This uploaded media is already bound to another upload ticket.");
    }

    await ctx.db.patch(ticket._id, { storageId: args.storageId });
    return { storageId: args.storageId };
  },
});

/** Remove one expired ticket and its claimed-but-unattached storage object. */
export const cleanupExpiredUploadTicket = internalMutation({
  args: { uploadToken: v.id("attachmentUploadTickets") },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.uploadToken);
    if (!ticket || ticket.expiresAt > Date.now()) return { deleted: false };
    await deleteExpiredUploadTicket(ctx, ticket);
    return { deleted: true };
  },
});

/**
 * Backstop scheduled cleanup for tickets whose one-shot cleanup was delayed or
 * created before that schedule existed. Batches reschedule themselves so the
 * transaction remains bounded.
 */
export const cleanupExpiredUploadTickets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tickets = await ctx.db
      .query("attachmentUploadTickets")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", Date.now()))
      .take(UPLOAD_TICKET_CLEANUP_BATCH_SIZE);
    for (const ticket of tickets) {
      await deleteExpiredUploadTicket(ctx, ticket);
    }
    if (tickets.length === UPLOAD_TICKET_CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.attachments.cleanupExpiredUploadTickets, {});
    }
    return { deleted: tickets.length };
  },
});

export type AttachmentWithUrl = {
  _id: Id<"postAttachments">;
  postId: Id<"posts">;
  replyId: Id<"replies"> | undefined;
  filename: string;
  contentType: string;
  mediaKind: AttachmentMediaKind;
  size: number;
  width: number | undefined;
  height: number | undefined;
  durationMs: number | undefined;
  uploadedBy: Id<"users">;
  createdAt: number;
  url: string | null;
};

/** All attachments for a post thread (post-level + all replies). */
export const listForPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args): Promise<AttachmentWithUrl[]> => {
    const authViewer = await getViewerFromAuth(ctx);
    const viewer = authViewer?.status === "pending" ? null : authViewer;
    const post = await ctx.db.get(args.postId);
    if (!post || !(await canAccessPost(ctx, post, viewer?._id))) {
      return [];
    }

    const orgId = post.orgId;
    const attachments = await ctx.db
      .query("postAttachments")
      .withIndex("by_org_id_and_post_id", (q) =>
        q.eq("orgId", orgId).eq("postId", args.postId),
      )
      .order("asc")
      .collect();

    return await Promise.all(
      attachments.map(async (att) => ({
        _id: att._id,
        postId: att.postId,
        replyId: att.replyId,
        filename: att.filename,
        contentType: att.contentType,
        mediaKind: att.mediaKind ?? attachmentMediaKind(att.contentType) ?? "image",
        size: att.size,
        width: att.width,
        height: att.height,
        durationMs: att.durationMs,
        uploadedBy: att.uploadedBy,
        createdAt: att.createdAt,
        url: await ctx.storage.getUrl(att.storageId),
      })),
    );
  },
});

/** Delete an attachment (author or admin). Also removes the stored file. */
export const remove = mutation({
  args: { attachmentId: v.id("postAttachments") },
  handler: async (ctx, args) => {
    const viewer = await ensureActiveViewerUser(ctx);
    const att = await ctx.db.get(args.attachmentId);
    if (!att || att.orgId !== viewer.orgId) {
      throw new Error("Attachment not found.");
    }
    if (att.uploadedBy !== viewer._id && viewer.role !== "admin") {
      throw new Error("Only the uploader or an admin can delete an attachment.");
    }

    await ctx.storage.delete(att.storageId);
    await ctx.db.delete(args.attachmentId);
    logInfo("attachment.deleted", {
      attachmentId: args.attachmentId,
      deletedBy: viewer._id,
    });
  },
});

async function deleteExpiredUploadTicket(
  ctx: MutationCtx,
  ticket: { _id: Id<"attachmentUploadTickets">; storageId?: Id<"_storage"> },
) {
  // Direct-upload URLs cannot be enumerated or pre-bound to an ID. Once a
  // browser claims its result, however, the ticket gives us a safe ownership
  // record, so an expired unconsumed claim can delete its orphaned blob.
  if (ticket.storageId) await ctx.storage.delete(ticket.storageId);
  await ctx.db.delete(ticket._id);
}

function throwUploadUnavailable(): never {
  throwInvalidUpload("This upload is no longer available. Upload the media again.");
}

function throwInvalidUpload(message: string): never {
  throw new ConvexError({
    code: "INVALID_INPUT" as const,
    field: "attachment",
    message,
  });
}
