import { getRouteApi, Link } from "@tanstack/react-router";
import type { Id } from "../../convex/_generated/dataModel";
import { EmptyState } from "../components/EmptyState";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { PostCard } from "../components/PostCard";
import { PostForm } from "../components/PostForm";
import { Avatar } from "../components/Avatar";
import { useSession } from "../lib/session";
import { useStore, useSpaceFeed } from "../lib/store";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useSpaceBySlug, useSpaceMemberships } from "../lib/spaces";

const routeApi = getRouteApi("/app/spaces/$slug");

export function SpacePage() {
  const { slug } = routeApi.useParams();
  const space = useSpaceBySlug(slug);
  const memberships = useSpaceMemberships(space?._id);
  const feed = useSpaceFeed(
    space
      ? {
          spaceId: space._id as Id<"spaces">,
          spaceLabel: space.name,
        }
      : undefined,
  );
  const { currentUserId } = useSession();
  const store = useStore();

  useDocumentTitle(space ? `${space.name} · postwork` : "space · postwork");

  if (space === undefined || feed === undefined) {
    return <LoadingState />;
  }

  if (space === null) {
    return (
      <div className="py-12 text-center text-sm text-muted">
        space not found.{" "}
        <Link to="/spaces" className="text-accent-soft">
          back to spaces
        </Link>
      </div>
    );
  }

  const memberUsers = memberships
    .map((membership) => membership.user)
    .filter((user) => user !== null);

  return (
    <div>
      <PageHeader backTo="/spaces" backLabel="spaces" />

      <header className="mb-5 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-fg">{space.name}</h1>
            {space.description ? (
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
                {space.description}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-code text-muted sm:text-right">
            <div>{space.memberCount} members</div>
            <div className="mt-1">{feed.length} threads</div>
          </div>
        </div>

        {memberUsers.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {memberUsers.map((user) => (
              <div
                key={user._id}
                className="flex items-center gap-2 rounded-full border border-border bg-bg px-2.5 py-1.5 text-xs text-muted"
              >
                <Avatar user={user} size={20} />
                <span className="text-fg">{user.name}</span>
              </div>
            ))}
          </div>
        ) : null}
      </header>

      {feed.length === 0 ? (
        <EmptyState>no posts in this space yet.</EmptyState>
      ) : (
        <div className="space-y-2.5">
          {feed.map((post) => (
            <PostCard key={post._id} post={post} />
          ))}
        </div>
      )}

      <section className="mt-5 rounded-lg border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-fg">post to space</h2>
        <PostForm
          fixedSpace={{ id: space._id, label: space.name }}
          titlePlaceholder="what needs attention in this space?"
          bodyPlaceholder="write the full context so the thread can carry the work without a meeting."
          resetOnSubmit
          onSubmit={async ({ title, body, space: spaceLabel, spaceId, priority, attachments }) => {
            if (!currentUserId) return;
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
