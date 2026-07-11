import { describe, expect, test } from "vitest";
import { attachmentInputSchema, LIMITS } from "./validation";

const base = {
  storageId: "storage-id",
  filename: "demo.mp4",
  contentType: "video/mp4" as const,
  mediaKind: "video" as const,
  size: 1024,
};

describe("attachment metadata validation", () => {
  test("accepts video metadata within the video limit", () => {
    expect(attachmentInputSchema.safeParse(base).success).toBe(true);
  });

  test("rejects a mismatched media kind", () => {
    expect(
      attachmentInputSchema.safeParse({ ...base, mediaKind: "image" }).success,
    ).toBe(false);
  });

  test("applies image and video size limits independently", () => {
    expect(
      attachmentInputSchema.safeParse({
        ...base,
        size: LIMITS.ATTACHMENT_MAX_VIDEO_BYTES + 1,
      }).success,
    ).toBe(false);
    expect(
      attachmentInputSchema.safeParse({
        ...base,
        filename: "demo.gif",
        contentType: "image/gif",
        mediaKind: "image",
        size: LIMITS.ATTACHMENT_MAX_IMAGE_BYTES + 1,
      }).success,
    ).toBe(false);
  });
});
