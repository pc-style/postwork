import { describe, expect, test } from "bun:test";
import {
  decideMediaFile,
  formatFileSize,
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_IMAGE_BYTES,
  MEDIA_MAX_VIDEO_BYTES,
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
