import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { timeAgo } from "../../lib/format";
import { Sheet, SheetField } from "../../components/Sheet";
import { AdminPage, AdminRow, AdminTable, StatusPill } from "./AdminShell";

type AuditEntry = FunctionReturnType<typeof api.admin.listAuditLog>[number];

export function AdminAuditLogPage() {
  const entries = useQuery(api.admin.listAuditLog, { limit: 200 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = entries?.find((e) => e._id === selectedId) ?? null;

  return (
    <AdminPage
      title="audit log"
      description="append-only history of control-plane actions. click an event for the full record."
    >
      {entries === undefined ? (
        <p className="text-sm text-muted">loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">
          empty so far. admin actions and onboarding events land here.
        </p>
      ) : (
        <AdminTable head={["action", "actor", "target", "when"]}>
          {entries.map((entry) => (
            <AdminRow key={entry._id} onClick={() => setSelectedId(entry._id)}>
              <td className="px-4 py-2.5 font-mono text-xs text-fg">
                {entry.action}
              </td>
              <td className="px-4 py-2.5 text-muted">
                {entry.actorName ?? "system"}
              </td>
              <td className="px-4 py-2.5">
                {entry.targetType ? (
                  <StatusPill tone="muted">{entry.targetType}</StatusPill>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-2.5 text-xs text-muted tabular-nums">
                {timeAgo(entry.createdAt)}
              </td>
            </AdminRow>
          ))}
        </AdminTable>
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
        <SheetField label="target type">{entry.targetType ?? "—"}</SheetField>
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
