import { Component, type ErrorInfo, type ReactNode } from "react";

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
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg px-6 text-center">
        <div className="max-w-sm">
          <p className="text-sm font-medium lowercase text-accent-soft">
            something broke
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg">
            the page hit an unexpected error
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            your work is safe — this is a render error, not a data loss. reload
            to try again. if it keeps happening, the details below tell you what
            went wrong.
          </p>
        </div>
        <pre className="max-w-lg overflow-x-auto rounded-lg border border-border bg-surface px-4 py-3 text-left text-xs text-faint">
          {error.message}
        </pre>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fg transition hover:bg-accent-soft"
        >
          reload
        </button>
      </div>
    );
  }
}
