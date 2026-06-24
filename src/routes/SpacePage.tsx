import { useState } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useSpaces, type Org } from "../lib/spaces";
import { PRIORITIES, priorityStyles, timeAgo } from "../lib/format";

type Priority = (typeof PRIORITIES)[number];
type Visibility = "space" | "org" | "public";

function OrgSquare({ org }: { org: Org }) {
  return (
    <div
      style={{ backgroundColor: org.color }}
      className="flex size-6 items-center justify-center rounded-md text-[10px] font-semibold text-fg"
      title={`${org.name} @${org.handle}`}
    >
      {org.initials}
    </div>
  );
}

export function SpacePage() {
  const { slug } = getRouteApi("/spaces/$slug").useParams();
  const { orgs, spaceBySlug, membershipsForSpace, inviteOrg, feedForSpace, postToSpace } = useSpaces();
  const [inviteHandle, setInviteHandle] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [visibility, setVisibility] = useState<Visibility>("space");

  const space = spaceBySlug(slug);
  if (!space) {
    return (
      <div className="py-12 text-center text-sm text-[var(--color-muted)]">
        space not found. <Link to="/spaces" className="text-accent-soft">back to spaces</Link>
      </div>
    );
  }

  const members = membershipsForSpace(space.id);
  const posts = feedForSpace(space.id);

  const submitInvite = () => {
    if (!inviteHandle.trim()) return;
    inviteOrg(space.id, inviteHandle);
    setInviteHandle("");
  };

  const submitPost = () => {
    if (!title.trim() || !body.trim()) return;
    postToSpace({ spaceId: space.id, title, body, priority, visibility });
    setTitle("");
    setBody("");
    setPriority("normal");
    setVisibility("space");
  };

  return (
    <div>
      <Link to="/spaces" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] transition hover:text-fg">
        ← spaces
      </Link>

      <header className="mb-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h1 className="text-xl font-semibold text-fg">{space.name}</h1>
        {space.description && <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">{space.description}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {members.map(({ org, status, role }) => (
              <div key={org.id} className="flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)]">
                <OrgSquare org={org} />
                <span className="text-fg">{org.name}</span>
                <span>{role}</span>
                <span>{status}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={inviteHandle} onChange={(e) => setInviteHandle(e.target.value)} placeholder="@handle" className="w-36 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-accent/50" />
            <button onClick={submitInvite} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-fg transition hover:bg-accent-soft">
              invite org
            </button>
          </div>
        </div>
      </header>

      <div className="space-y-2.5">
        {posts.map((post) => {
          const org = orgs.find((candidate) => candidate.id === post.orgId);
          const p = priorityStyles[post.priority];
          const snippet = post.body.length > 220 ? `${post.body.slice(0, 220).trimEnd()}…` : post.body;
          return (
            <article key={post.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 ${p.className}`}>
                  <span className={`size-1.5 rounded-full ${p.dot}`} />
                  {p.label}
                </span>
                {org && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-1.5 py-0.5 text-[var(--color-muted)]">
                    <OrgSquare org={org} />
                    {org.name}
                  </span>
                )}
                <span className="rounded-md border border-[var(--color-border)] px-1.5 py-0.5 text-[var(--color-muted)]">{post.visibility}</span>
              </div>
              <h2 className="text-[15px] font-semibold text-fg">{post.title}</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{snippet}</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-[var(--color-muted)]">
                <div style={{ backgroundColor: post.authorColor }} className="flex size-5 items-center justify-center rounded-sm text-[9px] font-semibold text-fg">
                  {post.authorInitials}
                </div>
                <span>{post.authorName}</span>
                <span>·</span>
                <span>{timeAgo(post.createdAt)}</span>
              </div>
            </article>
          );
        })}
      </div>

      <section className="mt-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-fg">post to space</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="title" className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm font-medium outline-none focus:border-accent/50" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="share context for both orgs…" className="mb-3 w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm outline-none focus:border-accent/50" />
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--color-muted)]">priority</span>
            <div className="flex gap-1">
              {PRIORITIES.map((pr) => (
                <button key={pr} onClick={() => setPriority(pr)} className={`rounded-md border px-2.5 py-1 text-xs lowercase transition ${priority === pr ? priorityStyles[pr].className : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-fg"}`}>
                  {pr}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--color-muted)]">visibility</span>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-sm outline-none">
              <option value="space">space</option>
              <option value="org">org</option>
              <option value="public">public</option>
            </select>
          </label>
        </div>
        <div className="flex justify-end">
          <button onClick={submitPost} disabled={!title.trim() || !body.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fg transition hover:bg-accent-soft disabled:opacity-40">
            post
          </button>
        </div>
      </section>
    </div>
  );
}
