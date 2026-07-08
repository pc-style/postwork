import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { timeAgo } from "../../lib/format";
import { Sheet, SheetField } from "../../components/Sheet";
import {
  AdminPage,
  AdminRow,
  AdminTable,
  StatusPill,
} from "./AdminShell";
import { ActionButton } from "./AdminUsersPage";

type Invite = FunctionReturnType<typeof api.admin.listInvites>[number];

function inviteStatus(invite: Invite): {
  label: string;
  tone: "good" | "bad" | "muted";
} {
  if (invite.revokedAt) return { label: "revoked", tone: "bad" };
  if (invite.expiresAt && invite.expiresAt <= Date.now())
    return { label: "expired", tone: "muted" };
  if (invite.maxUses > 0 && invite.usedCount >= invite.maxUses)
    return { label: "used up", tone: "muted" };
  return { label: "active", tone: "good" };
}

export function AdminInvitesPage() {
  const invites = useQuery(api.admin.listInvites);
  const createInvite = useMutation(api.admin.createInvite);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const selected = invites?.find((i) => i._id === selectedId) ?? null;

  const mint = async () => {
    setCreating(true);
    try {
      const id = await createInvite({ maxUses: 1 });
      setSelectedId(id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <AdminPage
      title="invites"
      description="codes that admit new members. single-use by default; revoke anytime."
      actions={
        <button
          type="button"
          onClick={() => void mint()}
          disabled={creating}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fg transition-[background-color,scale] hover:bg-accent-soft active:scale-[0.96] disabled:opacity-40"
        >
          {creating ? "minting…" : "new invite"}
        </button>
      }
    >
      {invites === undefined ? (
        <p className="text-sm text-muted">loading…</p>
      ) : invites.length === 0 ? (
        <p className="text-sm text-muted">
          no invites yet. mint one and share the code.
        </p>
      ) : (
        <AdminTable head={["code", "note", "uses", "status", "created"]}>
          {invites.map((invite) => {
            const status = inviteStatus(invite);
            return (
              <AdminRow
                key={invite._id}
                onClick={() => setSelectedId(invite._id)}
              >
                <td className="px-4 py-2.5 font-mono text-xs text-fg">
                  {invite.code}
                </td>
                <td className="max-w-[16rem] truncate px-4 py-2.5 text-muted">
                  {invite.note ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted tabular-nums">
                  {invite.usedCount}/{invite.maxUses === 0 ? "∞" : invite.maxUses}
                </td>
                <td className="px-4 py-2.5">
                  <StatusPill tone={status.tone}>{status.label}</StatusPill>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted tabular-nums">
                  {timeAgo(invite.createdAt)}
                </td>
              </AdminRow>
            );
          })}
        </AdminTable>
      )}

      {selected && (
        <InviteSheet invite={selected} onClose={() => setSelectedId(null)} />
      )}
    </AdminPage>
  );
}

function InviteSheet({
  invite,
  onClose,
}: {
  invite: Invite;
  onClose: () => void;
}) {
  const revoke = useMutation(api.admin.revokeInvite);
  const [copied, setCopied] = useState(false);
  const status = inviteStatus(invite);

  const copy = () => {
    void navigator.clipboard.writeText(invite.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Sheet
      title={<span className="font-mono text-sm">{invite.code}</span>}
      subtitle={`minted by ${invite.createdByName}`}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton onClick={copy}>
            {copied ? "copied" : "copy code"}
          </ActionButton>
          {!invite.revokedAt && (
            <ActionButton
              danger
              onClick={() => void revoke({ inviteId: invite._id })}
            >
              revoke
            </ActionButton>
          )}
        </div>
      }
    >
      <div className="divide-y divide-border/60">
        <SheetField label="status">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
        </SheetField>
        <SheetField label="uses">
          {invite.usedCount} of {invite.maxUses === 0 ? "unlimited" : invite.maxUses}
        </SheetField>
        <SheetField label="note">{invite.note ?? "—"}</SheetField>
        <SheetField label="created">{timeAgo(invite.createdAt)}</SheetField>
        {invite.expiresAt ? (
          <SheetField label="expires">{timeAgo(invite.expiresAt)}</SheetField>
        ) : null}
        {invite.revokedAt ? (
          <SheetField label="revoked">{timeAgo(invite.revokedAt)}</SheetField>
        ) : null}
        <SheetField label="invite id" mono>
          {invite._id}
        </SheetField>
      </div>
    </Sheet>
  );
}
