import { RateLimiter, SECOND, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

/**
 * Application-layer rate limits (Phase 3.1).
 *
 * All limits are per-user (keyed by viewer._id) so they constrain the
 * authenticated actor, not the deployment globally. Token-bucket limits allow
 * short bursts; fixed-window limits are stricter.
 *
 * Used inside mutations/actions via:
 *   await rateLimiter.limit(ctx, "createPost", { key: viewer._id, throws: true });
 *
 * `throws: true` means the call throws a ConvexError with
 * `{ kind: "RATE_LIMITED", name, retryAfter }` when the limit is exceeded —
 * the transaction rolls back, so partial writes never persist.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Writing posts is heavier than replies — allow a burst of 3, then 10/min.
  createPost: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 3 },
  // Replies are lightweight — allow a burst of 10, then 30/min.
  createReply: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 10 },
  // AI summaries hit an external paid API — 5/min, no burst.
  summarize: { kind: "fixed window", rate: 5, period: MINUTE },
  // Profile edits — 10/min is plenty for a settings page.
  updateProfile: { kind: "fixed window", rate: 10, period: MINUTE },
  // Image uploads — 20/min per user.
  uploadAttachment: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 5 },
});

export { SECOND, MINUTE, HOUR };
