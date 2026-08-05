import { useSyncExternalStore } from "react";

/**
 * Feed cover display preference. "compact" renders a small square thumbnail
 * on the card's right side; "regular" renders a wide banner. Persisted
 * locally — it is a per-device viewing preference, not backend state.
 */
export type FeedCoverMode = "regular" | "compact";

const STORAGE_KEY = "postwork:feed-cover-mode";
const DEFAULT_MODE: FeedCoverMode = "compact";

function readStoredMode(): FeedCoverMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "regular" ? "regular" : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

let mode: FeedCoverMode = typeof window === "undefined" ? DEFAULT_MODE : readStoredMode();
const listeners = new Set<() => void>();

export function setFeedCoverMode(next: FeedCoverMode) {
  mode = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private-mode storage failures degrade to a session-only preference.
  }
  for (const listener of listeners) listener();
}

export function useFeedCoverMode(): FeedCoverMode {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => mode,
    () => DEFAULT_MODE,
  );
}
