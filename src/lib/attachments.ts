import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { isDemo } from "./demoMode";
import {
  clampFilename,
  decideMediaFile,
  formatMediaSize,
  getMediaKind,
  MEDIA_MAX_IMAGE_BYTES,
  MEDIA_WEBP_CONTENT_TYPE,
  MEDIA_WEBP_QUALITY,
  pickSmallerEncoding,
  pngFilename,
  readJpegOrientation,
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
  /** EXIF orientation (1-8) still to be applied when drawing; 1 = none. */
  orientation: number;
  cleanup: () => void;
};

/** Only the header segments matter for the orientation tag. */
const EXIF_SCAN_BYTES = 128 * 1024;

/**
 * Decode with EXIF orientation applied so the canvas re-encode never rotates
 * photos. `createImageBitmap` bakes the orientation into the pixel data. The
 * `<img>` fallback only runs on browsers without `createImageBitmap` - the
 * same older browsers (notably older iOS Safari) where canvas `drawImage`
 * ignores EXIF orientation - so there we read the JPEG orientation tag
 * ourselves and report it for the draw step to apply as a canvas transform.
 */
async function decodeStillImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        orientation: 1,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> decode path.
    }
  }
  // Orientation only exists in JPEG EXIF; other formats are always upright.
  let orientation = 1;
  if (file.type === "image/jpeg") {
    try {
      orientation = readJpegOrientation(
        await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer(),
      );
    } catch {
      // Unreadable header; treat as upright.
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
      orientation,
      cleanup: () => URL.revokeObjectURL(sourceUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(sourceUrl);
    throw error;
  }
}

/**
 * Set the canvas transform that maps a raw (unrotated) decode onto an
 * upright canvas of `width` x `height` for the given EXIF orientation.
 */
function applyOrientationTransform(
  context: CanvasRenderingContext2D,
  orientation: number,
  width: number,
  height: number,
): void {
  switch (orientation) {
    case 2:
      context.setTransform(-1, 0, 0, 1, width, 0);
      break;
    case 3:
      context.setTransform(-1, 0, 0, -1, width, height);
      break;
    case 4:
      context.setTransform(1, 0, 0, -1, 0, height);
      break;
    case 5:
      context.setTransform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      context.setTransform(0, 1, -1, 0, width, 0);
      break;
    case 7:
      context.setTransform(0, -1, -1, 0, width, height);
      break;
    case 8:
      context.setTransform(0, -1, 1, 0, 0, height);
      break;
    default:
      break;
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
    // Orientations 5-8 rotate by 90 degrees, so the upright image swaps axes.
    const swapAxes = decoded.orientation >= 5;
    const uprightWidth = swapAxes ? decoded.height : decoded.width;
    const uprightHeight = swapAxes ? decoded.width : decoded.height;
    const target = targetImageDimensions(uprightWidth, uprightHeight);
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image optimization is unavailable in this browser.");
    applyOrientationTransform(context, decoded.orientation, target.width, target.height);
    context.drawImage(
      decoded.source,
      0,
      0,
      swapAxes ? target.height : target.width,
      swapAxes ? target.width : target.height,
    );
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
    // the blob's actual type so the upload content type and extension stay
    // accurate instead of shipping PNG bytes under a .jpg name.
    const encodedType = encoded.type || MEDIA_WEBP_CONTENT_TYPE;
    const encodedName = encodedType === MEDIA_WEBP_CONTENT_TYPE
      ? webpFilename(file.name)
      : encodedType === "image/png"
        ? pngFilename(file.name)
        : file.name;
    return {
      file: new File([encoded], encodedName, {
        type: encodedType,
        lastModified: file.lastModified,
      }),
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
      // Clamp unconditionally: an over-long original name would upload fine
      // and then fail schema validation when the post or reply is created.
      filename: clampFilename(optimized.file.name),
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
