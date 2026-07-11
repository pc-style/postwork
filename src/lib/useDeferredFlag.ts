import { useEffect, useState } from "react";

/**
 * Returns `false` for the first `ms` milliseconds after mount, then `true`.
 *
 * Used to defer skeleton/loading states: if data arrives from the Convex cache
 * within the grace window (e.g. from a hover prefetch), the component never
 * shows a loading state at all — making navigation feel instant.
 */
export function useDeferredFlag(ms = 150): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return ready;
}
