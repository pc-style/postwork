import { describe, expect, test } from "bun:test";
import {
  clampFilename,
  decideMediaFile,
  formatFileSize,
  MEDIA_MAX_FILE_BYTES,
  MEDIA_MAX_IMAGE_BYTES,
  MEDIA_MAX_FILENAME_CHARS,
  MEDIA_MAX_IMAGE_DIMENSION,
  MEDIA_MAX_VIDEO_BYTES,
  MEDIA_OPTIMIZE_MIN_BYTES,
  pickSmallerEncoding,
  pngFilename,
  readJpegOrientation,
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

  test("renames PNG fallback encodes with a .png extension within the limit", () => {
    expect(pngFilename("photo.jpg")).toBe("photo.png");
    expect(pngFilename("noextension")).toBe("noextension.png");
    expect(pngFilename("c".repeat(250))).toBe(`${"c".repeat(196)}.png`);
  });
});

describe("clampFilename", () => {
  test("passes names within the limit through unchanged", () => {
    expect(clampFilename("photo.jpg")).toBe("photo.jpg");
    expect(clampFilename("a".repeat(MEDIA_MAX_FILENAME_CHARS))).toBe(
      "a".repeat(MEDIA_MAX_FILENAME_CHARS),
    );
  });

  test("truncates over-long names while preserving the extension", () => {
    const clamped = clampFilename(`${"a".repeat(300)}.jpeg`);
    expect(clamped.length).toBe(MEDIA_MAX_FILENAME_CHARS);
    expect(clamped).toBe(`${"a".repeat(195)}.jpeg`);
  });

  test("truncates extensionless and pathological names to the limit", () => {
    expect(clampFilename("b".repeat(300))).toBe("b".repeat(MEDIA_MAX_FILENAME_CHARS));
    const clampedDotName = clampFilename(`.${"c".repeat(300)}`);
    expect(clampedDotName.length).toBe(MEDIA_MAX_FILENAME_CHARS);
  });
});

describe("readJpegOrientation", () => {
  /**
   * Minimal JPEG: SOI, one APP1 segment holding "Exif\0\0" plus a TIFF
   * header whose IFD0 has a single 0x0112 (orientation) entry.
   */
  function craftJpeg(orientation: number, littleEndian = false): ArrayBuffer {
    const buffer = new ArrayBuffer(38);
    const view = new DataView(buffer);
    view.setUint16(0, 0xffd8); // SOI
    view.setUint16(2, 0xffe1); // APP1 marker
    view.setUint16(4, 34); // segment size (includes these two bytes)
    for (const [i, byte] of [0x45, 0x78, 0x69, 0x66, 0, 0].entries()) {
      view.setUint8(6 + i, byte); // "Exif\0\0"
    }
    const tiff = 12;
    view.setUint16(tiff, littleEndian ? 0x4949 : 0x4d4d); // "II" or "MM"
    view.setUint16(tiff + 2, 0x002a, littleEndian);
    view.setUint32(tiff + 4, 8, littleEndian); // IFD0 offset
    view.setUint16(tiff + 8, 1, littleEndian); // one IFD entry
    const entry = tiff + 10;
    view.setUint16(entry, 0x0112, littleEndian); // orientation tag
    view.setUint16(entry + 2, 3, littleEndian); // SHORT
    view.setUint32(entry + 4, 1, littleEndian); // count
    view.setUint16(entry + 8, orientation, littleEndian); // inline value
    view.setUint32(entry + 12, 0, littleEndian); // no next IFD
    return buffer;
  }

  test("reads the orientation tag in both byte orders", () => {
    expect(readJpegOrientation(craftJpeg(6))).toBe(6);
    expect(readJpegOrientation(craftJpeg(8))).toBe(8);
    expect(readJpegOrientation(craftJpeg(3, true))).toBe(3);
  });

  test("returns 1 for upright and out-of-range values", () => {
    expect(readJpegOrientation(craftJpeg(1))).toBe(1);
    expect(readJpegOrientation(craftJpeg(9))).toBe(1);
    expect(readJpegOrientation(craftJpeg(0))).toBe(1);
  });

  test("returns 1 for non-JPEG, truncated, and EXIF-less buffers", () => {
    expect(readJpegOrientation(new ArrayBuffer(0))).toBe(1);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(readJpegOrientation(png.buffer)).toBe(1);
    expect(readJpegOrientation(craftJpeg(6).slice(0, 20))).toBe(1);
    // SOI followed immediately by start-of-scan: no EXIF segment at all.
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]);
    expect(readJpegOrientation(bare.buffer)).toBe(1);
  });
});
