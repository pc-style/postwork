import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { timeAgo } from "../../lib/format";
import { Button } from "../../components/Button";
import { Sheet, SheetField } from "../../components/Sheet";
import { Skeleton } from "../../components/Skeleton";
import { AdminPage, AdminRecordList, StatusPill } from "./AdminShell";
import { ActionButton } from "./AdminUsersPage";

type Invite = FunctionReturnType<typeof api.admin.listInvites>[number];

function formatTarget(invite: Invite): string | null {
  if (!invite.targetKind || !invite.targetValue) return null;
  return invite.targetKind === "github"
    ? `@${invite.targetValue}`
    : invite.targetValue;
}

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
  const [target, setTarget] = useState("");
  const [targetError, setTargetError] = useState<string | null>(null);
  const selected = invites?.find((i) => i._id === selectedId) ?? null;

  const mint = async () => {
    setCreating(true);
    setTargetError(null);
    try {
      const id = await createInvite({
        maxUses: 1,
        target: target.trim() || undefined,
      });
      setTarget("");
      setSelectedId(id);
    } catch (err) {
      setTargetError(
        err instanceof Error && err.message.includes("valid")
          ? "enter a github handle or email."
          : "couldn't create the invite. check your connection and try again.",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <AdminPage
      title="invites"
      description="codes that admit new members. single-use by default; revoke anytime. add a github handle or email to reserve the invite for that person. they activate automatically on sign-in."
      actions={
        <div className="flex flex-col items-end gap-1">
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <input
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setTargetError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !creating) void mint();
              }}
              placeholder="@github-handle or email (optional)"
              className="min-h-11 w-full min-w-0 max-w-56 flex-1 rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs placeholder:font-sans focus:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent-soft"
            />
            <Button
              onClick={() => void mint()}
              loading={creating}
              loadingLabel="minting…"
            >
              {target.trim() ? "invite" : "new invite"}
            </Button>
          </div>
          {targetError && (
            <p className="text-xs text-urgent">{targetError}</p>
          )}
        </div>
      }
    >
      {invites === undefined ? (
        <Skeleton preset="table" count={5} label="Loading invites" />
      ) : invites.length === 0 ? (
        <p className="text-sm text-muted">
          no invites yet. mint one and share the code.
        </p>
      ) : (
        <AdminRecordList
          items={invites}
          recordLabel={(invite) => invite.code}
          onView={(invite) => setSelectedId(invite._id)}
          columns={[
            {
              label: "code",
              primary: true,
              className: "font-mono text-xs text-fg",
              render: (invite) => invite.code,
            },
            {
              label: "for",
              className: "max-w-[12rem] truncate font-mono text-xs text-accent-soft",
              render: (invite) => formatTarget(invite) ?? <span className="text-muted">none</span>,
            },
            {
              label: "note",
              className: "max-w-[16rem] truncate text-muted",
              render: (invite) => invite.note ?? "none",
            },
            {
              label: "uses",
              className: "text-xs text-muted tabular-nums",
              render: (invite) => `${invite.usedCount}/${invite.maxUses === 0 ? "unlimited" : invite.maxUses}`,
            },
            {
              label: "status",
              render: (invite) => {
                const status = inviteStatus(invite);
                return <StatusPill tone={status.tone}>{status.label}</StatusPill>;
              },
            },
            {
              label: "created",
              className: "text-xs text-muted tabular-nums",
              render: (invite) => timeAgo(invite.createdAt),
            },
          ]}
        />
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
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const status = inviteStatus(invite);

  const inviteLink = `${window.location.origin}/join/${invite.code}`;

  const copy = (kind: "code" | "link", value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <Sheet
      title={<span className="font-mono text-sm">{invite.code}</span>}
      subtitle={`minted by ${invite.createdByName}`}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton onClick={() => copy("code", invite.code)}>
            {copied === "code" ? "copied" : "copy code"}
          </ActionButton>
          <ActionButton onClick={() => copy("link", inviteLink)}>
            {copied === "link" ? "copied" : "copy link"}
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
        {formatTarget(invite) && (
          <SheetField label="reserved for" mono>
            {formatTarget(invite)}
          </SheetField>
        )}
        <SheetField label="uses">
          {invite.usedCount} of {invite.maxUses === 0 ? "unlimited" : invite.maxUses}
        </SheetField>
        <SheetField label="note">{invite.note ?? "none"}</SheetField>
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
