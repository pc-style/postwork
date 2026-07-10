import { Link } from "@tanstack/react-router";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { timeAgo } from "../lib/format";
import { useSpacesList } from "../lib/spaces";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export function SpacesPage() {
  useDocumentTitle("Spaces · postwork");
  const spaces = useSpacesList().slice().sort((a, b) => b.latestActivityAt - a.latestActivityAt);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <PageHeader
        backTo="/app"
        backLabel="feed"
        title="Spaces"
        description="Browse posts grouped by team or area of work."
      />

      {spaces.length === 0 ? (
        <EmptyState>No spaces are available yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {spaces.map((space) => (
            <Link
              key={space._id}
              to="/app/spaces/$slug"
              params={{ slug: space.slug }}
              className="group block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/40 hover:bg-surface-2"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-title font-semibold text-fg">{space.name}</h2>
                  {space.description ? (
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{space.description}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-3 text-xs text-muted sm:block sm:text-right">
                  <div>{space.memberCount} members</div>
                  <div className="sm:mt-1">{space.postCount} posts</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted">Active {timeAgo(space.latestActivityAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
