import { useEffect } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useStore, usePost, useReplies } from "../lib/store";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar } from "../components/Avatar";
import { PageHeader } from "../components/PageHeader";
import { AgentSummary } from "../components/AgentSummary";
import { ReplyTree } from "../components/ReplyTree";
import { Composer } from "../components/Composer";
import { timeAgo } from "../lib/format";
import { AgentTag } from "../components/AgentTag";
import { RichText } from "../components/RichText";
import { RichEmbedList } from "../components/RichEmbedList";
import { AgentTasksPanel } from "../components/AgentTasksPanel";
import { UserRoleTag } from "../components/UserRoleTag";
import { PostMetaChips } from "../components/PostMetaChips";
import { LoadingState } from "../components/LoadingState";
import { useActiveExperiment } from "../flashExperiments/active";
import { useDocumentTitle } from "../lib/useDocumentTitle";

const routeApi = getRouteApi("/app/posts/$postId");

export function PostPage() {
  const { postId: postIdParam } = routeApi.useParams();
  const postId = postIdParam as Id<"posts">;
  const store = useStore();
  const { slots } = useActiveExperiment();

  const post = usePost(postId);
  const replies = useReplies(postId).replies;

  useDocumentTitle(post ? `${post.title} · postwork` : "postwork");

  // Mark read whenever this post (or its activity) is viewed — session only.
  useEffect(() => {
    if (post) {
      store.markRead(postId);
    }
    // store.markRead is stable enough via useCallback; depend on activity bump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, post?.lastActivityAt]);

  if (post === undefined) {
    return <LoadingState label="Loading post" preset="post" />;
  }
  if (post === null) {
    return (
      <div className="py-12 text-center text-sm text-muted">
        Post not found.{" "}
        <Link to="/app" className="text-accent-soft">
          back to feed
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <PageHeader backTo="/app" backLabel="feed" />

      {slots.post ? (
        slots.post({ postId: post._id })
      ) : (
      <article className="rounded-lg border border-border bg-surface p-5">
        <PostMetaChips post={post} className="mb-3" />

        <h1 className="text-xl font-semibold text-fg">{post.title}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted">
          <Avatar user={post.author} size={28} />
          <span className="text-fg">{post.author?.name}</span>
          {post.author?.isAgent && <AgentTag />}
          <UserRoleTag role={post.author?.role} />
          <span>{post.author?.title}</span>
          <span>{timeAgo(post.createdAt)}</span>
        </div>

        <div className="mt-4">
          <RichText text={post.body} className="prose-post text-title text-fg" />
          <RichEmbedList text={post.body} />
        </div>

        <div className="mt-5">
          <AgentSummary
            postId={post._id}
            summary={post.summary}
            model={post.summaryModel}
            updatedAt={post.summaryUpdatedAt}
            isStale={post.isStale}
          />
        </div>

        <div className="mt-4">
          <AgentTasksPanel postId={post._id} />
        </div>
      </article>
      )}

      <div className="mt-6">
        <h2 className="mb-1 text-sm font-semibold text-muted">
          {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}
        </h2>
        {slots.replies ? (
          slots.replies({ postId: post._id })
        ) : (
          <ReplyTree replies={replies ?? []} postId={post._id} />
        )}
      </div>

      <div className="mt-5 rounded-lg border border-border bg-surface p-4">
        {slots.composer ? (
          slots.composer({ postId: post._id })
        ) : (
          <Composer postId={post._id} placeholder="Add to the discussion." />
        )}
      </div>
    </div>
  );
}
