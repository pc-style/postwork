/**
 * Runtime-neutral attachment policy shared by the browser and Convex.
 * Keep this free of framework imports so both bundles enforce the same rules.
 */
export const MEDIA_ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
] as const;

export type MediaContentType = (typeof MEDIA_ALLOWED_TYPES)[number];
export type MediaKind = "image" | "video" | "file";

export const MEDIA_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MEDIA_MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MEDIA_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MEDIA_MAX_PER_MESSAGE = 8;
export const UNSUPPORTED_MEDIA_MESSAGE =
  "Choose an image up to 10 MB, a video up to 50 MB, or a file up to 25 MB.";

export function getMediaKind(contentType: string): MediaKind | null {
  if (!contentType.trim()) return null;
  if (!(MEDIA_ALLOWED_TYPES as readonly string[]).includes(contentType)) return "file";
  return contentType.startsWith("video/") ? "video" : "image";
}

export function mediaMaxBytes(contentType: string): number | null {
  const kind = getMediaKind(contentType);
  if (!kind) return null;
  if (kind === "video") return MEDIA_MAX_VIDEO_BYTES;
  return kind === "image" ? MEDIA_MAX_IMAGE_BYTES : MEDIA_MAX_FILE_BYTES;
}

export function formatMediaSize(bytes: number): string {
  return `${bytes / (1024 * 1024)} MB`;
}
