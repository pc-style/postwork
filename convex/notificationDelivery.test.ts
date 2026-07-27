/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import {
  DELIVERY_RETRY_WINDOW_MS,
  planProviderDispatch,
  renderNotificationEmail,
  sendResendEmail,
} from "./notificationDelivery";
import type { OutboundDeliveryCandidate } from "./notificationComposer";

const modules = import.meta.glob("./**/*.ts");

const candidates: OutboundDeliveryCandidate[] = [
  {
    kind: "immediate",
    items: [
      {
        postId: "post-1",
        title: "Urgent <release>",
        priority: "urgent",
        lastActivityAt: 1,
        unread: true,
      },
    ],
    omittedCount: 0,
  },
];

const config = {
  apiKey: "re_test",
  from: "Postwork <notifications@example.com>",
  appUrl: "https://postwork.example",
};

describe("notification provider plan", () => {
  test("demo mode discards provider candidates before configuration is read", () => {
    expect(planProviderDispatch(candidates, true)).toEqual({
      status: "skipped_demo",
      candidateCount: 0,
    });
  });

  test("the internal action is a safe no-op when DEMO is unset", async () => {
    const t = convexTest(schema, modules);
    const orgId = await t.run(async (ctx) =>
      ctx.db.insert("orgs", {
        name: "Postwork",
        slug: "postwork",
        createdAt: 1,
      }),
    );

    await expect(
      t.action(internal.notificationDelivery.dispatch, {
        orgId,
        recipientEmail: "ada@example.com",
        candidates,
        idempotencyKey: "notification/user-1/activity-1",
      }),
    ).resolves.toEqual({ status: "skipped_demo", candidateCount: 0 });
  });

  test("product mode reports every missing deployment variable", () => {
    expect(planProviderDispatch(candidates, false)).toEqual({
      status: "provider_not_configured",
      candidateCount: 1,
      missing: ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "POSTWORK_APP_URL"],
    });
  });

  test.each([
    "postwork.example",
    "ftp://postwork.example",
    "https://postwork.example/app",
    "https://user:secret@postwork.example",
  ])("rejects a non-origin POSTWORK_APP_URL: %s", (appUrl) => {
    expect(
      planProviderDispatch(candidates, false, { ...config, appUrl }),
    ).toEqual({
      status: "provider_configuration_invalid",
      candidateCount: 1,
      variable: "POSTWORK_APP_URL",
      error: "POSTWORK_APP_URL must be an absolute HTTP or HTTPS origin.",
    });
  });
});

describe("delivery state", () => {
  test("persists success and suppresses every later attempt", async () => {
    const t = convexTest(schema, modules);
    const orgId = await t.run(async (ctx) =>
      ctx.db.insert("orgs", {
        name: "Postwork",
        slug: "postwork",
        createdAt: 1,
      }),
    );
    const idempotencyKey = "notification/user-1/activity-1/immediate";

    await expect(
      t.mutation(internal.notificationDelivery.claimDelivery, {
        orgId,
        idempotencyKey,
        attemptId: "attempt-1",
      }),
    ).resolves.toEqual({ status: "ready" });
    await t.mutation(internal.notificationDelivery.recordDeliveryResult, {
      orgId,
      idempotencyKey,
      attemptId: "attempt-1",
      result: { ok: true, providerMessageId: "email-123" },
    });

    await expect(
      t.mutation(internal.notificationDelivery.claimDelivery, {
        orgId,
        idempotencyKey,
        attemptId: "attempt-2",
      }),
    ).resolves.toEqual({
      status: "already_sent",
      providerMessageId: "email-123",
    });
    const stored = await t.run(async (ctx) =>
      ctx.db
        .query("notificationDeliveries")
        .withIndex("by_org_id_and_idempotency_key", (q) =>
          q.eq("orgId", orgId).eq("idempotencyKey", idempotencyKey),
        )
        .unique(),
    );
    expect(stored).toMatchObject({ status: "sent", attemptCount: 1 });
  });

  test("blocks ambiguous retries after the 23-hour safety window", async () => {
    const t = convexTest(schema, modules);
    const orgId = await t.run(async (ctx) =>
      ctx.db.insert("orgs", {
        name: "Postwork",
        slug: "postwork",
        createdAt: 1,
      }),
    );
    const idempotencyKey = "notification/user-1/activity-2/digest";
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("notificationDeliveries", {
        orgId,
        idempotencyKey,
        status: "retryable_failure",
        attemptCount: 1,
        firstAttemptAt: now - DELIVERY_RETRY_WINDOW_MS - 1,
        lastAttemptAt: now - DELIVERY_RETRY_WINDOW_MS - 1,
        retryDeadlineAt: now - 1,
        errorCode: "network_error",
        errorMessage: "Connection closed after delivery.",
      });
    });

    await expect(
      t.mutation(internal.notificationDelivery.claimDelivery, {
        orgId,
        idempotencyKey,
        attemptId: "attempt-2",
      }),
    ).resolves.toEqual({
      status: "blocked",
      code: "retry_window_expired",
      message: "The delivery retry window has expired.",
    });
  });
});

describe("Resend adapter", () => {
  test("sends a bounded email with a stable provider idempotency key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "email-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      sendResendEmail({
        config,
        recipientEmail: "ada@example.com",
        candidate: candidates[0],
        idempotencyKey: "notification/user-1/activity-1/immediate",
        fetcher,
      }),
    ).resolves.toEqual({ ok: true, providerMessageId: "email-123" });

    expect(fetcher).toHaveBeenCalledOnce();
    const [, request] = fetcher.mock.calls[0];
    expect(request?.headers).toMatchObject({
      Authorization: "Bearer re_test",
      "Idempotency-Key": "notification/user-1/activity-1/immediate",
    });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      from: config.from,
      to: ["ada@example.com"],
      subject: "urgent: Urgent <release>",
    });
  });

  test("classifies provider throttling as observable and retryable", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ name: "rate_limit_exceeded", message: "Try later." }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      sendResendEmail({
        config,
        recipientEmail: "ada@example.com",
        candidate: candidates[0],
        idempotencyKey: "notification/user-1/activity-1/immediate",
        fetcher,
      }),
    ).resolves.toEqual({
      ok: false,
      statusCode: 429,
      code: "rate_limit_exceeded",
      message: "Try later.",
      retryable: true,
    });
  });

  test.each([
    ["concurrent_idempotent_requests", true],
    ["invalid_idempotent_request", false],
  ] as const)("classifies Resend conflict %s with retryable=%s", async (
    code,
    retryable,
  ) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ name: code, message: "Conflict." }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      sendResendEmail({
        config,
        recipientEmail: "ada@example.com",
        candidate: candidates[0],
        idempotencyKey: "notification/user-1/activity-1/immediate",
        fetcher,
      }),
    ).resolves.toMatchObject({ ok: false, code, retryable });
  });

  test("aborts provider requests at the deadline with a retryable timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        async (_input, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      );
      const result = sendResendEmail({
        config,
        recipientEmail: "ada@example.com",
        candidate: candidates[0],
        idempotencyKey: "notification/user-1/activity-1/immediate",
        fetcher,
        timeoutMs: 25,
      });

      await vi.advanceTimersByTimeAsync(25);
      await expect(result).resolves.toEqual({
        ok: false,
        statusCode: null,
        code: "request_timeout",
        message: "Resend request timed out after 25ms.",
        retryable: true,
      });
      expect(fetcher.mock.calls[0]?.[1]?.signal).toHaveProperty("aborted", true);
    } finally {
      vi.useRealTimers();
    }
  });

  test.each([
    "javascript:alert(1)",
    "https://attacker.example/phishing",
    "//attacker.example/phishing",
  ])("escapes post content and replaces an off-origin link: %s", (url) => {
    const content = renderNotificationEmail(
      {
        ...candidates[0],
        items: [{ ...candidates[0].items[0], url }],
      },
      config.appUrl,
    );

    expect(content.html).toContain("Urgent &lt;release&gt;");
    expect(content.html).not.toContain("attacker.example");
    expect(content.html).not.toContain("javascript:");
    expect(content.html).toContain(
      'href="https://postwork.example/posts/post-1"',
    );
  });
});
