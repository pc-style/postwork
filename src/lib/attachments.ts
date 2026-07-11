import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { isDemo } from "./demoMode";
import {
  decideMediaFile,
  formatMediaSize,
  getMediaKind,
  MEDIA_ALLOWED_TYPES,
  MEDIA_MAX_IMAGE_BYTES,
  MEDIA_MAX_IMAGE_DIMENSION,
  UNSUPPORTED_MEDIA_MESSAGE,
  type MediaKind,
} from "./media";
import { isLocalId } from "./store";
import type { AttachmentInput, AttachmentWithUrl } from "./types";

export const ATTACHMENT_ALLOWED_TYPES = MEDIA_ALLOWED_TYPES;

type MediaMetadata = {
  width?: number;
  height?: number;
  durationMs?: number;
};

function loadMediaMetadata(file: File, kind: MediaKind): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (kind === "video") {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        resolve({
          width: video.videoWidth || undefined,
          height: video.videoHeight || undefined,
          durationMs: Number.isFinite(video.duration) && video.duration > 0
            ? Math.round(video.duration * 1000)
            : undefined,
        });
        URL.revokeObjectURL(url);
      };
      video.onerror = () => {
        resolve({});
        URL.revokeObjectURL(url);
      };
      video.src = url;
      return;
    }

    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve({});
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, contentType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image optimization failed."))),
      contentType,
      contentType === "image/jpeg" ? 0.82 : undefined,
    );
  });
}

async function optimizeStillImage(
  file: File,
  metadata: MediaMetadata,
): Promise<{ file: File; metadata: MediaMetadata }> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image could not be read."));
      image.src = sourceUrl;
    });

    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, MEDIA_MAX_IMAGE_DIMENSION / longestSide);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image optimization is unavailable in this browser.");
    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, file.type);
    if (blob.size >= file.size && file.size <= MEDIA_MAX_IMAGE_BYTES) {
      return { file, metadata };
    }
    return {
      file: new File([blob], file.name, { type: file.type, lastModified: file.lastModified }),
      metadata: { width, height },
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function useAttachmentUpload() {
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);

  const upload = async (originalFile: File): Promise<AttachmentInput> => {
    if (originalFile.size === 0) throw new Error("Media files cannot be empty.");
    const initialKind = getMediaKind(originalFile.type);
    if (!initialKind) {
      throw new Error(UNSUPPORTED_MEDIA_MESSAGE);
    }
    const preliminaryDecision = decideMediaFile({
      contentType: originalFile.type,
      size: originalFile.size,
    });
    if (!preliminaryDecision.accepted) throw new Error(preliminaryDecision.reason);
    const initialMetadata = await loadMediaMetadata(originalFile, initialKind);
    const initialDecision = decideMediaFile({
      contentType: originalFile.type,
      size: originalFile.size,
      ...initialMetadata,
    });
    if (!initialDecision.accepted) throw new Error(initialDecision.reason);

    let optimized = { file: originalFile, metadata: initialMetadata };
    if (initialDecision.optimize) {
      try {
        optimized = await optimizeStillImage(originalFile, initialMetadata);
      } catch (error) {
        if (originalFile.size > MEDIA_MAX_IMAGE_BYTES) throw error;
        // Optimization is best-effort for already valid images. If canvas is
        // unavailable or decoding fails, retain the original bytes.
      }
    }
    const finalDecision = decideMediaFile({
      contentType: optimized.file.type,
      size: optimized.file.size,
      ...optimized.metadata,
    });
    if (!finalDecision.accepted || optimized.file.size > finalDecision.maxBytes) {
      throw new Error(`The optimized image is still larger than ${formatMediaSize(MEDIA_MAX_IMAGE_BYTES)}.`);
    }

    const { postUrl, uploadToken } = await generateUploadUrl({});
    const response = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": optimized.file.type },
      body: optimized.file,
    });
    if (!response.ok) throw new Error("Upload failed. Try again.");
    const payload: unknown = await response.json();
    if (!isStorageUploadResponse(payload)) throw new Error("Upload returned an invalid response.");

    return {
      storageId: payload.storageId,
      uploadToken,
      filename: originalFile.name,
      contentType: optimized.file.type,
      mediaKind: finalDecision.kind,
      size: optimized.file.size,
      width: optimized.metadata.width,
      height: optimized.metadata.height,
      durationMs: optimized.metadata.durationMs,
    };
  };

  return { upload, canUpload: !isDemo };
}

function isStorageUploadResponse(value: unknown): value is { storageId: Id<"_storage"> } {
  return (
    typeof value === "object" &&
    value !== null &&
    "storageId" in value &&
    typeof value.storageId === "string"
  );
}

export function useAttachments(postId: Id<"posts">): AttachmentWithUrl[] {
  const result = useQuery(
    api.attachments.listForPost,
    isDemo || isLocalId(postId) ? "skip" : { postId },
  );
  return result ?? [];
}
