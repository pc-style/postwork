import * as Sentry from "@sentry/react";
import type { ErrorInfo } from "react";
import { isDemo, getOptionalViteEnv } from "./lib/demoMode";
import { getSentryConfiguration } from "./lib/monitoring";

declare global {
  interface Window {
    __postworkSentryInitialized?: boolean;
  }
}

const configuration = getSentryConfiguration({
  dsn: getOptionalViteEnv("VITE_SENTRY_DSN"),
  environment: getOptionalViteEnv("VITE_SENTRY_ENVIRONMENT"),
  release: getOptionalViteEnv("VITE_SENTRY_RELEASE"),
  isDemo,
  viteMode: import.meta.env.MODE,
});

export function initializeErrorReporting(): boolean {
  if (
    !configuration ||
    typeof window === "undefined" ||
    window.__postworkSentryInitialized
  ) {
    return false;
  }

  try {
    Sentry.init({
      dsn: configuration.dsn,
      environment: configuration.environment,
      release: configuration.release,
      initialScope: {
        tags: {
          "postwork.mode": configuration.mode,
          "postwork.environment": configuration.environment,
          ...(configuration.release
            ? { "postwork.release": configuration.release }
            : {}),
        },
      },
      // Sentry's default browser integrations include GlobalHandlers, which
      // captures window errors and unhandled promise rejections at bootstrap.
      sendDefaultPii: false,
    });
    window.__postworkSentryInitialized = true;
    return true;
  } catch {
    // Monitoring remains optional: a bad DSN must never stop the prototype.
    return false;
  }
}

export function captureErrorBoundaryException(
  error: Error,
  info: ErrorInfo,
  path: string,
): void {
  if (
    !configuration ||
    typeof window === "undefined" ||
    !window.__postworkSentryInitialized
  ) {
    return;
  }

  try {
    Sentry.withScope((scope) => {
      scope.setTag("postwork.error_source", "react.error_boundary");
      scope.setTag("postwork.path", path);
      Sentry.captureReactException(error, info);
    });
  } catch {
    // Preserve the existing boundary fallback even if the SDK misbehaves.
  }
}
