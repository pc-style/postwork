import { describe, expect, test } from "bun:test";
import {
  decideMediaFile,
  formatFileSize,
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_IMAGE_BYTES,
  MEDIA_MAX_FILENAME_CHARS,
  MEDIA_MAX_IMAGE_DIMENSION,
  MEDIA_MAX_VIDEO_BYTES,
  MEDIA_OPTIMIZE_MIN_BYTES,
  pickSmallerEncoding,
  targetImageDimensions,
  webpFilename,
} from "./media";

describe("media upload decisions", () => {
  test("formats file sizes for display", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  test("optimizes oversized still JPEG and PNG files", () => {
    expect(
      decideMediaFile({
        contentType: "image/jpeg",
        size: MEDIA_MAX_IMAGE_BYTES + 1,
        width: 5000,
        height: 3000,
      }),
    ).toMatchObject({ accepted: true, kind: "image", optimize: true });
    expect(
      decideMediaFile({
        contentType: "image/png",
        size: 1024,
        width: 3000,
        height: 2000,
      }),
    ).toMatchObject({ accepted: true, kind: "image", optimize: true });
  });

  test("optimizes ordinary still JPEG and PNG files for WebP re-encode", () => {
    expect(
      decideMediaFile({
        contentType: "image/jpeg",
        size: 2 * 1024 * 1024,
        width: 1600,
        height: 900,
      }),
    ).toMatchObject({ accepted: true, kind: "image", optimize: true });
  });

  test("skips optimization for tiny stills within the dimension cap", () => {
    expect(
      decideMediaFile({
        contentType: "image/png",
        size: MEDIA_OPTIMIZE_MIN_BYTES,
        width: 320,
        height: 240,
      }),
    ).toMatchObject({ accepted: true, kind: "image", optimize: false });
  });

  test("passes animation-capable image formats through unchanged", () => {
    expect(decideMediaFile({ contentType: "image/gif", size: 1024 })).toMatchObject({
      accepted: true,
      kind: "image",
      optimize: false,
    });
    expect(
      decideMediaFile({ contentType: "image/webp", size: 1024, width: 5000 }),
    ).toMatchObject({ accepted: true, kind: "image", optimize: false });
  });

  test("accepts supported video without browser transcoding", () => {
    expect(
      decideMediaFile({ contentType: "video/mp4", size: MEDIA_MAX_VIDEO_BYTES }),
    ).toEqual({
      accepted: true,
      kind: "video",
      optimize: false,
      maxBytes: MEDIA_MAX_VIDEO_BYTES,
    });
  });

  test("accepts generic files unchanged and normalizes an empty content type", () => {
    expect(decideMediaFile({ contentType: "application/pdf", size: 1024 })).toEqual({
      accepted: true,
      kind: "file",
      optimize: false,
      maxBytes: MEDIA_MAX_FILE_BYTES,
    });
    expect(decideMediaFile({ contentType: "", size: 1024 })).toMatchObject({
      accepted: true,
      kind: "file",
      optimize: false,
    });
  });

  test("rejects generic files over 25 MB", () => {
    expect(
      decideMediaFile({ contentType: "application/zip", size: MEDIA_MAX_FILE_BYTES + 1 }),
    ).toMatchObject({ accepted: false });
  });

  test("rejects over-limit animation and video", () => {
    expect(
      decideMediaFile({ contentType: "image/gif", size: MEDIA_MAX_IMAGE_BYTES + 1 }),
    ).toMatchObject({ accepted: false });
    expect(
      decideMediaFile({ contentType: "video/webm", size: MEDIA_MAX_VIDEO_BYTES + 1 }),
    ).toMatchObject({ accepted: false });
    expect(decideMediaFile({ contentType: "video/quicktime", size: 1024 })).toMatchObject({
      accepted: true,
      kind: "file",
    });
    expect(
      decideMediaFile({ contentType: "image/png", size: 0 }),
    ).toMatchObject({ accepted: false, reason: "Media files cannot be empty." });
  });
});

describe("image re-encode helpers", () => {
  test("downscales the long edge to the cap while preserving aspect ratio", () => {
    expect(targetImageDimensions(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(targetImageDimensions(1500, 4500)).toEqual({
      width: Math.round(1500 * (MEDIA_MAX_IMAGE_DIMENSION / 4500)),
      height: 2000,
    });
  });

  test("never upscales or produces zero dimensions", () => {
    expect(targetImageDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetImageDimensions(1, 6000)).toEqual({ width: 1, height: 2000 });
    expect(targetImageDimensions(0, 0)).toEqual({ width: 1, height: 1 });
  });

  test("keeps the original only when it is smaller and within the size cap", () => {
    expect(
      pickSmallerEncoding({ originalBytes: 100, encodedBytes: 80, originalFits: true }),
    ).toBe("encoded");
    expect(
      pickSmallerEncoding({ originalBytes: 100, encodedBytes: 100, originalFits: true }),
    ).toBe("original");
    expect(
      pickSmallerEncoding({ originalBytes: 100, encodedBytes: 120, originalFits: false }),
    ).toBe("encoded");
  });

  test("renames re-encoded files with a .webp extension", () => {
    expect(webpFilename("photo.JPEG")).toBe("photo.webp");
    expect(webpFilename("archive.tar.png")).toBe("archive.tar.webp");
    expect(webpFilename("noextension")).toBe("noextension.webp");
  });

  test("keeps renamed files within the server's 200-char filename limit", () => {
    const longStem = "a".repeat(196);
    const input = `${longStem}.jpg`; // exactly 200 chars, the schema max
    const output = webpFilename(input);
    expect(input.length).toBe(MEDIA_MAX_FILENAME_CHARS);
    expect(output.length).toBeLessThanOrEqual(MEDIA_MAX_FILENAME_CHARS);
    expect(output).toBe(`${"a".repeat(195)}.webp`);
    expect(webpFilename("b".repeat(200))).toBe(`${"b".repeat(195)}.webp`);
  });
});
