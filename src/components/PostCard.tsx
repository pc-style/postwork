import { Link } from "@tanstack/react-router";
import type { EnrichedPost } from "../lib/types";
import { Avatar } from "./Avatar";
import { AgentTag } from "./AgentTag";
import { UserRoleTag } from "./UserRoleTag";
import { PostMetaChips } from "./PostMetaChips";
import { timeAgo } from "../lib/format";

export function PostCard({ post }: { post: EnrichedPost }) {
  const snippet =
    post.body.length > 180 ? post.body.slice(0, 180).trimEnd() + "…" : post.body;

  return (
    <Link
      to="/app/posts/$postId"
      params={{ postId: post._id }}
      className="group block rounded-lg border border-border bg-surface p-4 transition hover:border-accent/40 hover:bg-surface-2"
    >
      <div className="flex items-start gap-3">
        {post.unread ? (
          <span className="mt-2 size-2 shrink-0 rounded-full bg-accent-soft" title="Unread" />
        ) : (
          <span className="mt-2 size-2 shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <PostMetaChips post={post} />
            {post.summary && (
              <span className="text-label text-accent-soft" title="Has agent summary">
                ai summary
              </span>
            )}
          </div>

          <h3
            className={`truncate text-title ${
              post.unread ? "font-semibold text-fg" : "font-medium"
            }`}
          >
            {post.title}
          </h3>

          <p className="mt-1 line-clamp-2 text-sm text-muted">
            {snippet}
          </p>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Avatar user={post.author} size={20} />
              <span>{post.author?.name ?? "Unknown"}</span>
              {post.author?.isAgent && <AgentTag />}
              <UserRoleTag role={post.author?.role} />
              <span>·</span>
              <span>{timeAgo(post.createdAt)}</span>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted">
              <div className="flex -space-x-1.5">
                {post.participants.slice(0, 4).map((u) => (
                  <Avatar key={u._id} user={u} size={20} ring />
                ))}
              </div>
              <span className="tabular-nums">
                {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}
              </span>
              <span title="Last activity" className="text-accent-soft">
                active {timeAgo(post.lastActivityAt)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
