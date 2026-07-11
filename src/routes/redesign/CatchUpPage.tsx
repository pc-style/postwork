import { useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
import { Component, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { catchUpSummaryPreview, composeDemoCatchUp, groupCatchUpItems } from "../../lib/catchUp";
import { isDemo } from "../../lib/demoMode";
import { priorityStyles, timeAgo } from "../../lib/format";
import { useFeed } from "../../lib/store";
import type { CatchUpDigest, CatchUpItem } from "../../lib/types";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

const useCatchUpDigest = isDemo ? useDemoCatchUpDigest : useProductCatchUpDigest;

function useProductCatchUpDigest(): CatchUpDigest | undefined {
  return useQuery(api.posts.catchUpDigest);
}

function useDemoCatchUpDigest(): CatchUpDigest | undefined {
  const feed = useFeed({});
  return feed ? composeDemoCatchUp(feed.posts) : undefined;
}

export function CatchUpPage() {
  useDocumentTitle("Catch up · postwork");
  return (
    <CatchUpErrorBoundary>
      <CatchUpContents />
    </CatchUpErrorBoundary>
  );
}

class CatchUpErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("Catch-up digest failed", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <EmptyState>
          <p className="font-medium text-fg">Catch-up is unavailable right now.</p>
          <p className="mt-1">Your account may not have access, or the digest could not be loaded. Try again after refreshing.</p>
        </EmptyState>
      </div>
    );
  }
}

function CatchUpContents() {
  const digest = useCatchUpDigest();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10">
      <header className="border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight text-fg">Catch up</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Unread work, ordered by priority and recent activity. Opening a post gives you the full record.
        </p>
      </header>

      {digest === undefined ? (
        <LoadingState label="Loading catch-up digest" preset="feed" count={4} />
      ) : digest.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState>
            <p className="font-medium text-fg">You’re all caught up.</p>
            <p className="mt-1">New unread activity will appear here when it needs your attention.</p>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-8">
            {groupCatchUpItems(digest.items).map((group) => (
              <section key={group.priority} aria-labelledby={`catch-up-${group.priority}`}>
                <div className="mb-2 flex items-center gap-2 border-b border-border pb-2">
                  <span className={`size-1.5 rounded-full ${priorityStyles[group.priority].dot}`} aria-hidden="true" />
                  <h2 id={`catch-up-${group.priority}`} className="text-xs font-medium text-muted">
                    {priorityStyles[group.priority].label} · {group.items.length}
                  </h2>
                </div>
                <div className="divide-y divide-border">
                  {group.items.map((item) => <CatchUpRow key={item.post._id} item={item} />)}
                </div>
              </section>
            ))}
          </div>
          <DigestScope digest={digest} />
        </>
      )}
    </div>
  );
}

function CatchUpRow({ item }: { item: CatchUpItem }) {
  const { post, summary } = item;
  return (
    <Link
      to="/app/posts/$postId"
      params={{ postId: post._id }}
      className="group block px-1 py-4 transition-colors hover:bg-surface sm:px-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h3 className="min-w-0 text-[15px] font-semibold leading-snug text-fg group-hover:text-accent-soft">
          {post.title}
        </h3>
        <SummaryState status={summary.status} />
      </div>
      {summary.status === "missing" ? (
        <p className="mt-2 text-sm leading-6 text-muted">No summary yet. Open the post for the full context.</p>
      ) : (
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{catchUpSummaryPreview(summary.text)}</p>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="text-fg/85">{post.author?.name ?? "Unknown author"}</span>
        <span>{post.space}</span>
        <span>{post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}</span>
        <span>Active {timeAgo(post.lastActivityAt)}</span>
      </p>
    </Link>
  );
}

function SummaryState({ status }: { status: CatchUpItem["summary"]["status"] }) {
  const copy = status === "fresh" ? "summary current" : status === "stale" ? "new activity since summary" : "summary missing";
  const color = status === "fresh" ? "text-accent-soft" : status === "stale" ? "text-high" : "text-muted";
  return <span className={`shrink-0 text-xs ${color}`}>{copy}</span>;
}

function DigestScope({ digest }: { digest: CatchUpDigest }) {
  const notes: string[] = [];
  if (digest.omittedEligibleInWindow > 0) {
    notes.push(`${digest.omittedEligibleInWindow} more unread ${digest.omittedEligibleInWindow === 1 ? "post is" : "posts are"} outside this focused list`);
  }
  if (!digest.scan.complete) {
    notes.push(`this view scanned the ${digest.scan.maxPosts} most recently active posts, so older unread work may not appear`);
  }
  if (isDemo) notes.push("demo view uses the selected teammate’s feed and session read state");
  if (!notes.length) return null;
  return <p className="mt-8 border-t border-border pt-4 text-xs leading-5 text-muted">{notes.join(". ")}.</p>;
}
