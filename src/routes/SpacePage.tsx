import { useState } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useSpaces, type Org } from "../lib/spaces";
import { priorityStyles, timeAgo, titleCase } from "../lib/format";
import { Button } from "../components/Button";
import { Chip } from "../components/Chip";
import { priorityTones } from "../components/PostMetaChips";
import { PostForm } from "../components/PostForm";
import { OrgSquare } from "../components/OrgSquare";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { useDocumentTitle } from "../lib/useDocumentTitle";

type Visibility = "space" | "org" | "public";

// Visual glyph for the space: a tinted tile carrying the member orgs' colors.
function SpaceGlyph({ orgs }: { orgs: Org[] }) {
  const a = orgs[0]?.color ?? "var(--color-accent)";
  const b = orgs[1]?.color ?? "var(--color-accent-soft)";
  return (
    <div
      className="flex size-20 shrink-0 items-center justify-center rounded-lg border border-border"
      style={{
        background:
          "radial-gradient(120% 120% at 20% 15%, color-mix(in srgb, var(--color-accent) 22%, transparent), transparent 60%), var(--color-surface-2)",
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="size-5 rounded-full" style={{ backgroundColor: a }} />
        <span className="text-label text-muted">×</span>
        <span className="size-5 rounded-full" style={{ backgroundColor: b }} />
      </div>
    </div>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden="true">
      <path
        d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9.5 9.5 0 0 1-4-.9L3 20l1.4-5A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-3.5" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function SpacePage() {
  const { slug } = getRouteApi("/app/spaces/$slug").useParams();
  const { orgs, spaceBySlug, membershipsForSpace, inviteOrg, feedForSpace, postToSpace } = useSpaces();
  const [inviteHandle, setInviteHandle] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("space");

  const space = spaceBySlug(slug);
  useDocumentTitle(space ? `${space.name} · postwork` : "space · postwork");
  if (!space) {
    return (
      <div className="py-12 text-center text-sm text-muted">
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

  return (
    <div>
      <PageHeader backTo="/spaces" backLabel="spaces" />

      <header className="mb-5 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <SpaceGlyph orgs={members.map((m) => m.org)} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-fg">{space.name}</h1>
            {space.description && (
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
                {space.description}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {members.map(({ org, role }) => (
                <div
                  key={org.id}
                  className="flex items-center gap-2 rounded-full border border-border bg-bg py-1 pl-1.5 pr-2.5 text-xs"
                >
                  <OrgSquare org={org} size="size-5" />
                  <span className="text-fg">{org.name}</span>
                  <Chip tone="muted" size="sm" className="rounded-full bg-surface-2">
                    {role}
                  </Chip>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input
                  value={inviteHandle}
                  onChange={(e) => setInviteHandle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitInvite()}
                  placeholder="@handle"
                  className="w-32 rounded-full border border-border bg-bg px-3 py-1.5 text-xs outline-none focus:border-accent/50"
                />
                <Button variant="pill" onClick={submitInvite}>
                  invite org
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {posts.length === 0 ? (
        <EmptyState>no posts in this space yet.</EmptyState>
      ) : (
      <div className="space-y-2.5">
        {posts.map((post) => {
          const org = orgs.find((candidate) => candidate.id === post.orgId);
          const p = priorityStyles[post.priority];
          const snippet = post.body.length > 220 ? `${post.body.slice(0, 220).trimEnd()}…` : post.body;
          const isPrivate = post.visibility === "org";
          return (
            <article
              key={post.id}
              className="group rounded-lg border border-border bg-surface p-4 transition hover:border-accent/40 hover:bg-surface-2"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-label">
                    <Chip tone={priorityTones[post.priority] ?? "muted"} dot>
                      {p.label}
                    </Chip>
                    {org && (
                      <Chip tone="neutral">
                        <OrgSquare org={org} size="size-4" />
                        {org.name}
                      </Chip>
                    )}
                    <Chip tone="accent">{titleCase(post.visibility)}</Chip>
                  </div>
                  <h2 className="text-title font-semibold text-fg">{post.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{snippet}</p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                    <div
                      style={{ backgroundColor: post.authorColor }}
                      className="flex size-5 items-center justify-center rounded-sm text-label font-semibold text-fg"
                    >
                      {post.authorInitials}
                    </div>
                    <span>{post.authorName}</span>
                    <span>·</span>
                    <span>{timeAgo(post.createdAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-3 pt-0.5 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5 tabular-nums" title={`${post.replyCount} replies`}>
                    <CommentIcon />
                    {post.replyCount}
                  </span>
                  {isPrivate && (
                    <span className="text-accent-soft" title="org-only">
                      <LockIcon />
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      )}

      <section className="mt-5 rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-fg">post to space</h2>
        <PostForm
          titlePlaceholder="title"
          bodyPlaceholder="share context for both orgs…"
          onCancel={() => setVisibility("space")}
          extraFields={
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">visibility</span>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as Visibility)}
                className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent/50"
              >
                <option value="space">space</option>
                <option value="org">org</option>
                <option value="public">public</option>
              </select>
            </label>
          }
          onSubmit={({ title, body, priority }) => {
            postToSpace({ spaceId: space.id, title, body, priority, visibility });
            setVisibility("space");
          }}
        />
      </section>
    </div>
  );
}
