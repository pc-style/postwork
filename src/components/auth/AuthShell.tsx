import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Skeleton } from "../Skeleton";

/**
 * Single-column, mobile-first frame for every auth screen. Content stays
 * inside max-w-sm so it reads comfortably from 360px phones up to desktop.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="theme-ink flex min-h-screen justify-center bg-bg px-4 py-10 sm:items-center sm:py-14">
      <div className="w-full max-w-sm self-start sm:self-auto">
        <p className="text-body font-medium lowercase text-accent-soft">
          postwork
        </p>
        <h1 className="mt-2 text-display font-semibold lowercase tracking-[-0.02em] text-fg [text-wrap:balance]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 text-body text-muted [text-wrap:pretty]">
            {description}
          </p>
        ) : null}
        <div className="mt-6">{children}</div>
        {footer ? <div className="mt-4">{footer}</div> : null}
        <Link
          to="/"
          className="mt-6 inline-flex min-h-11 items-center text-body text-muted transition-colors hover:text-fg"
        >
          <span aria-hidden="true" className="mr-1.5">
            &larr;
          </span>
          back to the landing page
        </Link>
      </div>
    </div>
  );
}

/** Full-screen loading card shared by the auth gates. */
export function AuthLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-5">
        <Skeleton label={label} preset="inline" count={3} />
      </div>
    </div>
  );
}
