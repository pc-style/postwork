import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useConvex, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { AdminUsersFilter } from "../../router";
import { timeAgo } from "../../lib/format";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import { AdminPage } from "./AdminShell";

export function AdminOverviewPage() {
  const overview = useQuery(api.admin.overview);

  return (
    <AdminPage
      title="overview"
      description="counts for members, invites, requests, and recent audit activity."
    >
      {overview === undefined ? (
        <Skeleton preset="stats" count={5} label="loading admin overview" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat
              label="members"
              value={overview.members}
              to="/admin/users"
              filter="members"
            />
            <Stat
              label="agents"
              value={overview.agents}
              to="/admin/users"
              filter="agents"
            />
            <Stat
              label="deactivated"
              value={overview.deactivated}
              to="/admin/users"
              filter="deactivated"
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
              <h2 className="text-body font-medium lowercase text-muted">
                recent activity
              </h2>
              <Link
                to="/admin/audit-log"
                className="inline-flex min-h-11 items-center rounded-md px-2 text-body text-accent-soft transition-colors hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                view details
              </Link>
            </div>
            {overview.recentAudit.length === 0 ? (
              <p className="text-body text-muted">
                nothing yet. actions taken in the admin panel land here.
              </p>
            ) : (
              <ul className="space-y-2">
                {overview.recentAudit.map((entry) => (
                  <li
                    key={entry._id}
                    className="flex items-baseline justify-between gap-4 rounded-md border border-border bg-surface px-4 py-2.5 text-body"
                  >
                    <span className="font-mono text-body text-fg">
                      {entry.action}
                    </span>
                    <span className="shrink-0 text-body text-muted tabular-nums">
                      {timeAgo(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ExportCard />
        </>
      )}
    </AdminPage>
  );
}

const EXPORT_TABLES = ["users", "spaces", "posts", "replies"] as const;
const EXPORT_PAGE_SIZE = 200;

/**
 * Data portability: pull every table in bounded pages and hand the admin one
 * JSON file. Assembly happens client-side so the export size is not limited
 * by a single function result.
 */
function ExportCard() {
  const convex = useConvex();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const data: Record<string, unknown[]> = {};
      for (const table of EXPORT_TABLES) {
        const rows: unknown[] = [];
        let cursor: string | null = null;
        do {
          const result: {
            page: unknown[];
            isDone: boolean;
            continueCursor: string;
          } = await convex.query(api.exports.exportChunk, {
            table,
            paginationOpts: { numItems: EXPORT_PAGE_SIZE, cursor },
          });
          rows.push(...result.page);
          cursor = result.isDone ? null : result.continueCursor;
        } while (cursor !== null);
        data[table] = rows;
      }
      const blob = new Blob(
        [JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2)],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `postwork-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("export failed. check your connection and try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
      <div>
        <h2 className="text-body font-medium lowercase text-fg">workspace export</h2>
        <p className="mt-0.5 text-body text-muted">
          download members, spaces, posts, and replies as one json file.
        </p>
        {error ? <p role="alert" className="mt-1 text-body text-urgent">{error}</p> : null}
      </div>
      <Button
        variant="secondary"
        size="sm"
        loading={exporting}
        loadingLabel="exporting…"
        onClick={() => void runExport()}
      >
        export data
      </Button>
    </div>
  );
}

function Stat({
  label,
  value,
  to,
  filter,
  highlight = false,
}: {
  label: string;
  value: number;
  to: "/admin/users" | "/admin/invites" | "/admin/access-requests";
  filter?: AdminUsersFilter;
  highlight?: boolean;
}) {
  return (
    <Link
      to={to}
      search={filter ? { filter } : {}}
      className="flex min-h-11 flex-col justify-center rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-accent/40 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <div
        className={`text-display font-semibold tabular-nums ${
          highlight ? "text-accent-soft" : "text-fg"
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-body font-medium lowercase text-muted">
        {label}
      </div>
    </Link>
  );
}
