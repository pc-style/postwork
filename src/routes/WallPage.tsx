import { useState } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import type { Id } from "../../convex/_generated/dataModel";
import { AgentTag } from "../components/AgentTag";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { PostCard } from "../components/PostCard";
import { UserRoleTag } from "../components/UserRoleTag";
import { WallPostDialog } from "../components/WallPostDialog";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";

const routeApi = getRouteApi("/app/u/$userId");

export function WallPage() {
  const { userId: userIdParam } = routeApi.useParams();
  // Router params are plain strings; cast to the Convex Id (same pattern as
  // PostPage). An unknown id resolves to no owner and renders "user not found".
  const userId = userIdParam as Id<"users">;
  const { users } = useSession();
  const store = useStore();
  const posts = store.useWall(userId);
  const [open, setOpen] = useState(false);
  const owner = users.find((user) => user._id === userId);

  if (!owner) {
    return (
      <div className="py-12 text-center text-sm text-[var(--color-muted)]">
        user not found. {" "}
        <Link to="/" className="text-accent-soft">
          back to feed
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] transition hover:text-fg"
      >
        ← feed
      </Link>

      <section className="mb-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar user={owner} size={48} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-fg">{owner.name}</h1>
                {owner.isAgent && <AgentTag />}
                <UserRoleTag role={owner.role} />
              </div>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{owner.title}</p>
            </div>
          </div>
          <Button onClick={() => setOpen(true)}>
            post on {owner.name}'s wall
          </Button>
        </div>
      </section>

      {posts === undefined ? (
        <div className="py-12 text-center text-sm text-[var(--color-muted)]">
          loading…
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-muted)]">
          no wall posts yet.
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div key={post._id} className="space-y-1.5">
              <span className="inline-flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] text-[var(--color-muted)]">
                {post.wallOwnerId === userId
                  ? "on the wall"
                  : `posted by ${owner.name}`}
              </span>
              <PostCard post={post} />
            </div>
          ))}
        </div>
      )}

      {open && (
        <WallPostDialog
          wallOwnerId={owner._id}
          wallOwnerName={owner.name}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
