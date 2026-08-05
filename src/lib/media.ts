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

/**
 * Mirrors the filename `.max(200)` in `attachmentInputSchema`
 * (convex/lib/validation.ts). Keep the two in sync — a longer name uploads
 * fine but is rejected when the post or reply is created.
 */
export const MEDIA_MAX_FILENAME_CHARS = 200;

function splitFilename(filename: string): { stem: string; extension: string } {
  const match = /\.[^./\\]+$/.exec(filename);
  if (!match || match.index === 0) return { stem: filename, extension: "" };
  return { stem: filename.slice(0, match.index), extension: match[0] };
}

/**
 * Swap (or append) the file extension, truncating the stem so the result
 * always fits the server's filename limit.
 */
function filenameWithExtension(filename: string, extension: string): string {
  const { stem } = splitFilename(filename);
  return `${stem.slice(0, MEDIA_MAX_FILENAME_CHARS - extension.length)}${extension}`;
}

/** Rename to match an `image/webp` re-encode. */
export function webpFilename(filename: string): string {
  return filenameWithExtension(filename, ".webp");
}

/** Rename to match the PNG fallback some browsers use when they cannot encode WebP. */
export function pngFilename(filename: string): string {
  return filenameWithExtension(filename, ".png");
}

/**
 * Truncate any filename to the server limit, preserving the extension when
 * possible. Names within the limit pass through unchanged. Applied to every
 * upload so an over-long original name cannot upload fine and then fail
 * validation at post or reply creation.
 */
export function clampFilename(filename: string): string {
  if (filename.length <= MEDIA_MAX_FILENAME_CHARS) return filename;
  const { stem, extension } = splitFilename(filename);
  if (extension.length >= MEDIA_MAX_FILENAME_CHARS) {
    return filename.slice(0, MEDIA_MAX_FILENAME_CHARS);
  }
  return `${stem.slice(0, MEDIA_MAX_FILENAME_CHARS - extension.length)}${extension}`;
}

/**
 * Read the EXIF orientation (tag 0x0112) from a JPEG buffer. Returns 1 (the
 * "upright" default) when the buffer is not a JPEG, has no EXIF segment, or
 * the tag is missing or malformed. Used by the canvas fallback decode path,
 * where older browsers ignore orientation when drawing an `<img>`.
 */
export function readJpegOrientation(buffer: ArrayBuffer): number {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      const size = view.getUint16(offset + 2);
      if ((marker & 0xff00) !== 0xff00 || size < 2) return 1;
      if (marker === 0xffda) return 1; // start of scan; no EXIF ahead
      if (marker === 0xffe1 && offset + 4 + 6 <= view.byteLength) {
        const exif = offset + 4;
        const hasExifHeader =
          view.getUint32(exif) === 0x45786966 && view.getUint16(exif + 4) === 0; // "Exif\0\0"
        if (hasExifHeader) {
          const tiff = exif + 6;
          if (tiff + 8 > view.byteLength) return 1;
          const byteOrder = view.getUint16(tiff);
          const littleEndian = byteOrder === 0x4949; // "II"
          if (!littleEndian && byteOrder !== 0x4d4d) return 1; // not "MM"
          if (view.getUint16(tiff + 2, littleEndian) !== 0x002a) return 1;
          const ifd = tiff + view.getUint32(tiff + 4, littleEndian);
          if (ifd + 2 > view.byteLength) return 1;
          const entryCount = view.getUint16(ifd, littleEndian);
          for (let i = 0; i < entryCount; i++) {
            const entry = ifd + 2 + i * 12;
            if (entry + 12 > view.byteLength) return 1;
            if (view.getUint16(entry, littleEndian) === 0x0112) {
              const value = view.getUint16(entry + 8, littleEndian);
              return value >= 1 && value <= 8 ? value : 1;
            }
          }
          return 1;
        }
      }
      offset += 2 + size;
    }
    return 1;
  } catch {
    return 1;
  }
}
