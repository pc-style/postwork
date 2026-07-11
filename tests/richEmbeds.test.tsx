import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RichEmbedList } from "../src/components/RichEmbedList";
import {
  buildRichPreview,
  extractUrls,
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
});

describe("rich embed rendering", () => {
  test("renders trusted iframes with security and accessibility constraints", () => {
    const html = renderToStaticMarkup(<RichEmbedList text="https://youtu.be/dQw4w9WgXcQ" />);
    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(html).toContain('title="YouTube video"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation"');
  });

  test("never renders an iframe for an untrusted host", () => {
    const html = renderToStaticMarkup(<RichEmbedList text="https://example.com/embed/video" />);
    expect(html).not.toContain("<iframe");
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
