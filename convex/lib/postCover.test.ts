import { describe, expect, test } from "bun:test";
import {
  directImageCoverUrl,
  extractBodyUrls,
  youtubeThumbnailUrl,
} from "./postCover";

describe("extractBodyUrls", () => {
  test("returns leading urls in order, deduped and trimmed", () => {
    const body =
      "see https://example.com/a. and again https://example.com/a plus https://example.com/b";
    expect(extractBodyUrls(body, 3)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  test("ignores urls inside code spans and fences", () => {
    const body =
      "`https://inline.example` and\n```\nhttps://fenced.example\n```\nhttps://kept.example";
    expect(extractBodyUrls(body, 3)).toEqual(["https://kept.example/"]);
  });

  test("caps the number of urls returned", () => {
    const body = "https://a.example https://b.example https://c.example";
    expect(extractBodyUrls(body, 2)).toHaveLength(2);
  });
});

describe("youtubeThumbnailUrl", () => {
  test("derives a thumbnail from watch, short, and shorts urls", () => {
    const expected = "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg";
    expect(youtubeThumbnailUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(expected);
    expect(youtubeThumbnailUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(expected);
    expect(youtubeThumbnailUrl("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(expected);
  });

  test("rejects non-youtube hosts and malformed ids", () => {
    expect(youtubeThumbnailUrl("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeThumbnailUrl("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(youtubeThumbnailUrl("not a url")).toBeNull();
  });
});

describe("directImageCoverUrl", () => {
  test("accepts trusted giphy image urls only", () => {
    expect(directImageCoverUrl("https://media2.giphy.com/media/abc/giphy.gif")).toBe(
      "https://media2.giphy.com/media/abc/giphy.gif",
    );
    expect(directImageCoverUrl("https://i.giphy.com/abc.webp")).toBe(
      "https://i.giphy.com/abc.webp",
    );
    expect(directImageCoverUrl("http://media2.giphy.com/media/abc/giphy.gif")).toBeNull();
    expect(directImageCoverUrl("https://example.com/a.gif")).toBeNull();
    expect(directImageCoverUrl("https://media2.giphy.com/media/abc/giphy.mp4")).toBeNull();
  });
});
