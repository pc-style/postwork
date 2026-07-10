import { Link } from "@tanstack/react-router";
import { timeAgo } from "../lib/format";
import { usePrefetchPost } from "../lib/store";
import type { EnrichedPost } from "../lib/types";
import { AgentTag } from "./AgentTag";
import { Avatar } from "./Avatar";
import { PostMetaChips } from "./PostMetaChips";
import { UserRoleTag } from "./UserRoleTag";

export function PostCard({ post }: { post: EnrichedPost }) {
  const snippet =
    post.body.length > 180 ? `${post.body.slice(0, 180).trimEnd()}…` : post.body;
  const prefetchPost = usePrefetchPost();
  const prefetch = () => prefetchPost(post._id);

  return (
    <Link
      to="/app/posts/$postId"
      params={{ postId: post._id }}
      className="group block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/40 hover:bg-surface-2"
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-2 size-2 shrink-0 rounded-full ${post.unread ? "bg-accent-soft" : "bg-transparent"}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <PostMetaChips post={post} />
            {post.summary ? <span className="text-label text-accent-soft">AI summary</span> : null}
          </div>

          <h2 className={`break-words text-title ${post.unread ? "font-semibold text-fg" : "font-medium text-fg/90"}`}>
            {post.unread ? <span className="sr-only">Unread: </span> : null}
            {post.title}
          </h2>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{snippet}</p>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted">
              <Avatar user={post.author} size={20} />
              <span className="text-fg/85">{post.author?.name ?? "Unknown"}</span>
              {post.author?.isAgent ? <AgentTag /> : null}
              <UserRoleTag role={post.author?.role} />
              <span>{timeAgo(post.createdAt)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
              {post.participants.length > 0 ? (
                <div className="flex -space-x-1.5" aria-label={`${post.participants.length} participants`}>
                  {post.participants.slice(0, 4).map((user) => (
                    <Avatar key={user._id} user={user} size={20} ring />
                  ))}
                </div>
              ) : null}
              <span className="tabular-nums">{post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}</span>
              <span className="text-accent-soft">Active {timeAgo(post.lastActivityAt)}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
