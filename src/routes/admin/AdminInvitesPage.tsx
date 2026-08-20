import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
  const [spaceId, setSpaceId] = useState("");
  const spaces = useQuery(api.spaces.list, {});
  const openSpaces = (spaces ?? []).filter((space) => !space.archivedAt);
  const selected = invites?.find((i) => i._id === selectedId) ?? null;

  const mint = async () => {
    setCreating(true);
    setTargetError(null);
    try {
      const id = await createInvite({
        maxUses: 1,
        target: target.trim() || undefined,
        spaceId: spaceId ? (spaceId as Id<"spaces">) : undefined,
      });
      setTarget("");
      setSpaceId("");
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
      description="codes that admit new members. single-use by default; revoke anytime. add a github handle or email to reserve the invite for that person — they activate automatically on sign-in. pick a landing space and redeeming drops them straight into it, private spaces included."
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
              className="ui-field min-w-0 max-w-56 flex-1 font-mono text-body placeholder:font-sans"
            />
            {openSpaces.length > 0 ? (
              <select
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
                aria-label="Landing space"
                className="min-h-11 rounded-lg border border-border bg-bg px-2 py-2 text-xs text-fg focus:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent-soft"
              >
                <option value="">no landing space</option>
                {openSpaces.map((space) => (
                  <option key={space._id} value={space._id}>
                    → {space.name}
                  </option>
                ))}
              </select>
            ) : null}
            <Button
              onClick={() => void mint()}
              loading={creating}
              loadingLabel="minting…"
            >
              {target.trim() ? "invite" : "new invite"}
            </Button>
          </div>
          {targetError && (
            <p className="text-body text-urgent">{targetError}</p>
          )}
        </div>
      }
    >
      {invites === undefined ? (
        <Skeleton preset="table" count={5} label="loading invites" />
      ) : invites.length === 0 ? (
        <p className="text-body text-muted">
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
              className: "font-mono text-body text-fg",
              render: (invite) => invite.code,
            },
            {
              label: "for",
              className: "max-w-[12rem] truncate font-mono text-body text-accent-soft",
              render: (invite) => formatTarget(invite) ?? <span className="text-muted">none</span>,
            },
            {
              label: "space",
              className: "max-w-[10rem] truncate text-xs text-muted",
              render: (invite) => invite.spaceName ?? <span className="text-muted">—</span>,
            },
            {
              label: "note",
              className: "max-w-[16rem] truncate text-muted",
              render: (invite) => invite.note ?? "none",
            },
            {
              label: "uses",
              className: "text-body text-muted tabular-nums",
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
              className: "text-body text-muted tabular-nums",
              render: (invite) => timeAgo(invite.createdAt),
            },
          ]}
        />
      )}

      <AutoJoinDomains />

      {selected && (
        <InviteSheet invite={selected} onClose={() => setSelectedId(null)} />
      )}
    </AdminPage>
  );
}

/**
 * JIT provisioning: sign-ups whose email lives on a claimed domain become
 * members automatically, no invite needed. Claiming requires the admin's own
 * email to be on the domain; public providers are refused server-side.
 */
function AutoJoinDomains() {
  const domains = useQuery(api.orgDomains.list);
  const addDomain = useMutation(api.orgDomains.add);
  const removeDomain = useMutation(api.orgDomains.remove);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await addDomain({ domain: draft });
      setDraft("");
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message.length < 200
          ? caught.message.replace(/^.*Uncaught ConvexError:?\s*/i, "").split("\n")[0]
          : "couldn't add that domain.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-10">
      <h2 className="text-body font-medium lowercase text-muted">auto-join domains</h2>
      <p className="mt-1 max-w-2xl text-body text-muted">
        anyone signing up with an email on these domains joins this workspace
        automatically — no invite needed. you can only claim the domain your
        own email uses; public providers are refused.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(domains ?? []).map((entry) => (
          <span
            key={entry._id}
            className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 font-mono text-body text-fg"
          >
            {entry.domain}
            <button
              type="button"
              aria-label={`stop auto-join for ${entry.domain}`}
              disabled={busy}
              onClick={() => void removeDomain({ domainId: entry._id })}
              className="rounded px-1 text-body text-muted transition-colors hover:bg-surface-2 hover:text-urgent focus-visible:outline-2 focus-visible:outline-accent-soft"
            >
              remove
            </button>
          </span>
        ))}
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            placeholder="acme.com"
            aria-label="Claim an auto-join domain"
            className="min-h-11 w-40 rounded-lg border border-dashed border-border bg-bg px-3 py-2 font-mono text-body placeholder:font-sans focus:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent-soft"
          />
          <Button type="submit" variant="secondary" size="sm" loading={busy} loadingLabel="adding…" disabled={!draft.trim()}>
            add domain
          </Button>
        </form>
      </div>
      {error ? <p role="alert" className="mt-2 text-body text-urgent">{error}</p> : null}
    </section>
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
      title={<span className="font-mono text-body">{invite.code}</span>}
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
