export const MEDIA_ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
] as const;

export type MediaContentType = (typeof MEDIA_ALLOWED_TYPES)[number];
export type MediaKind = "image" | "video";

export const MEDIA_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MEDIA_MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MEDIA_MAX_SOURCE_IMAGE_BYTES = 40 * 1024 * 1024;
export const MEDIA_OPTIMIZE_ABOVE_BYTES = 4 * 1024 * 1024;
export const MEDIA_MAX_IMAGE_DIMENSION = 2560;
export const MEDIA_MAX_PER_MESSAGE = 8;

const SAFE_OPTIMIZATION_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
]);

export type MediaFileDecision =
  | { accepted: true; kind: MediaKind; optimize: boolean; maxBytes: number }
  | { accepted: false; reason: string };

export function getMediaKind(contentType: string): MediaKind | null {
  if (contentType.startsWith("image/")) {
    return MEDIA_ALLOWED_TYPES.includes(contentType as MediaContentType)
      ? "image"
      : null;
  }
  if (contentType.startsWith("video/")) {
    return MEDIA_ALLOWED_TYPES.includes(contentType as MediaContentType)
      ? "video"
      : null;
  }
  return null;
}

export function decideMediaFile(input: {
  contentType: string;
  size: number;
  width?: number;
  height?: number;
}): MediaFileDecision {
  const kind = getMediaKind(input.contentType);
  if (!kind) {
    return {
      accepted: false,
      reason: "Choose a PNG, JPEG, GIF, WebP, MP4, or WebM file.",
    };
  }

  const maxBytes = kind === "image" ? MEDIA_MAX_IMAGE_BYTES : MEDIA_MAX_VIDEO_BYTES;
  if (kind === "video") {
    return input.size <= maxBytes
      ? { accepted: true, kind, optimize: false, maxBytes }
      : { accepted: false, reason: "Videos must be 50 MB or smaller." };
  }

  const safeToOptimize = SAFE_OPTIMIZATION_TYPES.has(input.contentType);
  if (input.size > maxBytes && !safeToOptimize) {
    return {
      accepted: false,
      reason: "GIF and WebP files must be 10 MB or smaller and are uploaded unchanged.",
    };
  }
  if (input.size > MEDIA_MAX_SOURCE_IMAGE_BYTES) {
    return {
      accepted: false,
      reason: "Images must be 40 MB or smaller before optimization.",
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

