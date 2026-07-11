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
export const MEDIA_OPTIMIZE_ABOVE_BYTES = 4 * 1024 * 1024;
export const MEDIA_MAX_IMAGE_DIMENSION = 2560;

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
      (input.size > MEDIA_OPTIMIZE_ABOVE_BYTES ||
        longestSide > MEDIA_MAX_IMAGE_DIMENSION),
    maxBytes,
  };
}
