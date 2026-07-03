import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSpaces } from "../lib/spaces";
import { Button } from "../components/Button";
import { OrgSquare } from "../components/OrgSquare";

function parseHandles(value: string) {
  return value
    .split(/[\s,]+/)
    .map((handle) => handle.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
}

export function SpacesPage() {
  const {
    spaces,
    invitesForMyOrg,
    membershipsForSpace,
    createSpace,
    acceptInvite,
    declineInvite,
  } = useSpaces();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [handles, setHandles] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    createSpace({
      name: name.trim(),
      description: description.trim() || undefined,
      inviteHandles: parseHandles(handles),
    });
    setName("");
    setDescription("");
    setHandles("");
  };

  return (
    <div>
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition hover:text-fg"
      >
        ← feed
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-fg">spaces</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            shared cross-company rooms where your org and external teams can keep launch plans, incidents, and decisions in one feed.
          </p>
        </div>
        <Link to="/orgs" className="text-sm text-accent-soft transition hover:text-fg">
          linked orgs →
        </Link>
      </div>

      {invitesForMyOrg.length > 0 && (
        <section className="mb-5 rounded-lg border border-accent/30 bg-accent/10 p-4">
          <h2 className="mb-3 text-sm font-semibold text-accent-soft">pending invites</h2>
          <div className="space-y-2">
            {invitesForMyOrg.map(({ space, fromOrg }) => (
              <div key={space.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface p-3">
                <div>
                  <div className="text-sm font-medium text-fg">{space.name}</div>
                  <div className="text-xs text-muted">from {fromOrg.name}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => acceptInvite(space.id)}>
                    accept
                  </Button>
                  <button onClick={() => declineInvite(space.id)} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted transition hover:text-fg">
                    decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-5 rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-fg">create shared space</h2>
        <div className="grid gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="space name" className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent/50" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional description" className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent/50" />
          <div className="flex flex-wrap gap-2">
            <input value={handles} onChange={(e) => setHandles(e.target.value)} placeholder="invite org by @handle" className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent/50" />
            <Button onClick={submit} disabled={!name.trim()}>
              create space
            </Button>
          </div>
        </div>
      </section>

      <div className="space-y-2.5">
        {spaces.map((space) => {
          const members = membershipsForSpace(space.id);
          return (
            <Link key={space.id} to="/spaces/$slug" params={{ slug: space.slug }} className="group block rounded-lg border border-border bg-surface p-4 transition hover:border-accent/40 hover:bg-surface-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-title font-semibold text-fg">{space.name}</h3>
                  {space.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{space.description}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {members.map(({ org, status }) => (
                    <div key={org.id} className="flex items-center gap-1" title={`${org.name}: ${status}`}>
                      <OrgSquare org={org} />
                      {status !== "active" && <span className="text-label text-muted">{status}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
