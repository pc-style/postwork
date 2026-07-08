import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  ensureViewerUser,
  canAccessPost,
  getViewerFromAuth,
} from "./authUsers";
import { rateLimiter } from "./lib/rateLimit";
import { logInfo } from "./lib/observability";

/**
 * Image attachments via Convex file storage (Phase 3.4).
 *
 * Flow:
 *   1. Client calls `generateUploadUrl` → gets a one-time upload URL.
 *   2. Client uploads the image (POST the file blob to that URL).
 *   3. The upload response returns `{ storageId }`.
 *   4. Client passes the storageId + metadata in the `attachments` array to
 *      `posts.create` / `replies.create`, which persist `postAttachments` rows.
 *   5. `listForPost` returns all attachments for a thread with signed URLs.
 *
 * Product mode only — the demo overlay can't hold files, so the upload
 * mutation is auth-gated and the UI hides attachment affordances in demo.
 */

/** Generate a one-time upload URL. Auth-gated + rate-limited. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await ensureViewerUser(ctx);
    await rateLimiter.limit(ctx, "uploadAttachment", {
      key: viewer._id,
      throws: true,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

export type AttachmentWithUrl = {
  _id: Id<"postAttachments">;
  postId: Id<"posts">;
  replyId: Id<"replies"> | undefined;
  filename: string;
  contentType: string;
  size: number;
  width: number | undefined;
  height: number | undefined;
  uploadedBy: Id<"users">;
  createdAt: number;
  url: string | null;
};

/** All attachments for a post thread (post-level + all replies). */
export const listForPost = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args): Promise<AttachmentWithUrl[]> => {
    const viewer = await getViewerFromAuth(ctx);
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
        size: att.size,
        width: att.width,
        height: att.height,
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
    const viewer = await ensureViewerUser(ctx);
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
