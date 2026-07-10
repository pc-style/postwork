import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { isDemo } from "./demoMode";
import { isLocalId } from "./store";
import type { AttachmentInput, AttachmentWithUrl } from "./types";

/**
 * Image attachment upload + display hooks (Phase 3.4).
 *
 * Product mode only — the demo overlay can't hold files, so uploads are
 * auth-gated on the backend and the UI hides the affordance in demo.
 */

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — matches backend LIMITS.ATTACHMENT_MAX_BYTES

export const ATTACHMENT_ALLOWED_TYPES = ALLOWED_TYPES;
export const ATTACHMENT_MAX_BYTES = MAX_BYTES;

/** Read natural dimensions from an image File (for the attachment record). */
function getImageDimensions(
  file: File,
): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) return resolve({});
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({});
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/**
 * Hook for uploading image attachments to Convex storage.
 *
 * Returns `upload(file)` which generates a one-time upload URL, POSTs the
 * file, and returns the `{ storageId, ... }` metadata to pass into
 * `store.createPost` / `store.createReply`. `canUpload` is false in demo mode.
 */
export function useAttachmentUpload() {
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);

  const upload = async (file: File): Promise<AttachmentInput> => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error(
        `Unsupported file type. Images only: ${ALLOWED_TYPES.join(", ")}.`,
      );
    }
    if (file.size > MAX_BYTES) {
      throw new Error(`File too large. Maximum ${MAX_BYTES / 1024 / 1024} MB.`);
    }

    const postUrl = await generateUploadUrl({});
    const res = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) throw new Error("Upload failed. Try again.");

    const { storageId } = (await res.json()) as { storageId: string };
    const { width, height } = await getImageDimensions(file);

    return {
      storageId,
      filename: file.name,
      contentType: file.type,
      size: file.size,
      width,
      height,
    };
  };

  return { upload, canUpload: !isDemo };
}

/**
 * Fetch all attachments for a post thread (post-level + all replies).
 * Returns `[]` in demo mode or for local (overlay) posts.
 *
 * The caller filters by `replyId` to split post-level vs reply-level images.
 */
export function useAttachments(postId: Id<"posts">): AttachmentWithUrl[] {
  const result = useQuery(
    api.attachments.listForPost,
    isDemo || isLocalId(postId) ? "skip" : { postId },
  );
  return result ?? [];
}
