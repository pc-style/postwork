import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isDemo } from "../lib/demoMode";
import { getFlashExperiment } from "./registry";
import { NO_SLOTS } from "./slots";

type ActiveExperimentState = {
  slug: string | null;
  setSlug: (slug: string | null) => void;
};

const Ctx = createContext<ActiveExperimentState | null>(null);

const STORAGE_KEY = "postwork:active-experiment";

function readInitialSlug(): string | null {
  if (!isDemo) return null;
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return getFlashExperiment(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Holds which experiment (if any) is currently being previewed. Mounted above
 * the router in main.tsx so the override survives real navigation: you can enter
 * an experiment, browse feed → post → reply as usual, and the change stays
 * applied until you exit.
 *
 * The slug is mirrored to sessionStorage so the override also survives hard
 * reloads, direct URL entry, opening a post in a new tab, and back/forward
 * across the experiment boundary. Without this the experiment would silently
 * drop the moment a real navigation forced a fresh React tree.
 */
export function ExperimentProvider({ children }: { children: ReactNode }) {
  const [slug, setSlugState] = useState<string | null>(() => readInitialSlug());

  const setSlug = useCallback((next: string | null) => {
    if (!isDemo) {
      setSlugState(null);
      return;
    }
    setSlugState(next);
    if (typeof window === "undefined") return;
    try {
      if (next === null) {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } else {
        window.sessionStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // sessionStorage may be unavailable (private mode, quota); silently
      // degrade to in-memory only.
    }
  }, []);

  // Cross-tab/cross-window sync: clearing or switching in one tab should
  // immediately reflect in any other tab on the same session.
  useEffect(() => {
    if (!isDemo) return;
    if (typeof window === "undefined") return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = event.newValue;
      if (next === null) {
        setSlugState(null);
      } else if (getFlashExperiment(next)) {
        setSlugState(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(() => ({ slug, setSlug }), [slug, setSlug]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useExperimentCtx() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useActiveExperiment must be used inside <ExperimentProvider>");
  }
  return ctx;
}

export function useActiveExperiment() {
  const { slug, setSlug } = useExperimentCtx();
  const experiment = isDemo && slug ? getFlashExperiment(slug) : null;
  return {
    slug: isDemo ? slug : null,
    experiment,
    slots: experiment?.appSlots ?? NO_SLOTS,
    setSlug,
  };
}
