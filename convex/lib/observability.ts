import { ConvexError } from "convex/values";

/**
 * Structured logging + error helpers (Phase 3.6).
 *
 * Convex captures console.* output into log streams, so structured
 * console calls are the observability primitive — no external SDK needed
 * for the product to have searchable, filterable function logs.
 *
 * On the frontend, an ErrorBoundary (src/components/ErrorBoundary.tsx)
 * catches render errors and logs them with a path + user breadcrumb.
 */

type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, event: string, data?: Record<string, unknown>) {
  const payload = { event, ...data };
  if (level === "error") {
    console.error(JSON.stringify(payload));
  } else if (level === "warn") {
    console.warn(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

export function logInfo(event: string, data?: Record<string, unknown>) {
  log("info", event, data);
}

export function logWarn(event: string, data?: Record<string, unknown>) {
  log("warn", event, data);
}

export function logError(event: string, data?: Record<string, unknown>) {
  log("error", event, data);
}

/**
 * Wrap a handler's rate-limit / validation / auth errors with structured
 * logging so unexpected throws are traceable in log streams. Expected
 * ConvexError(s) (auth, validation, rate-limit, not-found) are re-thrown
 * as-is — they carry client-facing codes and should not be swallowed.
 */
export function withLogging<T extends (...args: never[]) => unknown>(
  event: string,
  fn: T,
): T {
  return ((...args: never[]) => {
    try {
      const result = fn(...args);
      if (result instanceof Promise) {
        return result.catch((err) => {
          if (err instanceof ConvexError) throw err;
          logError(event, { error: String(err) });
          throw err;
        });
      }
      return result;
    } catch (err) {
      if (err instanceof ConvexError) throw err;
      logError(event, { error: String(err) });
      throw err;
    }
  }) as T;
}
