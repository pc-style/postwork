import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useStore, useFeed, useSearch as useStoreSearch } from "../../lib/store";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { SPACES, PRIORITIES, priorityStyles, timeAgo } from "../../lib/format";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import type { EnrichedPost } from "../../lib/types";
import type { FeedSearch } from "../../router";

export function RedesignFeedPage() {
  useDocumentTitle("postwork · ink");
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
      to: "/redesign",
      search: (prev) => ({ ...(prev as FeedSearch), ...next }),
      replace: true,
    });
  };

  const searching = term.trim().length > 0;
  const feed = useFeed({ space, priority, onlyUnread });
  const searchResults = useStoreSearch(term);
  const posts = searching ? searchResults : feed;

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      {/* search: an underline field, not a boxed cage */}
      <div className="relative mb-8 border-b border-border focus-within:border-accent/60">
        <span className="pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 font-semibold text-accent-soft">
          /
        </span>
        <input
          value={term}
          onChange={(e) => setSearch({ q: e.target.value || undefined })}
          placeholder="search posts…"
          className="w-full bg-transparent py-2.5 pr-16 pl-5 text-sm outline-none placeholder:text-faint"
        />
        {searching && (
          <button
            onClick={() => setSearch({ q: undefined })}
            className="absolute top-1/2 right-0 -translate-y-1/2 text-xs text-muted hover:text-fg"
          >
            clear
          </button>
        )}
      </div>

      {!searching && (
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <FilterText active={!space} onClick={() => setSearch({ space: undefined })}>
            all
          </FilterText>
          {SPACES.map((s) => (
            <FilterText
              key={s}
              active={space === s}
              onClick={() => setSearch({ space: s })}
            >
              {s.toLowerCase()}
            </FilterText>
          ))}
          <span className="h-3 w-px bg-border" />
          {PRIORITIES.map((pr) => (
            <FilterText
              key={pr}
              active={priority === pr}
              onClick={() =>
                setSearch({ priority: priority === pr ? undefined : pr })
              }
            >
              {pr}
            </FilterText>
          ))}
          <span className="h-3 w-px bg-border" />
          <FilterText
            active={onlyUnread}
            onClick={() => setSearch({ unread: onlyUnread ? undefined : true })}
          >
            unread
          </FilterText>
          <button
            onClick={() => store.markAllRead()}
            className="ml-auto text-muted transition hover:text-fg"
          >
            mark all read
          </button>
        </div>
      )}

      {searching && (
        <p className="mb-4 text-sm text-muted">
          {searchResults === undefined
            ? "searching…"
            : `${searchResults.length} result${
                searchResults.length === 1 ? "" : "s"
              } for "${term}"`}
        </p>
      )}

      {posts === undefined ? (
        <LoadingState />
      ) : posts.length === 0 ? (
        <EmptyState>
          {searching
            ? "no posts match your search."
            : onlyUnread
              ? "you're all caught up. nothing unread."
              : "no posts yet."}
        </EmptyState>
      ) : (
        <div className="-mx-4 divide-y divide-border">
          {posts.map((post) => (
            <FeedRow key={post._id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}

// One post = one hero title + one quiet meta line. No card cage, no pill
// storm: a single priority badge appears only when it's above normal.
function FeedRow({ post }: { post: EnrichedPost }) {
  const showPriority = post.priority !== "normal";
  const p = priorityStyles[post.priority];

  return (
    <Link
      to="/redesign/posts/$postId"
      params={{ postId: post._id }}
      className="group block px-4 py-4 transition hover:bg-surface"
    >
      <h3
        className={`text-[15px] leading-snug tracking-tight ${
          post.unread ? "font-semibold text-fg" : "font-medium text-fg/85"
        }`}
      >
        {post.unread && (
          <span className="mr-2 inline-block size-1.5 -translate-y-px rounded-full bg-accent align-middle" />
        )}
        {post.pinned && <span className="mr-1.5 text-accent-soft">★</span>}
        {post.title}
      </h3>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-faint">
        <span className="text-muted">{post.author?.name ?? "Unknown"}</span>
        <span>·</span>
        <span>{post.space.toLowerCase()}</span>
        <span>·</span>
        <span className="tabular-nums">
          {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}
        </span>
        <span>·</span>
        <span className="tabular-nums">active {timeAgo(post.lastActivityAt)}</span>
        {showPriority && (
          <span className={`ml-1 ${p.dot === "bg-urgent" ? "text-urgent" : "text-high"}`}>
            {p.label.toLowerCase()}
          </span>
        )}
      </p>
    </Link>
  );
}

function FilterText({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`lowercase transition ${
        active ? "text-accent-soft" : "text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
