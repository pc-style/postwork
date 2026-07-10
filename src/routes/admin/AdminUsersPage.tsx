import { useEffect, useState } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { AdminUsersFilter } from "../../router";
import { timeAgo } from "../../lib/format";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Sheet, SheetField } from "../../components/Sheet";
import { Skeleton } from "../../components/Skeleton";
import { AdminPage, AdminRecordList, StatusPill } from "./AdminShell";

type AdminUser = FunctionReturnType<typeof api.admin.listUsers>[number];

const routeApi = getRouteApi("/admin/users");

const FILTERS: { label: string; value: AdminUsersFilter | undefined }[] = [
  { label: "all", value: undefined },
  { label: "members", value: "members" },
  { label: "agents", value: "agents" },
  { label: "deactivated", value: "deactivated" },
];

function matchesFilter(user: AdminUser, filter: AdminUsersFilter | undefined) {
  switch (filter) {
    case "members":
      return !user.isAgent;
    case "agents":
      return user.isAgent;
    case "deactivated":
      return user.deactivatedAt !== undefined && user.deactivatedAt !== null;
    default:
      return true;
  }
}

export function AdminUsersPage() {
  const { filter } = routeApi.useSearch();
  const users = useQuery(api.admin.listUsers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = users?.find((u) => u._id === selectedId) ?? null;
  const visible = users?.filter((u) => matchesFilter(u, filter));

  return (
    <AdminPage
      title="users"
      description="every member and agent in the org. open view details for moderation actions."
    >
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {FILTERS.map(({ label, value }) => (
          <Link
            key={label}
            to="/admin/users"
            search={value ? { filter: value } : {}}
            className={`inline-flex min-h-11 items-center rounded-md border px-2.5 py-1 text-xs lowercase transition-colors sm:min-h-9 ${
              filter === value
                ? "border-accent/40 bg-surface text-fg"
                : "border-border text-muted hover:text-fg"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
      {visible === undefined ? (
        <Skeleton preset="table" count={5} label="Loading users" />
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted">
          no {filter ?? "users"} here{filter ? " yet" : ""}.
        </p>
      ) : (
        <AdminRecordList
          items={visible}
          recordLabel={(user) => user.name}
          onView={(user) => setSelectedId(user._id)}
          columns={[
            {
              label: "user",
              primary: true,
              render: (user) => (
                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                  <Avatar user={user} size={24} />
                  <span className="min-w-0 break-words text-fg">{user.name}</span>
                  {user.isAgent && <StatusPill tone="muted">agent</StatusPill>}
                </div>
              ),
            },
            {
              label: "title",
              className: "text-muted",
              render: (user) => user.title,
            },
            {
              label: "role",
              render: (user) => (
                <StatusPill tone={user.role === "admin" ? "good" : "muted"}>
                  {user.role ?? "member"}
                </StatusPill>
              ),
            },
            {
              label: "status",
              render: (user) =>
                user.deactivatedAt ? (
                  <StatusPill tone="bad">deactivated</StatusPill>
                ) : (
                  <StatusPill tone="muted">active</StatusPill>
                ),
            },
            {
              label: "joined",
              className: "text-xs text-muted tabular-nums",
              render: (user) => timeAgo(user._creationTime),
            },
          ]}
        />
      )}

      {selected && (
        <UserSheet user={selected} onClose={() => setSelectedId(null)} />
      )}
    </AdminPage>
  );
}

function UserSheet({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const setRole = useMutation(api.users.setRole);
  const setTitle = useMutation(api.admin.setTitle);
  const deactivate = useMutation(api.users.deactivate);
  const reactivate = useMutation(api.users.reactivate);
  const [title, setTitleDraft] = useState(user.title);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitleDraft(user.title);
    setError(null);
  }, [user._id, user.title]);

  const run = (action: () => Promise<unknown>, operation: string) => {
    setError(null);
    void action().catch((e) =>
      setError(
        e instanceof Error
          ? e.message
          : `couldn't ${operation}. check your connection and try again.`,
      ),
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
              onClick={() =>
                run(
                  () => setRole({ userId: user._id, role: "member" }),
                  "change the role",
                )
              }
            >
              demote to member
            </ActionButton>
          ) : (
            <ActionButton
              onClick={() =>
                run(
                  () => setRole({ userId: user._id, role: "admin" }),
                  "change the role",
                )
              }
            >
              make admin
            </ActionButton>
          )}
          {user.deactivatedAt ? (
            <ActionButton
              onClick={() =>
                run(() => reactivate({ userId: user._id }), "reactivate this user")
              }
            >
              reactivate
            </ActionButton>
          ) : (
            <ActionButton
              danger
              onClick={() =>
                run(() => deactivate({ userId: user._id }), "deactivate this user")
              }
            >
              deactivate
            </ActionButton>
          )}
        </div>
      }
    >
      <div className="divide-y divide-border/60">
        <div className="py-2.5">
          <label htmlFor="admin-user-title" className="block">
            <span className="text-label font-medium lowercase text-muted">
              job title
            </span>
            <input
              id="admin-user-title"
              value={title}
              onChange={(event) => setTitleDraft(event.target.value)}
              placeholder="role or description, not permissions"
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg transition-colors placeholder:text-muted/60 focus:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent-soft"
            />
          </label>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted">
              permissions are controlled by role.
            </p>
            <ActionButton
              onClick={() =>
                run(
                  () => setTitle({ userId: user._id, title: title.trim() }),
                  "save the job title",
                )
              }
            >
              save
            </ActionButton>
          </div>
        </div>
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
  loading = false,
  disabled = false,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={danger ? "danger" : "secondary"}
      size="sm"
      loading={loading}
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 sm:min-h-9"
    >
      {children}
    </Button>
  );
}
