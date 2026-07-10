import { useState } from "react";
import { getRouteApi, Link } from "@tanstack/react-router";
import type { Id } from "../../convex/_generated/dataModel";
import { AgentTag } from "../components/AgentTag";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { PostCard } from "../components/PostCard";
import { UserRoleTag } from "../components/UserRoleTag";
import { WallPostDialog } from "../components/WallPostDialog";
import { useSession } from "../lib/session";
import { useWall } from "../lib/store";
import { useDocumentTitle } from "../lib/useDocumentTitle";

const routeApi = getRouteApi("/app/u/$userId");

export function WallPage() {
  const { userId: userIdParam } = routeApi.useParams();
  const userId = userIdParam as Id<"users">;
  const { users } = useSession();
  const posts = useWall(userId);
  const [open, setOpen] = useState(false);
  const owner = users.find((user) => user._id === userId);
  useDocumentTitle(owner ? `${owner.name}'s wall · postwork` : "Wall · postwork");

  if (!owner) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center text-sm text-muted sm:px-6">
        <p>We couldn't find this teammate.</p>
        <Link to="/app" className="mt-3 inline-flex min-h-11 items-center text-accent-soft hover:text-fg">back to feed</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <PageHeader backTo="/app" backLabel="feed" />

      <section className="mb-5 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar user={owner} size={48} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-xl font-semibold text-fg">{owner.name}</h1>
                {owner.isAgent ? <AgentTag /> : null}
                <UserRoleTag role={owner.role} />
              </div>
              <p className="mt-1 break-words text-sm text-muted">{owner.title}</p>
            </div>
          </div>
          <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
            post on this wall
          </Button>
        </div>
      </section>

      {posts === undefined ? (
        <LoadingState label="Loading wall posts" preset="feed" count={3} />
      ) : posts.length === 0 ? (
        <EmptyState>No posts have been added to this wall.</EmptyState>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div key={post._id} className="space-y-1.5">
              <span className="inline-flex rounded-md border border-border bg-surface-2 px-2 py-1 text-label text-muted">
                {post.wallOwnerId === userId ? "On this wall" : `Posted by ${owner.name}`}
              </span>
              <PostCard post={post} />
            </div>
          ))}
        </div>
      )}

      {open ? (
        <WallPostDialog
          wallOwnerId={owner._id}
          wallOwnerName={owner.name}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
