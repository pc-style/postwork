import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Id } from "../../convex/_generated/dataModel";
import type { AttachmentWithUrl } from "../lib/types";
import { AttachmentMedia } from "./AttachmentGallery";

function attachment(
  mediaKind: "image" | "video",
  contentType: string,
): AttachmentWithUrl {
  return {
    _id: "attachment" as Id<"postAttachments">,
    postId: "post" as Id<"posts">,
    replyId: undefined,
    filename: mediaKind === "video" ? "demo.mp4" : "demo.gif",
    contentType,
    mediaKind,
    size: 1024,
    width: 640,
    height: 360,
    durationMs: mediaKind === "video" ? 1200 : undefined,
    uploadedBy: "user" as Id<"users">,
    createdAt: 1,
    url: `https://example.test/demo.${mediaKind === "video" ? "mp4" : "gif"}`,
  };
}

describe("attachment media rendering", () => {
  test("renders playable video inline", () => {
    const html = renderToStaticMarkup(
      <AttachmentMedia attachment={attachment("video", "video/mp4")} />,
    );
    expect(html).toContain("<video");
    expect(html).toContain("controls=\"\"");
    expect(html).toContain("playsInline=\"\"");
    expect(html).toContain("type=\"video/mp4\"");
  });

  test("renders GIF as an image so browser animation is preserved", () => {
    const html = renderToStaticMarkup(
      <AttachmentMedia attachment={attachment("image", "image/gif")} />,
    );
    expect(html).toContain("<img");
    expect(html).toContain("demo.gif");
    expect(html).not.toContain("<video");
  });
});

