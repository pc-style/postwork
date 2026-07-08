import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { timeAgo } from "../../lib/format";
import { Avatar } from "../../components/Avatar";
import { Sheet, SheetField } from "../../components/Sheet";
import { AdminPage, AdminRow, AdminTable, StatusPill } from "./AdminShell";

type AdminUser = FunctionReturnType<typeof api.admin.listUsers>[number];

export function AdminUsersPage() {
  const users = useQuery(api.admin.listUsers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = users?.find((u) => u._id === selectedId) ?? null;

  return (
    <AdminPage
      title="users"
      description="every member and agent in the org. click a row for details and moderation actions."
    >
      {users === undefined ? (
        <p className="text-sm text-muted">loading…</p>
      ) : (
        <AdminTable head={["user", "title", "role", "status", "joined"]}>
          {users.map((user) => (
            <AdminRow key={user._id} onClick={() => setSelectedId(user._id)}>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar user={user} size={24} />
                  <span className="text-fg">{user.name}</span>
                  {user.isAgent && <StatusPill tone="muted">agent</StatusPill>}
                </div>
              </td>
              <td className="px-4 py-2.5 text-muted">{user.title}</td>
              <td className="px-4 py-2.5">
                <StatusPill tone={user.role === "admin" ? "good" : "muted"}>
                  {user.role ?? "member"}
                </StatusPill>
              </td>
              <td className="px-4 py-2.5">
                {user.deactivatedAt ? (
                  <StatusPill tone="bad">deactivated</StatusPill>
                ) : (
                  <StatusPill tone="muted">active</StatusPill>
                )}
              </td>
              <td className="px-4 py-2.5 text-xs text-muted tabular-nums">
                {timeAgo(user._creationTime)}
              </td>
            </AdminRow>
          ))}
        </AdminTable>
      )}

      {selected && (
        <UserSheet user={selected} onClose={() => setSelectedId(null)} />
      )}
    </AdminPage>
  );
}

function UserSheet({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const setRole = useMutation(api.users.setRole);
  const deactivate = useMutation(api.users.deactivate);
  const reactivate = useMutation(api.users.reactivate);
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<unknown>) => {
    setError(null);
    void action().catch((e) =>
      setError(e instanceof Error ? e.message : "that didn't work."),
    );
  };

  return (
    <Sheet
      title={user.name}
      subtitle={user.title}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {user.role === "admin" ? (
            <ActionButton
              onClick={() => run(() => setRole({ userId: user._id, role: "member" }))}
            >
              demote to member
            </ActionButton>
          ) : (
            <ActionButton
              onClick={() => run(() => setRole({ userId: user._id, role: "admin" }))}
            >
              make admin
            </ActionButton>
          )}
          {user.deactivatedAt ? (
            <ActionButton
              onClick={() => run(() => reactivate({ userId: user._id }))}
            >
              reactivate
            </ActionButton>
          ) : (
            <ActionButton
              danger
              onClick={() => run(() => deactivate({ userId: user._id }))}
            >
              deactivate
            </ActionButton>
          )}
        </div>
      }
    >
      <div className="divide-y divide-border/60">
        <SheetField label="role">{user.role ?? "member"}</SheetField>
        <SheetField label="type">{user.isAgent ? "coding agent" : "human"}</SheetField>
        <SheetField label="status">
          {user.deactivatedAt
            ? `deactivated ${timeAgo(user.deactivatedAt)}`
            : "active"}
        </SheetField>
        <SheetField label="joined">{timeAgo(user._creationTime)}</SheetField>
        <SheetField label="user id" mono>
          {user._id}
        </SheetField>
      </div>
      {error && <p className="mt-4 text-xs text-urgent">{error}</p>}
    </Sheet>
  );
}

export function ActionButton({
  onClick,
  danger = false,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs transition-colors active:scale-[0.96] ${
        danger
          ? "border-urgent/40 text-urgent hover:bg-urgent/10"
          : "border-border text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
