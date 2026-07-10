import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { timeAgo } from "../../lib/format";
import { Sheet, SheetField } from "../../components/Sheet";
import { Skeleton } from "../../components/Skeleton";
import { AdminPage, AdminRecordList, StatusPill } from "./AdminShell";

type AuditEntry = FunctionReturnType<typeof api.admin.listAuditLog>[number];

export function AdminAuditLogPage() {
  const entries = useQuery(api.admin.listAuditLog, { limit: 200 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = entries?.find((e) => e._id === selectedId) ?? null;

  return (
    <AdminPage
      title="audit log"
      description="append-only history of control-plane actions. open view details for the full record."
    >
      {entries === undefined ? (
        <Skeleton preset="table" count={5} label="Loading audit log" />
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">
          empty so far. admin actions and onboarding events land here.
        </p>
      ) : (
        <AdminRecordList
          items={entries}
          recordLabel={(entry) => entry.action}
          onView={(entry) => setSelectedId(entry._id)}
          columns={[
            {
              label: "action",
              primary: true,
              className: "font-mono text-xs text-fg",
              render: (entry) => entry.action,
            },
            {
              label: "actor",
              className: "text-muted",
              render: (entry) => entry.actorName ?? "system",
            },
            {
              label: "target",
              render: (entry) =>
                entry.targetType ? (
                  <StatusPill tone="muted">{entry.targetType}</StatusPill>
                ) : (
                  "none"
                ),
            },
            {
              label: "when",
              className: "text-xs text-muted tabular-nums",
              render: (entry) => timeAgo(entry.createdAt),
            },
          ]}
        />
      )}

      {selected && (
        <AuditSheet entry={selected} onClose={() => setSelectedId(null)} />
      )}
    </AdminPage>
  );
}

function AuditSheet({
  entry,
  onClose,
}: {
  entry: AuditEntry;
  onClose: () => void;
}) {
  let metadata: string | null = null;
  if (entry.metadata) {
    try {
      metadata = JSON.stringify(JSON.parse(entry.metadata), null, 2);
    } catch {
      metadata = entry.metadata;
    }
  }

  return (
    <Sheet
      title={<span className="font-mono text-sm">{entry.action}</span>}
      subtitle={timeAgo(entry.createdAt)}
      onClose={onClose}
    >
      <div className="divide-y divide-border/60">
        <SheetField label="actor">{entry.actorName ?? "system"}</SheetField>
        <SheetField label="target type">{entry.targetType ?? "none"}</SheetField>
        {entry.targetId ? (
          <SheetField label="target id" mono>
            {entry.targetId}
          </SheetField>
        ) : null}
        <SheetField label="event id" mono>
          {entry._id}
        </SheetField>
      </div>
      {metadata && (
        <div className="mt-4">
          <div className="text-label font-medium lowercase text-muted">
            metadata
          </div>
          <pre className="mt-1.5 overflow-x-auto rounded-md border border-border bg-bg p-3 text-xs text-fg">
            {metadata}
          </pre>
        </div>
      )}
    </Sheet>
  );
}
