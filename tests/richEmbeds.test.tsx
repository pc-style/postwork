import { describe, expect, test } from "bun:test";
import { MAX_RICH_PREVIEWS_PER_BODY, RichEmbedList } from "../src/components/RichEmbedList";
import {
  buildRichPreview,
  extractUrls,
  isTrustedGifUrl,
  matchTrustedEmbed,
} from "../src/lib/richEmbeds";

describe("rich embed URL parsing", () => {
  test("extracts unique URLs and trims prose punctuation", () => {
    expect(extractUrls("See https://example.com/a, then (https://youtu.be/dQw4w9WgXcQ). https://example.com/a")).toEqual([
      "https://example.com/a",
      "https://youtu.be/dQw4w9WgXcQ",
    ]);
  });

  test("ignores URLs inside code", () => {
    expect(extractUrls("`https://inline.test`\n```txt\nhttps://block.test\n```\nhttps://kept.test")).toEqual([
      "https://kept.test/",
    ]);
  });

  test("ignores URLs in an unfinished code fence through end of input", () => {
    expect(extractUrls("Before\n```txt\nhttps://block.test\nhttps://still-code.test")).toEqual([]);
  });
});

describe("direct video-file URLs", () => {
  test.each([
    ["https://bucket.example.com/clips/demo.mp4", "video/mp4"],
    ["https://cdn.example.com/screen.WEBM", "video/webm"],
  ])("previews %s as a native video", (source, contentType) => {
    const preview = buildRichPreview(source);
    expect(preview?.kind).toBe("video");
    if (preview?.kind === "video") {
      expect(preview.contentType).toBe(contentType);
      expect(preview.sourceUrl).toBe(new URL(source).toString());
    }
  });

  test("insecure or non-video URLs stay plain links", () => {
    expect(buildRichPreview("http://bucket.example.com/demo.mp4")?.kind).toBe("link");
    expect(buildRichPreview("https://bucket.example.com/demo.mov")?.kind).toBe("link");
    expect(buildRichPreview("https://bucket.example.com/page?file=demo.mp4")?.kind).toBe("link");
  });
});

describe("trusted provider normalization", () => {
  test.each([
    ["https://youtu.be/dQw4w9WgXcQ?t=10", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://vimeo.com/76979871", "vimeo", "https://player.vimeo.com/video/76979871"],
    ["https://www.loom.com/share/1234567890abcdef", "loom", "https://www.loom.com/embed/1234567890abcdef"],
    ["https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=x", "spotify", "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT"],
  ])("normalizes %s", (source, provider, expected) => {
    const embed = matchTrustedEmbed(source);
    expect(embed?.provider).toBe(provider);
    expect(embed?.embedUrl).toBe(expected);
  });

  test("uses Figma's official embed URL and keeps only a safe node id", () => {
    const embed = matchTrustedEmbed("https://www.figma.com/design/AbCdEf1234/name?node-id=1-2&evil=yes");
    expect(embed?.provider).toBe("figma");
    expect(embed?.embedUrl).toContain("https%3A%2F%2Fwww.figma.com%2Fdesign%2FAbCdEf1234%3Fnode-id%3D1-2");
    expect(embed?.embedUrl).not.toContain("evil");
  });

  test.each([
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=too-short",
    "https://user:pass@vimeo.com/76979871",
    "https://www.loom.com:444/share/1234567890abcdef",
    "javascript:alert(1)",
  ])("rejects unsafe or malformed embed source %s", (source) => {
    expect(matchTrustedEmbed(source)).toBeNull();
  });

  test("keeps non-allowlisted URLs as links", () => {
    expect(buildRichPreview("https://example.com/article?id=7")?.kind).toBe("link");
  });

  test.each([
    ["https://media0.giphy.com/media/one/giphy.gif", true],
    ["https://i.giphy.com/one.webp", true],
    ["https://media0.giphy.com/media/one/giphy.mp4", false],
    ["https://media0.giphy.com/media/one/metadata.json", false],
    ["https://media0.giphy.com/media/one/", false],
  ])("accepts only image resources from trusted Giphy hosts: %s", (url, expected) => {
    expect(isTrustedGifUrl(url)).toBe(expected);
  });

  test("previews a Giphy MP4 as a native video", () => {
    expect(buildRichPreview("https://media0.giphy.com/media/one/giphy.mp4")?.kind).toBe("video");
  });
});

describe("rich embed rendering", () => {
  test("renders trusted iframes with security and accessibility constraints", () => {
    const list = RichEmbedList({ text: "https://youtu.be/dQw4w9WgXcQ" });
    const iframe = list?.props.children[0].props.children;
    expect(iframe.props.src).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(iframe.props.title).toBe("YouTube video");
    expect(iframe.props.loading).toBe("lazy");
    expect(iframe.props.referrerPolicy).toBe("strict-origin-when-cross-origin");
    expect(iframe.props.sandbox).toBe("allow-scripts allow-same-origin allow-presentation");
  });

  test("never renders an iframe for an untrusted host", () => {
    const list = RichEmbedList({ text: "https://example.com/embed/video" });
    const link = list?.props.children[0];
    expect(link.type).toBe("a");
    expect(link.props.rel).toBe("noopener noreferrer");
  });

  test("caps rendered previews per body", () => {
    const list = RichEmbedList({
      text: [
        "https://youtu.be/dQw4w9WgXcQ",
        "https://youtu.be/9bZkp7q19f0",
        "https://youtu.be/3JZ_D3ELwOQ",
        "https://youtu.be/kJQP7kiw5Fk",
      ].join("\n"),
    });

    expect(list?.props.children).toHaveLength(MAX_RICH_PREVIEWS_PER_BODY);
    expect(list?.props.children.at(-1).props.children.props.src).not.toContain("kJQP7kiw5Fk");
  });
});
