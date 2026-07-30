import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function PageHeader({
  backTo,
  backLabel,
  title,
  description,
  action,
}: {
  backTo: "/app" | "/app/spaces";
  backLabel: string;
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <Link
        to={backTo}
        className="mb-3 inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-fg"
      >
        <span aria-hidden="true" className="me-1.5">←</span>
        {backLabel.toLowerCase()}
      </Link>

      {title || action ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {title ? (
            <div className="min-w-0">
              <h1 className="type-heading text-xl font-semibold text-fg">{title}</h1>
              {description ? (
                <p className="type-description mt-1.5 text-sm text-muted">{description}</p>
              ) : null}
            </div>
          ) : null}
          {action ? <div className="w-full sm:w-auto">{action}</div> : null}
        </div>
      ) : null}
    </header>
  );
}
