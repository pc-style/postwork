import {
  formatFileSize,
  formatMediaSize,
  getMediaKind,
  MEDIA_ALLOWED_TYPES,
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_IMAGE_BYTES,
  MEDIA_MAX_PER_MESSAGE,
  MEDIA_MAX_VIDEO_BYTES,
  UNSUPPORTED_MEDIA_MESSAGE,
  type MediaContentType,
  type MediaKind,
} from "../../convex/lib/mediaPolicy";

export {
  formatFileSize,
  formatMediaSize,
  getMediaKind,
  MEDIA_ALLOWED_TYPES,
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_IMAGE_BYTES,
  MEDIA_MAX_PER_MESSAGE,
  MEDIA_MAX_VIDEO_BYTES,
  UNSUPPORTED_MEDIA_MESSAGE,
  type MediaContentType,
  type MediaKind,
};

export const MEDIA_MAX_SOURCE_IMAGE_BYTES = 40 * 1024 * 1024;
/** Below this size, a WebP re-encode rarely wins enough bytes to matter. */
export const MEDIA_OPTIMIZE_MIN_BYTES = 16 * 1024;
export const MEDIA_MAX_IMAGE_DIMENSION = 2000;
/** Lossy WebP quality used when re-encoding still images at upload time. */
export const MEDIA_WEBP_QUALITY = 0.82;
export const MEDIA_WEBP_CONTENT_TYPE = "image/webp";

const SAFE_OPTIMIZATION_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
]);

export type MediaFileDecision =
  | { accepted: true; kind: MediaKind; optimize: boolean; maxBytes: number }
  | { accepted: false; reason: string };

export function decideMediaFile(input: {
  contentType: string;
  size: number;
  width?: number;
  height?: number;
}): MediaFileDecision {
  if (input.size === 0) {
    return { accepted: false, reason: "Media files cannot be empty." };
  }
  const contentType = input.contentType || "application/octet-stream";
  const kind = getMediaKind(contentType);
  if (!kind) {
    return {
      accepted: false,
      reason: UNSUPPORTED_MEDIA_MESSAGE,
    };
  }

  const maxBytes = kind === "image"
    ? MEDIA_MAX_IMAGE_BYTES
    : kind === "video"
      ? MEDIA_MAX_VIDEO_BYTES
      : MEDIA_MAX_FILE_BYTES;
  if (kind === "file") {
    return input.size <= maxBytes
      ? { accepted: true, kind, optimize: false, maxBytes }
      : { accepted: false, reason: `Files must be ${formatMediaSize(maxBytes)} or smaller.` };
  }
  if (kind === "video") {
    return input.size <= maxBytes
      ? { accepted: true, kind, optimize: false, maxBytes }
      : { accepted: false, reason: `Videos must be ${formatMediaSize(maxBytes)} or smaller.` };
  }

  const safeToOptimize = SAFE_OPTIMIZATION_TYPES.has(contentType);
  if (input.size > maxBytes && !safeToOptimize) {
    return {
      accepted: false,
      reason: `GIF and WebP files must be ${formatMediaSize(maxBytes)} or smaller and are uploaded unchanged.`,
    };
  }
  if (input.size > MEDIA_MAX_SOURCE_IMAGE_BYTES) {
    return {
      accepted: false,
      reason: `Images must be ${formatMediaSize(MEDIA_MAX_SOURCE_IMAGE_BYTES)} or smaller before optimization.`,
    };
  }

  const longestSide = Math.max(input.width ?? 0, input.height ?? 0);
  return {
    accepted: true,
    kind,
    optimize:
      safeToOptimize &&
      (input.size > MEDIA_OPTIMIZE_MIN_BYTES ||
        longestSide > MEDIA_MAX_IMAGE_DIMENSION),
    maxBytes,
  };
}

/**
 * Scale a source image so its longest edge fits `maxDimension`, preserving
 * aspect ratio. Never upscales.
 */
export function targetImageDimensions(
  width: number,
  height: number,
  maxDimension: number = MEDIA_MAX_IMAGE_DIMENSION,
): { width: number; height: number } {
  const longestSide = Math.max(width, height);
  const scale = longestSide > 0 ? Math.min(1, maxDimension / longestSide) : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * After re-encoding, upload whichever variant is smaller. The original is only
 * eligible when it fits the hard byte cap on its own; otherwise the re-encode
 * is the only path to an acceptable upload.
 */
export function pickSmallerEncoding(input: {
  originalBytes: number;
  encodedBytes: number;
  originalFits: boolean;
}): "original" | "encoded" {
  if (!input.originalFits) return "encoded";
  return input.encodedBytes < input.originalBytes ? "encoded" : "original";
}

/** Swap (or append) the file extension to match a `image/webp` re-encode. */
export function webpFilename(filename: string): string {
  const stem = filename.replace(/\.[^./\\]+$/, "");
  return `${stem || filename}.webp`;
}
