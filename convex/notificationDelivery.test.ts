/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { planProviderDispatch } from "./notificationDelivery";
import type { OutboundDeliveryCandidate } from "./notificationComposer";

const modules = import.meta.glob("./**/*.ts");

const candidates: OutboundDeliveryCandidate[] = [
  {
    kind: "immediate",
    items: [
      {
        postId: "post-1",
        title: "Urgent post",
        priority: "urgent",
        lastActivityAt: 1,
        unread: true,
      },
    ],
    omittedCount: 0,
  },
];

test("demo mode discards provider candidates server-side", () => {
  expect(planProviderDispatch(candidates, true)).toEqual({
    status: "skipped_demo",
    candidateCount: 0,
  });
});

test("the internal delivery action remains a no-op until a provider is configured", async () => {
  const t = convexTest(schema, modules);

  await expect(
    t.action(internal.notificationDelivery.dispatch, { candidates }),
  ).resolves.toEqual({ status: "provider_not_configured", candidateCount: 1 });
});

test("product mode remains a no-op until a provider is configured", () => {
  expect(planProviderDispatch(candidates, false)).toEqual({
    status: "provider_not_configured",
    candidateCount: 1,
  });
});
