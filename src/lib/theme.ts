import { useSyncExternalStore } from "react";

/**
 * Color theme preference. "dark" is the product default; "system" follows the
 * OS. Persisted locally — a per-device viewing preference, not backend state.
 * The pre-paint boot script in index.html applies the stored class before the
 * bundle loads; this module owns every change after that.
 */
export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "postwork:theme";
const DEFAULT_PREFERENCE: ThemePreference = "dark";
const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: "#0a0a0b",
  light: "#f4f1f2",
};

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "system" ? stored : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

let preference: ThemePreference =
  typeof window === "undefined" ? DEFAULT_PREFERENCE : readStoredPreference();
const listeners = new Set<() => void>();

const systemQuery =
  typeof window === "undefined"
    ? null
    : window.matchMedia("(prefers-color-scheme: light)");

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") return systemQuery?.matches ? "light" : "dark";
  return pref;
}

function applyResolvedTheme() {
  const resolved = resolve(preference);
  const root = document.documentElement;
  root.classList.toggle("light", resolved === "light");
  root.classList.toggle("dark", resolved === "dark");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[resolved]);
}

function notify() {
  applyResolvedTheme();
  for (const listener of listeners) listener();
}

// Cross-tab sync: another tab changing (or clearing) the stored preference
// fires "storage" here. `key === null` means localStorage.clear(); a removed
// key rereads as the default. Attached only while subscribers exist.
function handleStorageEvent(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  const next = readStoredPreference();
  if (next === preference) return;
  preference = next;
  notify();
}

// While the preference is "system", the resolved theme tracks the OS setting.
function handleSystemChange() {
  if (preference === "system") notify();
}

function subscribe(onStoreChange: () => void) {
  if (listeners.size === 0) {
    window.addEventListener("storage", handleStorageEvent);
    systemQuery?.addEventListener("change", handleSystemChange);
  }
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) {
      window.removeEventListener("storage", handleStorageEvent);
      systemQuery?.removeEventListener("change", handleSystemChange);
    }
  };
}

export function setThemePreference(next: ThemePreference) {
  preference = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private-mode storage failures degrade to a session-only preference.
  }
  notify();
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    subscribe,
    () => preference,
    () => DEFAULT_PREFERENCE,
  );
}

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(
    subscribe,
    () => resolve(preference),
    (): ResolvedTheme => "dark",
  );
}

// Re-apply at module init so the stored preference sticks even where the
// index.html boot script cannot run (e.g. a CSP that bans inline scripts).
// When the script did run this is a no-op re-applying the same class.
if (typeof window !== "undefined") {
  applyResolvedTheme();
}
