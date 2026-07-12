import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import type { ReactNode } from "react";
import { PRIORITIES, SPACES, priorityStyles, timeAgo } from "../../lib/format";
import {
  useFeed,
  usePrefetchPost,
  useSearch as useStoreSearch,
  useStore,
} from "../../lib/store";
import type { EnrichedPost } from "../../lib/types";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { useDeferredFlag } from "../../lib/useDeferredFlag";
import type { FeedSearch } from "../../router";

export function RedesignFeedPage() {
  useDocumentTitle("Feed · postwork");
  const store = useStore();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as FeedSearch;

  const term = search.q ?? "";
  const space = SPACES.includes(search.space as (typeof SPACES)[number])
    ? search.space
    : undefined;
  const priority = search.priority;
  const onlyUnread = search.unread ?? false;

  const setSearch = (next: FeedSearch) => {
    void navigate({
      to: "/app",
      search: (previous) => ({ ...(previous as FeedSearch), ...next }),
      replace: true,
    });
  };

  const searching = term.trim().length > 0;
  const feed = useFeed({ space, priority, onlyUnread });
  const searchResults = useStoreSearch(term);
  const posts = searching ? searchResults : feed?.posts;
  const canLoadMore = !searching && feed?.status === "CanLoadMore";
  const loadingMore = !searching && feed?.status === "LoadingMore";
  const showSkeleton = useDeferredFlag(150);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10">
      <h1 className="sr-only">Feed</h1>
      <div className="relative">
        <label htmlFor="feed-search" className="sr-only">Search posts</label>
        <input
          id="feed-search"
          value={term}
          onChange={(event) => setSearch({ q: event.target.value || undefined })}
          placeholder="Search by title, text, or teammate"
          className="ui-field pr-20"
        />
        {searching ? (
          <button
            type="button"
            onClick={() => setSearch({ q: undefined })}
            className="absolute right-1 top-1/2 flex min-h-9 -translate-y-1/2 items-center rounded-md px-3 text-xs text-muted transition-colors hover:bg-surface hover:text-fg"
          >
            clear
          </button>
        ) : null}
      </div>

      {!searching ? (
        <div className="my-5 grid gap-2 border-b border-border pb-5 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Space filters">
            <FilterText pressed={!space} onClick={() => setSearch({ space: undefined })}>
              all spaces
            </FilterText>
            {SPACES.map((item) => (
              <FilterText
                key={item}
                pressed={space === item}
                onClick={() => setSearch({ space: item })}
              >
                {item}
              </FilterText>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Feed filters">
            {PRIORITIES.map((item) => (
              <FilterText
                key={item}
                pressed={priority === item}
                onClick={() => setSearch({ priority: priority === item ? undefined : item })}
              >
                {item}
              </FilterText>
            ))}
            <FilterText
              pressed={onlyUnread}
              onClick={() => setSearch({ unread: !onlyUnread || undefined })}
            >
              unread
            </FilterText>
            <span className="ml-auto" />
            <button
              type="button"
              onClick={() => store.markAllRead()}
              className="inline-flex min-h-11 items-center text-sm lowercase text-muted transition-colors hover:text-fg sm:min-h-9"
            >
              mark all read
            </button>
          </div>
        </div>
      ) : (
        <p className="my-4 text-sm text-muted" aria-live="polite">
          {searchResults === undefined
            ? "Searching…"
            : `${searchResults.length} result${searchResults.length === 1 ? "" : "s"} for “${term}”`}
        </p>
      )}

      {posts === undefined ? (
        showSkeleton ? (
          <LoadingState label={searching ? "Searching posts" : "Loading posts"} preset="feed" count={5} />
        ) : null
      ) : posts.length === 0 && !canLoadMore ? (
        <EmptyState>
          {searching
            ? "No posts match this search. Try a different term."
            : onlyUnread
              ? "No unread posts match these filters. Clear a filter to review more posts."
              : "No posts match these filters. Clear a filter or search again."}
        </EmptyState>
      ) : posts.length === 0 && canLoadMore ? (
        <div className="py-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => feed?.loadMore?.()}
            loading={loadingMore}
            loadingLabel="loading…"
          >
            load older unread posts
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {posts.map((post) => <FeedRow key={post._id} post={post} />)}
          {canLoadMore ? (
            <div className="py-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => feed?.loadMore?.()}
                loading={loadingMore}
                loadingLabel="loading…"
              >
                load more
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function FeedRow({ post }: { post: EnrichedPost }) {
  const showPriority = post.priority !== "normal";
  const priority = priorityStyles[post.priority];
  const prefetchPost = usePrefetchPost();
  const prefetch = () => prefetchPost(post._id);

  return (
    <Link
      to="/app/posts/$postId"
      params={{ postId: post._id }}
      className="group block min-h-20 px-1 py-4 transition-colors hover:bg-surface sm:px-3"
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
    >
      <h2 className={`text-[15px] leading-snug tracking-tight ${post.unread ? "font-semibold text-fg" : "font-medium text-fg/90"}`}>
        {post.unread ? (
          <>
            <span className="mr-2 inline-block size-2 -translate-y-px rounded-full bg-accent-soft align-middle" aria-hidden="true" />
            <span className="sr-only">Unread: </span>
          </>
        ) : null}
        {post.pinned ? <span className="mr-2 text-xs font-medium text-accent-soft">Pinned</span> : null}
        {post.title}
      </h2>
      {post.body.trim() ? (
        <p className="mt-1 line-clamp-2 text-sm text-muted">
          {post.body.length > 240 ? `${post.body.slice(0, 240).trimEnd()}…` : post.body}
        </p>
      ) : null}
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="text-fg/85">{post.author?.name ?? "Unknown"}</span>
        <span>{post.space}</span>
        <span className="tabular-nums">{post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}</span>
        <span className="tabular-nums">Active {timeAgo(post.lastActivityAt)}</span>
        {showPriority ? (
          <span className={`inline-flex items-center gap-1.5 ${post.priority === "urgent" ? "text-urgent" : "text-high"}`}>
            <span className={`size-1.5 rounded-full ${priority.dot}`} aria-hidden="true" />
            {priority.label}
          </span>
        ) : null}
      </p>
    </Link>
  );
}

function FilterText({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center lowercase transition-colors sm:min-h-9 ${
        pressed
          ? "font-medium text-fg"
          : "text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
