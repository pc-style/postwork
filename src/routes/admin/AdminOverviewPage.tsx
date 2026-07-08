import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { timeAgo } from "../../lib/format";
import { AdminPage } from "./AdminShell";

export function AdminOverviewPage() {
  const overview = useQuery(api.admin.overview);

  return (
    <AdminPage
      title="overview"
      description="the state of the org at a glance. everything here has a detail view in the sections on the left."
    >
      {overview === undefined ? (
        <p className="text-sm text-muted">loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="members" value={overview.members} to="/admin/users" />
            <Stat label="agents" value={overview.agents} to="/admin/users" />
            <Stat
              label="deactivated"
              value={overview.deactivated}
              to="/admin/users"
            />
            <Stat
              label="active invites"
              value={overview.activeInvites}
              to="/admin/invites"
            />
            <Stat
              label="pending requests"
              value={overview.pendingRequests}
              to="/admin/access-requests"
              highlight={overview.pendingRequests > 0}
            />
          </div>

          <div className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-label font-medium lowercase text-muted">
                recent activity
              </h2>
              <Link
                to="/admin/audit-log"
                className="text-xs text-accent-soft hover:text-fg"
              >
                full audit log →
              </Link>
            </div>
            {overview.recentAudit.length === 0 ? (
              <p className="text-sm text-muted">
                nothing yet. actions taken in the admin panel land here.
              </p>
            ) : (
              <ul className="space-y-2">
                {overview.recentAudit.map((entry) => (
                  <li
                    key={entry._id}
                    className="flex items-baseline justify-between gap-4 rounded-md border border-border bg-surface px-4 py-2.5 text-sm"
                  >
                    <span className="font-mono text-xs text-fg">
                      {entry.action}
                    </span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {timeAgo(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </AdminPage>
  );
}

function Stat({
  label,
  value,
  to,
  highlight = false,
}: {
  label: string;
  value: number;
  to: "/admin/users" | "/admin/invites" | "/admin/access-requests";
  highlight?: boolean;
}) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-accent/40"
    >
      <div
        className={`text-2xl font-semibold tabular-nums ${
          highlight ? "text-accent-soft" : "text-fg"
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-label font-medium lowercase text-muted">
        {label}
      </div>
    </Link>
  );
}
