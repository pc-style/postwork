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
});
