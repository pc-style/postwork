import { init } from "@plausible-analytics/tracker";
import { getOptionalViteEnv } from "./lib/demoMode";

const plausibleDomain = getOptionalViteEnv("VITE_PLAUSIBLE_DOMAIN");

declare global {
  interface Window {
    __postworkPlausibleInitialized?: boolean;
  }
}

if (plausibleDomain && typeof window !== "undefined" && !window.__postworkPlausibleInitialized) {
  try {
    init({
      domain: plausibleDomain,
      outboundLinks: true,
    });
    window.__postworkPlausibleInitialized = true;
  } catch {
    // Analytics is optional; never block app startup.
  }
}
