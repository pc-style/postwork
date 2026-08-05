import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { LoadingState } from "../components/LoadingState";
import { PostCard } from "../components/PostCard";
import { QuickPostBar } from "../components/QuickPostBar";
import { ToggleButton } from "../components/SelectionGroup";
import { useActiveExperiment } from "../flashExperiments/active";
import { PRIORITIES, SPACES } from "../lib/format";
import {
  useFeed,
  usePrefetchPost,
  useSearch as useStoreSearch,
  useStore,
} from "../lib/store";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import type { FeedSearch } from "../router";

export function FeedPage() {
  const prefetchPost = usePrefetchPost();
  useDocumentTitle("postwork");
  const store = useStore();
  const { slots } = useActiveExperiment();
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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <h1 className="sr-only">posts</h1>
      {slots.feedHeader}
      {!slots.feedHeader ? <QuickPostBar /> : null}

      <div className="relative mb-4">
        <label htmlFor="experiment-feed-search" className="sr-only">search posts</label>
        <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 font-semibold text-accent-soft" aria-hidden="true">/</span>
        <input
          id="experiment-feed-search"
          value={term}
          onChange={(event) => setSearch({ q: event.target.value || undefined })}
          placeholder="search by title, text, or teammate"
          className="ui-field ps-8 pe-20"
        />
        {searching ? (
          <button
            type="button"
            onClick={() => setSearch({ q: undefined })}
            className="ui-button absolute end-1 top-1/2 flex min-h-11 -translate-y-1/2 items-center rounded-md px-3 text-label text-muted hover:bg-surface hover:text-fg sm:min-h-9"
          >
            clear
          </button>
        ) : null}
      </div>

      {!searching ? (
        <div className="mb-5 grid gap-3">
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">space filters</legend>
            <ToggleButton pressed={!space} onPressedChange={() => setSearch({ space: undefined })}>all spaces</ToggleButton>
            {SPACES.map((item) => (
              <ToggleButton key={item} pressed={space === item} onPressedChange={() => setSearch({ space: item })}>
                {item}
              </ToggleButton>
            ))}
          </fieldset>
          <fieldset className="flex flex-wrap items-center gap-2">
            <legend className="sr-only">feed filters</legend>
            {PRIORITIES.map((item) => (
              <ToggleButton
                key={item}
                pressed={priority === item}
                onPressedChange={(pressed) => setSearch({ priority: pressed ? item : undefined })}
              >
                {item}
              </ToggleButton>
            ))}
            <ToggleButton pressed={onlyUnread} onPressedChange={(pressed) => setSearch({ unread: pressed || undefined })}>
              unread
            </ToggleButton>
            <span className="sm:ms-auto" />
            <Button variant="quiet" size="sm" className="min-h-11" onClick={() => store.markAllRead()}>
              mark all read
            </Button>
          </fieldset>
        </div>
      ) : (
        <p className="type-numeric mb-3 text-body text-muted" aria-live="polite">
          {searchResults === undefined
            ? "searching…"
            : `${searchResults.length} result${searchResults.length === 1 ? "" : "s"} for “${term}”`}
        </p>
      )}

      {posts === undefined ? (
        <LoadingState label="loading posts" preset="feed" count={4} />
      ) : posts.length === 0 ? (
        <EmptyState>
          {searching
            ? "no posts match this search. clear the search or try a different term."
            : onlyUnread
              ? "you're caught up. turn off the unread filter to view all posts."
              : "no posts match these filters. adjust the filters above to view more posts."}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {posts.map((post) =>
            slots.postCard ? (
              <Link
                key={post._id}
                to="/app/posts/$postId"
                params={{ postId: post._id }}
                className="block"
                onMouseEnter={() => prefetchPost(post._id)}
                onFocus={() => prefetchPost(post._id)}
                onTouchStart={() => prefetchPost(post._id)}
              >
                {slots.postCard({ post })}
              </Link>
            ) : (
              <PostCard key={post._id} post={post} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
