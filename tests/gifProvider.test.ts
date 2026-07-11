import { describe, expect, test } from "bun:test";
import { createGiphyProvider } from "../src/lib/gifProvider";

describe("Giphy provider", () => {
  test("has a friendly unconfigured boundary", async () => {
    const provider = createGiphyProvider(undefined);
    expect(provider.configured).toBe(false);
    await expect(provider.search("hello")).rejects.toThrow("isn't configured");
  });

  test("encodes searches and returns only trusted image URLs", async () => {
    let requested = "";
    const provider = createGiphyProvider("test-key", async (input) => {
      requested = input.toString();
      return Response.json({
        data: [
          {
            id: "one",
            title: "Ship it",
            images: {
              fixed_width: { url: "https://media0.giphy.com/media/one/200w.gif" },
              original: { url: "https://media0.giphy.com/media/one/giphy.gif" },
            },
          },
          {
            id: "bad",
            title: "Untrusted",
            images: {
              fixed_width: { url: "https://evil.test/preview.gif" },
              original: { url: "https://evil.test/original.gif" },
            },
          },
        ],
      });
    });

    const results = await provider.search("ship it");
    expect(requested).toContain("q=ship+it");
    expect(requested).toContain("api_key=test-key");
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("Ship it");
  });

  test("surfaces provider failures without exposing response content", async () => {
    const provider = createGiphyProvider("test-key", async () => new Response("secret", { status: 500 }));
    await expect(provider.search("hello")).rejects.toThrow("unavailable");
  });

  test("surfaces malformed successful responses as a friendly provider failure", async () => {
    const provider = createGiphyProvider("test-key", async () => new Response("not JSON"));
    await expect(provider.search("hello")).rejects.toThrow("GIF search is unavailable right now.");
  });
});
