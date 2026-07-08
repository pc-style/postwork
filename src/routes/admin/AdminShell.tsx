import type { ReactNode } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { RequireAdmin } from "../gates";

const ADMIN_NAV = [
  { label: "overview", to: "/admin" as const, exact: true },
  { label: "users", to: "/admin/users" as const, exact: false },
  { label: "invites", to: "/admin/invites" as const, exact: false },
  { label: "access requests", to: "/admin/access-requests" as const, exact: false },
  { label: "audit log", to: "/admin/audit-log" as const, exact: false },
];

/**
 * The platform control plane. Deliberately its own chrome (not the app
 * shell): admin is a different mode of the product, and it should feel like
 * a place that will grow more sections (billing, integrations, policies).
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <RequireAdmin>
      <div className="theme-ink flex min-h-screen w-full bg-bg text-fg">
        <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border py-6">
          <div className="px-5">
            <Link to="/" className="text-base font-semibold tracking-tight">
              post<span className="text-accent">work</span>
            </Link>
            <div className="mt-1 text-label font-medium lowercase text-muted">
              admin
            </div>
          </div>

          <nav className="mt-6 flex flex-col gap-0.5 px-3 text-sm">
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                activeProps={{ className: "bg-surface text-accent-soft" }}
                className="rounded-md px-2 py-1.5 text-muted transition hover:bg-surface hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto px-5 pb-2">
            <Link
              to="/app"
              className="text-xs text-muted transition-colors hover:text-fg"
            >
              ← back to the app
            </Link>
          </div>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </RequireAdmin>
  );
}

export function AdminLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}

/** Shared page scaffolding so every admin section reads the same. */
export function AdminPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-lg text-sm text-muted">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function AdminTable({
  head,
  children,
}: {
  head: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-label font-medium lowercase text-muted">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function AdminRow({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-surface"
    >
      {children}
    </tr>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "good" | "warn" | "bad" | "muted";
  children: ReactNode;
}) {
  const tones = {
    good: "text-accent-soft border-accent/40",
    warn: "text-high border-high/40",
    bad: "text-urgent border-urgent/40",
    muted: "text-muted border-border",
  } as const;
  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-xs lowercase ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
