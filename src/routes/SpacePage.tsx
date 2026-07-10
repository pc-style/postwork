import { getRouteApi, Link } from "@tanstack/react-router";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar } from "../components/Avatar";
import { EmptyState } from "../components/EmptyState";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { PostCard } from "../components/PostCard";
import { PostForm } from "../components/PostForm";
import { useSession } from "../lib/session";
import { useSpaceBySlug, useSpaceMemberships } from "../lib/spaces";
import { useSpaceFeed, useStore } from "../lib/store";
import { useDocumentTitle } from "../lib/useDocumentTitle";

const routeApi = getRouteApi("/app/spaces/$slug");

export function SpacePage() {
  const { slug } = routeApi.useParams();
  const space = useSpaceBySlug(slug);
  const memberships = useSpaceMemberships(space?._id);
  const feed = useSpaceFeed(
    space
      ? { spaceId: space._id as Id<"spaces">, spaceLabel: space.name }
      : undefined,
  );
  const { currentUserId } = useSession();
  const store = useStore();

  useDocumentTitle(space ? `${space.name} · postwork` : "Space · postwork");

  if (space === undefined || feed === undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <LoadingState label="Loading space" preset="post" />
      </div>
    );
  }

  if (space === null) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center text-sm text-muted sm:px-6">
        <p>We couldn't find this space.</p>
        <Link to="/app/spaces" className="mt-3 inline-flex min-h-11 items-center text-accent-soft hover:text-fg">
          back to spaces
        </Link>
      </div>
    );
  }

  const memberUsers = memberships
    .map((membership) => membership.user)
    .filter((user) => user !== null);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <PageHeader backTo="/app/spaces" backLabel="spaces" />

      <header className="mb-5 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-fg">{space.name}</h1>
            {space.description ? (
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted">{space.description}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-3 text-xs text-muted sm:block sm:text-right">
            <div>{space.memberCount} members</div>
            <div className="sm:mt-1">{feed.length} posts</div>
          </div>
        </div>

        {memberUsers.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Space members">
            {memberUsers.map((user) => (
              <div key={user._id} className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-bg px-3 py-2 text-xs text-muted">
                <Avatar user={user} size={20} />
                <span className="text-fg">{user.name}</span>
              </div>
            ))}
          </div>
        ) : null}
      </header>

      {feed.length === 0 ? (
        <EmptyState>No posts have been added to this space.</EmptyState>
      ) : (
        <div className="space-y-3">
          {feed.map((post) => <PostCard key={post._id} post={post} />)}
        </div>
      )}

      <section className="mt-6 rounded-lg border border-border bg-surface p-4" aria-labelledby="space-post-heading">
        <h2 id="space-post-heading" className="mb-4 text-base font-semibold text-fg">New post in {space.name}</h2>
        <PostForm
          fixedSpace={{ id: space._id, label: space.name }}
          titlePlaceholder="Example: Release plan update"
          bodyPlaceholder="Add the context, decision, or question."
          resetOnSubmit
          onSubmit={async ({ title, body, space: spaceLabel, spaceId, priority, attachments }) => {
            if (!currentUserId) throw new Error("Choose a teammate before posting.");
            await store.createPost({
              title,
              body,
              space: spaceLabel ?? space.name,
              spaceId: spaceId ?? space._id,
              priority,
              attachments,
            });
          }}
        />
      </section>
    </div>
  );
}
