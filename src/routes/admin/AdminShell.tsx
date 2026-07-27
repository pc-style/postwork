import { useState, type ReactNode } from "react";
import { Link, Outlet } from "@tanstack/react-router";
import { Button } from "../../components/Button";
import { Sheet } from "../../components/Sheet";
import { RequireAdmin } from "../gates";

const ADMIN_NAV = [
  { label: "overview", to: "/admin" as const, exact: true },
  { label: "users", to: "/admin/users" as const, exact: false },
  { label: "models", to: "/admin/models" as const, exact: false },
  { label: "invites", to: "/admin/invites" as const, exact: false },
  { label: "access requests", to: "/admin/access-requests" as const, exact: false },
  { label: "audit log", to: "/admin/audit-log" as const, exact: false },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <RequireAdmin>
      <div className="theme-ink min-h-screen w-full bg-bg text-fg">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-border bg-bg/95 px-4 backdrop-blur md:hidden">
          <Link to="/admin" className="text-base font-semibold tracking-tight">
            post<span className="text-accent-soft">work</span>
            <span className="ml-2 text-xs font-medium text-muted">admin</span>
          </Link>
          <Button variant="icon" aria-label="Open admin navigation" onClick={() => setMobileNavOpen(true)}>
            <MenuIcon />
          </Button>
        </header>

        <div className="flex min-h-screen w-full">
          <aside className="sticky top-0 hidden h-screen w-[clamp(12rem,18vw,15rem)] shrink-0 flex-col border-r border-border py-6 md:flex">
            <div className="px-5">
              <Link to="/" className="text-base font-semibold tracking-tight">
                post<span className="text-accent-soft">work</span>
              </Link>
              <div className="mt-1 text-label font-medium text-muted">Admin</div>
            </div>
            <AdminNav />
            <div className="mt-auto px-5 pb-2">
              <BackToApp />
            </div>
          </aside>
          <main className="min-w-0 flex-1">{children}</main>
        </div>

        {mobileNavOpen ? (
          <Sheet title="Admin navigation" onClose={() => setMobileNavOpen(false)}>
            <div className="flex min-h-full flex-col">
              <AdminNav onSelect={() => setMobileNavOpen(false)} />
              <div className="mt-auto border-t border-border pt-5">
                <BackToApp onSelect={() => setMobileNavOpen(false)} />
              </div>
            </div>
          </Sheet>
        ) : null}
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

function AdminNav({ onSelect }: { onSelect?: () => void }) {
  return (
    <nav aria-label="Admin navigation" className="mt-6 flex flex-col gap-1 px-3 text-sm">
      {ADMIN_NAV.map((item) => (
        <Link
          key={item.label}
          to={item.to}
          activeOptions={{ exact: item.exact }}
          activeProps={{ className: "bg-surface text-accent-soft", "aria-current": "page" }}
          className="flex min-h-11 items-center rounded-md px-3 py-2 text-muted transition-colors hover:bg-surface hover:text-fg"
          onClick={onSelect}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function BackToApp({ onSelect }: { onSelect?: () => void }) {
  return (
    <Link
      to="/app"
      className="inline-flex min-h-11 items-center text-xs text-muted transition-colors hover:text-fg"
      onClick={onSelect}
    >
      <span aria-hidden="true" className="mr-1.5">←</span>
      back to the app
    </Link>
  );
}

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
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
          {description ? <p className="mt-1 max-w-xl text-sm leading-6 text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="w-full sm:w-auto">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

type AdminColumn<T> = {
  label: string;
  render: (item: T) => ReactNode;
  className?: string;
  primary?: boolean;
};

export function AdminRecordList<T extends { _id: string }>({
  items,
  columns,
  onView,
  recordLabel,
}: {
  items: T[];
  columns: AdminColumn<T>[];
  onView: (item: T) => void;
  recordLabel: (item: T) => string;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-label font-medium text-muted">
              {columns.map((column) => (
                <th key={column.label} className="px-4 py-3 font-medium">{column.label}</th>
              ))}
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._id} className="border-b border-border/60 last:border-b-0 hover:bg-surface">
                {columns.map((column) => (
                  <td key={column.label} className={`px-4 py-3 ${column.className ?? ""}`}>
                    {column.render(item)}
                  </td>
                ))}
                <td className="px-4 py-2 text-right">
                  <Button
                    variant="quiet"
                    size="sm"
                    className="min-h-9"
                    onClick={() => onView(item)}
                    aria-label={`View details for ${recordLabel(item)}`}
                  >
                    view details
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {items.map((item) => (
          <article key={item._id} className="rounded-lg border border-border bg-surface p-4">
            <dl className="grid gap-3">
              {columns.map((column) => (
                <div key={column.label} className={column.primary ? "border-b border-border pb-3" : "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3"}>
                  <dt className={column.primary ? "sr-only" : "text-xs font-medium text-muted"}>{column.label}</dt>
                  <dd className={`min-w-0 break-words text-sm ${column.primary ? "text-fg" : "text-fg/90"}`}>
                    {column.render(item)}
                  </dd>
                </div>
              ))}
            </dl>
            <Button variant="secondary" className="mt-4 w-full" onClick={() => onView(item)}>
              view details
            </Button>
          </article>
        ))}
      </div>
    </>
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
    good: "border-accent/40 bg-accent/10 text-accent-soft",
    warn: "border-high/40 bg-high/10 text-high",
    bad: "border-urgent/40 bg-urgent/10 text-urgent",
    muted: "border-border bg-surface-2 text-muted",
  } as const;
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${tones[tone]}`}>
      {children}
    </span>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
