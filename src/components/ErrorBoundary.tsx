import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./Button";
import { captureErrorBoundaryException } from "../monitoring";

/**
 * Top-level error boundary (Phase 3.6).
 *
 * Catches render errors anywhere below it in the tree and shows a quiet,
 * on-brand fallback instead of a blank screen. Errors are logged to the
 * console with a path breadcrumb so they surface in the browser's error
 * reporting / Convex log streams when reachable from a server round-trip.
 *
 * This is the frontend observability complement to `convex/lib/observability.ts`,
 * which structures backend logs.
 */
type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const path =
      typeof window !== "undefined" ? window.location.pathname : "unknown";
    console.error(
      JSON.stringify({
        event: "ui.renderError",
        message: error.message,
        stack: error.stack,
        path,
        componentStack: info.componentStack ?? undefined,
      }),
    );
    captureErrorBoundaryException(error, info, path);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
        <div className="max-w-sm">
          <p className="text-sm font-medium text-accent-soft">Page error</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">
            We couldn't show this page
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Reload the page to try again. If the error continues, share the
            details below with an admin.
          </p>
        </div>
        <pre className="max-w-full overflow-x-auto rounded-lg border border-border bg-surface px-4 py-3 text-left text-xs text-muted sm:max-w-lg">
          {error.message}
        </pre>
        <Button onClick={() => window.location.reload()}>reload</Button>
      </div>
    );
  }
}
