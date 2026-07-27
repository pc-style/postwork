/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { normalizePreviewUrl, parseOpenGraph } from "./linkPreviews";

const modules = import.meta.glob("./**/*.ts");

describe("link previews", () => {
  test("requests are normalized, deduplicated, stored, and returned", async () => {
    const t = convexTest(schema, modules);
    const url = "https://example.com/article";

    await t.mutation(api.linkPreviews.request, { urls: [`${url}#intro`, url] });
    await t.mutation(api.linkPreviews.request, { urls: [url] });

    const pending = await t.query(api.linkPreviews.get, { urls: [url] });
    const scheduled = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").take(10));
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ url, status: "pending" });
    expect(scheduled).toHaveLength(1);

    await t.mutation(internal.linkPreviews.storePreview, {
      url,
      status: "ok",
      title: "A useful article",
      description: "The useful part.",
      imageUrl: "https://example.com/cover.jpg",
      siteName: "Example",
    });
    const stored = await t.query(api.linkPreviews.get, { urls: [url] });
    expect(stored[0]).toMatchObject({ status: "ok", title: "A useful article", siteName: "Example" });
  });

  test("rejects private and credential-bearing URLs", async () => {
    const t = convexTest(schema, modules);
    for (const url of [
      "http://localhost/admin",
      "http://127.0.0.1/",
      "http://10.2.3.4/",
      "http://172.20.1.1/",
      "http://192.168.1.2/",
      "https://user:password@example.com/",
    ]) {
      expect(normalizePreviewUrl(url)).toBeNull();
      await expect(t.mutation(api.linkPreviews.request, { urls: [url] })).rejects.toThrow("Invalid or unsafe");
    }
  });

  test("parses OpenGraph fields, title fallback, and safe relative images", () => {
    expect(parseOpenGraph(`
      <html><head>
        <title>Fallback title</title>
        <meta content="Postwork &amp; friends" property="og:title">
        <meta property="og:description" content="A durable team record.">
        <meta property="og:image" content="/preview.jpg">
        <meta property="og:site_name" content="Example Site">
      </head></html>
    `, "https://example.com/posts/one")).toEqual({
      title: "Postwork & friends",
      description: "A durable team record.",
      imageUrl: "https://example.com/preview.jpg",
      siteName: "Example Site",
    });
    expect(parseOpenGraph("<title>Only a title</title><meta property='og:image' content='http://example.com/a.jpg'>", "https://example.com")).toEqual({
      title: "Only a title",
      description: undefined,
      imageUrl: undefined,
      siteName: undefined,
    });
  });
});
