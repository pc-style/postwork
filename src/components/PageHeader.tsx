import type { ReactNode } from "react";

/**
 * Page-level header. Deliberately has no back button: the sidebar is the way
 * back, and per-page back links made navigation inconsistent.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="type-heading text-display font-semibold text-fg">{title.toLowerCase()}</h1>
          {description ? (
            <p className="type-description mt-1.5 text-body text-muted">{description}</p>
          ) : null}
        </div>
        {action ? <div className="w-full sm:w-auto">{action}</div> : null}
      </div>
    </header>
  );
}
