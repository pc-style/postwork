import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function PageHeader({
  backTo,
  backLabel,
  title,
  description,
  action,
}: {
  backTo: "/" | "/spaces";
  backLabel: string;
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5">
      <Link
        to={backTo}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition hover:text-fg"
      >
        ← {backLabel.toLowerCase()}
      </Link>

      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          {title && (
            <div>
              <h1 className="text-xl font-semibold text-fg">{title}</h1>
              {description && (
                <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
              )}
            </div>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
