import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { timeAgo } from "../../lib/format";
import { Sheet, SheetField } from "../../components/Sheet";
import { AdminPage, AdminRow, AdminTable, StatusPill } from "./AdminShell";
import { ActionButton } from "./AdminUsersPage";

type AccessRequest = FunctionReturnType<
  typeof api.admin.listAccessRequests
>[number];

const STATUS_TONE = {
  pending: "warn",
  approved: "good",
  denied: "bad",
} as const;

export function AdminAccessRequestsPage() {
  const requests = useQuery(api.admin.listAccessRequests);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = requests?.find((r) => r._id === selectedId) ?? null;

  return (
    <AdminPage
      title="access requests"
      description="people who asked to join. approving mints a single-use invite for them."
    >
      {requests === undefined ? (
        <p className="text-sm text-muted">loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted">
          no requests yet. they land here when someone asks to join from the
          sign-in screen.
        </p>
      ) : (
        <AdminTable head={["email", "name", "status", "requested"]}>
          {requests.map((request) => (
            <AdminRow
              key={request._id}
              onClick={() => setSelectedId(request._id)}
            >
              <td className="px-4 py-2.5 text-fg">{request.email}</td>
              <td className="px-4 py-2.5 text-muted">{request.name ?? "—"}</td>
              <td className="px-4 py-2.5">
                <StatusPill tone={STATUS_TONE[request.status]}>
                  {request.status}
                </StatusPill>
              </td>
              <td className="px-4 py-2.5 text-xs text-muted tabular-nums">
                {timeAgo(request.createdAt)}
              </td>
            </AdminRow>
          ))}
        </AdminTable>
      )}

      {selected && (
        <RequestSheet request={selected} onClose={() => setSelectedId(null)} />
      )}
    </AdminPage>
  );
}

function RequestSheet({
  request,
  onClose,
}: {
  request: AccessRequest;
  onClose: () => void;
}) {
  const approve = useMutation(api.admin.approveAccessRequest);
  const deny = useMutation(api.admin.denyAccessRequest);
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<unknown>) => {
    setError(null);
    void action().catch((e) =>
      setError(e instanceof Error ? e.message : "that didn't work."),
    );
  };

  return (
    <Sheet
      title={request.email}
      subtitle={request.name}
      onClose={onClose}
      footer={
        request.status === "pending" ? (
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              onClick={() => run(() => approve({ requestId: request._id }))}
            >
              approve + mint invite
            </ActionButton>
            <ActionButton
              danger
              onClick={() => run(() => deny({ requestId: request._id }))}
            >
              deny
            </ActionButton>
          </div>
        ) : undefined
      }
    >
      <div className="divide-y divide-border/60">
        <SheetField label="status">
          <StatusPill tone={STATUS_TONE[request.status]}>
            {request.status}
          </StatusPill>
        </SheetField>
        <SheetField label="message">
          {request.message ?? "no message"}
        </SheetField>
        <SheetField label="requested">{timeAgo(request.createdAt)}</SheetField>
        {request.resolvedAt ? (
          <SheetField label="resolved">{timeAgo(request.resolvedAt)}</SheetField>
        ) : null}
        {request.inviteId ? (
          <SheetField label="minted invite" mono>
            {request.inviteId}
          </SheetField>
        ) : null}
        <SheetField label="request id" mono>
          {request._id}
        </SheetField>
      </div>
      {request.status === "approved" && (
        <p className="mt-4 text-xs text-muted">
          the invite code is in the invites section — copy it there and send it
          to the requester.
        </p>
      )}
      {error && <p className="mt-4 text-xs text-urgent">{error}</p>}
    </Sheet>
  );
}
