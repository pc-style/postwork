import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { isDemo } from "./lib/demo";
import type { OutboundDeliveryCandidate } from "./notificationComposer";

const notificationItem = v.object({
  postId: v.string(),
  title: v.string(),
  priority: v.union(
    v.literal("urgent"),
    v.literal("high"),
    v.literal("normal"),
  ),
  lastActivityAt: v.number(),
  unread: v.boolean(),
  space: v.optional(v.string()),
  url: v.optional(v.string()),
});

const outboundCandidate = v.object({
  kind: v.union(v.literal("immediate"), v.literal("digest")),
  items: v.array(notificationItem),
  omittedCount: v.number(),
});

/**
 * Server-only provider boundary. It intentionally performs no transport work.
 * Future provider adapters must be called only after this guard permits it.
 */
export const dispatch = internalAction({
  args: { candidates: v.array(outboundCandidate) },
  handler: async (_ctx, args) => {
    return planProviderDispatch(args.candidates, isDemo());
  },
});

export function planProviderDispatch(
  candidates: readonly OutboundDeliveryCandidate[],
  demoMode: boolean,
):
  | { status: "skipped_demo"; candidateCount: 0 }
  | { status: "provider_not_configured"; candidateCount: number } {
  if (demoMode) {
    return { status: "skipped_demo", candidateCount: 0 };
  }
  return {
    status: "provider_not_configured",
    candidateCount: candidates.length,
  };
}
