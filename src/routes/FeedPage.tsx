import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useStore } from "../lib/store";
import { PostCard } from "../components/PostCard";
import { QuickPostBar } from "../components/QuickPostBar";
import { SPACES, PRIORITIES, priorityStyles } from "../lib/format";
import { useActiveExperiment } from "../flashExperiments/active";
import type { FeedSearch } from "../router";

export function FeedPage() {
  const store = useStore();
  const { slots } = useActiveExperiment();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as FeedSearch;
  const term = search.q ?? "";
  const space = SPACES.includes(search.space as never) ? search.space : undefined;
  const priority = PRIORITIES.includes(search.priority as never)
    ? search.priority
    : undefined;
  const onlyUnread = search.unread ?? false;

  const setSearch = (next: FeedSearch) => {
    void navigate({
      to: "/",
      search: (prev) => ({
        ...(prev as FeedSearch),
        ...next,
      }),
      replace: true,
    });
  };

  const searching = term.trim().length > 0;

  const feed = store.useFeed({
    space,
    priority: (priority as never) ?? undefined,
    onlyUnread,
  });
  const searchResults = store.useSearch(term);

  const posts = searching ? searchResults : feed;

  return (
    <div>
      {slots.feedHeader}
      <QuickPostBar />

      <div className="mb-4">
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-semibold text-accent-soft">
            /
          </span>
          <input
            value={term}
            onChange={(e) => setSearch({ q: e.target.value || undefined })}
            placeholder="search posts: decisions, incidents, anything…"
            className="w-full rounded-lg border border-border bg-surface py-2.5 pr-3 pl-8 text-sm outline-none focus:border-accent/50"
          />
          {searching && (
            <button
              onClick={() => setSearch({ q: undefined })}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted hover:text-fg"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {!searching && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <FilterChip active={!space} onClick={() => setSearch({ space: undefined })}>
            all spaces
          </FilterChip>
          {SPACES.map((s) => (
            <FilterChip key={s} active={space === s} onClick={() => setSearch({ space: s })}>
              {s}
            </FilterChip>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          {PRIORITIES.map((pr) => (
            <FilterChip
              key={pr}
              active={priority === pr}
              onClick={() => setSearch({ priority: priority === pr ? undefined : pr })}
              className={priority === pr ? priorityStyles[pr].className : ""}
            >
              {pr}
            </FilterChip>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          <FilterChip active={onlyUnread} onClick={() => setSearch({ unread: onlyUnread ? undefined : true })}>
            unread only
          </FilterChip>

          <button
            onClick={() => store.markAllRead()}
            className="ml-auto text-xs text-muted transition hover:text-fg"
          >
            mark all read
          </button>
        </div>
      )}

      {searching && (
        <p className="mb-3 text-sm text-muted">
          {searchResults === undefined
            ? "searching…"
            : `${searchResults.length} result${
                searchResults.length === 1 ? "" : "s"
              } for "${term}"`}
        </p>
      )}

      {posts === undefined ? (
        <div className="py-12 text-center text-sm text-muted">
          Loading…
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted">
          {searching
            ? "No posts match your search."
            : onlyUnread
              ? "You're all caught up. Nothing unread."
              : "No posts yet."}
        </div>
      ) : (
        <div className="space-y-2.5">
          {posts.map((post) =>
            slots.postCard ? (
              <Link
                key={post._id}
                to="/posts/$postId"
                params={{ postId: post._id }}
                className="block"
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

function FilterChip({
  active,
  onClick,
  children,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-xs lowercase transition ${
        active
          ? className || "border-accent/40 bg-accent/15 text-accent-soft"
          : "border-border text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
