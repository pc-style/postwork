import { useSyncExternalStore } from "react";

/**
 * Feed cover display preference. "compact" is text-only (no cover);
 * "regular" renders the cover as a small thumbnail on the card's right side.
 * Persisted locally — it is a per-device viewing preference, not backend
 * state.
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

// Cross-tab sync: another tab changing (or clearing) the stored preference
// fires "storage" here. `key === null` means localStorage.clear(); a removed
// key rereads as the default. Attached only while subscribers exist.
function handleStorageEvent(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  const next = readStoredMode();
  if (next === mode) return;
  mode = next;
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void) {
  if (listeners.size === 0) {
    window.addEventListener("storage", handleStorageEvent);
  }
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) {
      window.removeEventListener("storage", handleStorageEvent);
    }
  };
}

export function setFeedCoverMode(next: FeedCoverMode) {
  mode = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private-mode storage failures degrade to a session-only preference.
  }
  for (const listener of listeners) listener();
}

/** Non-reactive read of the current mode, for use outside render (prefetch). */
export function readFeedCoverMode(): FeedCoverMode {
  return mode;
}

export function useFeedCoverMode(): FeedCoverMode {
  return useSyncExternalStore(
    subscribe,
    () => mode,
    () => DEFAULT_MODE,
  );
}
