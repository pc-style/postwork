import { describe, expect, test } from "bun:test";
import {
  decideMediaFile,
  MEDIA_MAX_IMAGE_BYTES,
  MEDIA_MAX_VIDEO_BYTES,
} from "./media";

describe("media upload decisions", () => {
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

  test("rejects over-limit animation and video plus unsupported types", () => {
    expect(
      decideMediaFile({ contentType: "image/gif", size: MEDIA_MAX_IMAGE_BYTES + 1 }),
    ).toMatchObject({ accepted: false });
    expect(
      decideMediaFile({ contentType: "video/webm", size: MEDIA_MAX_VIDEO_BYTES + 1 }),
    ).toMatchObject({ accepted: false });
    expect(
      decideMediaFile({ contentType: "video/quicktime", size: 1024 }),
    ).toMatchObject({ accepted: false });
  });
});

