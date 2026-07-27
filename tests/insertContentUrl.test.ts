import { describe, expect, test } from "bun:test";
import { insertContentUrl } from "../src/lib/insertContentUrl";

describe("insertContentUrl", () => {
  test("inserts a URL on its own line at the cursor", () => {
    expect(insertContentUrl("beforeafter", 6, 6, "https://example.com/gif")).toEqual({
      value: "before\nhttps://example.com/gif\nafter",
      cursor: 31,
    });
  });

  test("replaces a selection without adding redundant newlines", () => {
    expect(insertContentUrl("before\nold\nafter", 7, 10, "https://example.com/gif").value).toBe(
      "before\nhttps://example.com/gif\nafter",
    );
  });

  test("leaves a continuation line after an end-of-draft insertion", () => {
    expect(insertContentUrl("draft", 5, 5, "https://media.giphy.com/media/abc/giphy.gif")).toEqual({
      value: "draft\nhttps://media.giphy.com/media/abc/giphy.gif\n",
      cursor: 50,
    });
  });
});
