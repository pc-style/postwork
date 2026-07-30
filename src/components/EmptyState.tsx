import type { ReactNode } from "react";

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="type-description mx-auto rounded-lg border border-dashed border-border bg-surface/50 px-4 py-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}
