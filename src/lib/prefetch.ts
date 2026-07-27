import { getFunctionName } from "convex/server";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { convex } from "./convexClient";

/**
 * Hover/focus prefetching for Convex queries.
 *
 * `convex.watchQuery(...).onUpdate()` opens a real subscription. While it is
 * held, a later `useQuery` with the exact same function + args resolves
 * synchronously from the client's local cache — no loading state. Each
 * prefetch holds its subscription for a short TTL (refreshed on re-hover),
 * then unsubscribes so we don't accumulate live subscriptions while the user
 * scrolls a long feed.
 */
const PREFETCH_TTL_MS = 45_000;
const MAX_ACTIVE = 25;

const active = new Map<
  string,
  { unsubscribe: () => void; timer: ReturnType<typeof setTimeout> }
>();

function release(key: string) {
  const entry = active.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  entry.unsubscribe();
  active.delete(key);
}

export function prefetchQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query>,
): void {
  const key = `${getFunctionName(query)}:${JSON.stringify(args)}`;

  const existing = active.get(key);
  if (existing) {
    // Already warm — just extend the TTL.
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => release(key), PREFETCH_TTL_MS);
    return;
  }

  // Evict the oldest entry if we're at capacity (Map preserves insertion order).
  if (active.size >= MAX_ACTIVE) {
    const oldest = active.keys().next().value;
    if (oldest !== undefined) release(oldest);
  }

  const unsubscribe = convex.watchQuery(query, args).onUpdate(() => {});
  const timer = setTimeout(() => release(key), PREFETCH_TTL_MS);
  active.set(key, { unsubscribe, timer });
}
