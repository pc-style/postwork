/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import {
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

    await expect(
      t.action(internal.notificationDelivery.dispatch, {
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

  test("escapes post content and rejects unsafe link schemes", () => {
    const content = renderNotificationEmail(
      {
        ...candidates[0],
        items: [{ ...candidates[0].items[0], url: "javascript:alert(1)" }],
      },
      config.appUrl,
    );

    expect(content.html).toContain("Urgent &lt;release&gt;");
    expect(content.html).not.toContain("javascript:");
    expect(content.html).toContain('href="https://postwork.example/"');
  });
});
