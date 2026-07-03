import type { ReactNode } from "react";

export function AccentPanel({
  chipLabel,
  title,
  action,
  children,
}: {
  chipLabel: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-accent/25 bg-accent/[0.06] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-sm bg-accent/20 px-1.5 py-0.5 text-label font-semibold text-accent-soft">
            {chipLabel}
          </span>
          <span className="text-xs font-semibold tracking-wide text-accent-soft lowercase">
            {title}
          </span>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
