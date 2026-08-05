import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { isDemo } from "./demoMode";
import {
  decideMediaFile,
  formatMediaSize,
  getMediaKind,
  MEDIA_MAX_IMAGE_BYTES,
  MEDIA_WEBP_CONTENT_TYPE,
  MEDIA_WEBP_QUALITY,
  pickSmallerEncoding,
  targetImageDimensions,
  UNSUPPORTED_MEDIA_MESSAGE,
  webpFilename,
  type MediaKind,
} from "./media";
import { isLocalId } from "./store";
import type { AttachmentInput, AttachmentWithUrl } from "./types";

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

function canvasToBlob(
  canvas: HTMLCanvasElement,
  contentType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image optimization failed."))),
      contentType,
      quality,
    );
  });
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

/**
 * Decode with EXIF orientation applied so the canvas re-encode never rotates
 * photos. `createImageBitmap` bakes the orientation into the pixel data;
 * the `<img>` fallback relies on browsers' default `image-orientation:
 * from-image` handling, which every canvas-capable browser now applies.
 */
async function decodeStillImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> decode path.
    }
  }
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image could not be read."));
      image.src = sourceUrl;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(sourceUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(sourceUrl);
    throw error;
  }
}

/**
 * Re-encode a still JPEG/PNG as lossy WebP, downscaling anything over
 * `MEDIA_MAX_IMAGE_DIMENSION` on the long edge. Keeps the original bytes when
 * they are already smaller than the re-encode (and within the size cap).
 * Animated formats (GIF, WebP) never reach this path — `decideMediaFile`
 * only flags still formats for optimization.
 */
async function optimizeStillImage(
  file: File,
  metadata: MediaMetadata,
): Promise<{ file: File; metadata: MediaMetadata }> {
  const decoded = await decodeStillImage(file);
  try {
    const target = targetImageDimensions(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image optimization is unavailable in this browser.");
    context.drawImage(decoded.source, 0, 0, target.width, target.height);
    const encoded = await canvasToBlob(canvas, MEDIA_WEBP_CONTENT_TYPE, MEDIA_WEBP_QUALITY);

    const choice = pickSmallerEncoding({
      originalBytes: file.size,
      encodedBytes: encoded.size,
      originalFits: file.size <= MEDIA_MAX_IMAGE_BYTES,
    });
    if (choice === "original") {
      return { file, metadata };
    }
    // Browsers without WebP encode support fall back to PNG in toBlob; trust
    // the blob's actual type so the upload content type stays accurate.
    const encodedType = encoded.type || MEDIA_WEBP_CONTENT_TYPE;
    return {
      file: new File(
        [encoded],
        encodedType === MEDIA_WEBP_CONTENT_TYPE ? webpFilename(file.name) : file.name,
        { type: encodedType, lastModified: file.lastModified },
      ),
      metadata: { width: target.width, height: target.height },
    };
  } finally {
    decoded.cleanup();
  }
}

export function useAttachmentUpload() {
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const claimUploadedStorage = useMutation(api.attachments.claimUploadedStorage);

  const upload = async (originalFile: File): Promise<AttachmentInput> => {
    if (originalFile.size === 0) throw new Error("Media files cannot be empty.");
    const contentType = originalFile.type || "application/octet-stream";
    const initialKind = getMediaKind(contentType);
    if (!initialKind) {
      throw new Error(UNSUPPORTED_MEDIA_MESSAGE);
    }
    const preliminaryDecision = decideMediaFile({
      contentType,
      size: originalFile.size,
    });
    if (!preliminaryDecision.accepted) throw new Error(preliminaryDecision.reason);
    const initialMetadata = initialKind === "file"
      ? {}
      : await loadMediaMetadata(originalFile, initialKind);
    const initialDecision = decideMediaFile({
      contentType,
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
    // Optimization may swap the content type (JPEG/PNG → WebP), so all
    // downstream metadata follows the file actually being uploaded. The server
    // verifies the claimed content type against the stored blob's.
    const finalContentType = optimized.file.type || contentType;
    const finalDecision = decideMediaFile({
      contentType: finalContentType,
      size: optimized.file.size,
      ...optimized.metadata,
    });
    if (!finalDecision.accepted || optimized.file.size > finalDecision.maxBytes) {
      throw new Error(`The optimized image is still larger than ${formatMediaSize(MEDIA_MAX_IMAGE_BYTES)}.`);
    }

    const { postUrl, uploadToken } = await generateUploadUrl({});
    const response = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": finalContentType },
      body: optimized.file,
    });
    if (!response.ok) throw new Error("Upload failed. Try again.");
    const payload: unknown = await response.json();
    if (!isStorageUploadResponse(payload)) throw new Error("Upload returned an invalid response.");
    await claimUploadedStorage({ uploadToken, storageId: payload.storageId });

    return {
      storageId: payload.storageId,
      uploadToken,
      filename: optimized.file.name,
      contentType: finalContentType,
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
