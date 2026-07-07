import { Link } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { timeAgo } from "../lib/format";
import { useSpacesList } from "../lib/spaces";

export function SpacesPage() {
  useDocumentTitle("spaces · postwork");
  const spaces = useSpacesList().slice().sort((a, b) => b.latestActivityAt - a.latestActivityAt);

  return (
    <div>
      <PageHeader
        backTo="/"
        backLabel="feed"
        title="spaces"
        description="shared threads with their own durable feed. same post model, same unread state, same post detail."
      />

      {spaces.length === 0 ? (
        <EmptyState>no spaces yet.</EmptyState>
      ) : (
        <div className="space-y-2.5">
          {spaces.map((space) => (
            <Link
              key={space._id}
              to="/spaces/$slug"
              params={{ slug: space.slug }}
              className="group block rounded-lg border border-border bg-surface p-4 transition hover:border-accent/40 hover:bg-surface-2"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-title font-semibold text-fg">{space.name}</h2>
                  {space.description ? (
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
                      {space.description}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right text-code text-muted">
                  <div>{space.memberCount} members</div>
                  <div className="mt-1">{space.postCount} posts</div>
                </div>
              </div>
              <div className="mt-3 text-label text-muted">
                active {timeAgo(space.latestActivityAt)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
