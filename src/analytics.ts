import { init } from "@plausible-analytics/tracker";
import { getOptionalViteEnv, isDemo } from "./lib/demoMode";
import { shouldInitializePlausible } from "./lib/monitoring";

const plausibleDomain = getOptionalViteEnv("VITE_PLAUSIBLE_DOMAIN")?.trim();

declare global {
  interface Window {
    __postworkPlausibleInitialized?: boolean;
  }
}

if (
  typeof window !== "undefined" &&
  !window.__postworkPlausibleInitialized &&
  shouldInitializePlausible({
    isDemo,
    configuredDomain: plausibleDomain,
    hostname: window.location.hostname,
  })
) {
  try {
    init({
      domain: plausibleDomain!,
      outboundLinks: true,
    });
    window.__postworkPlausibleInitialized = true;
  } catch {
    // Analytics is optional; never block app startup.
  }
}
