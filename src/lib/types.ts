import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { PRIORITIES } from "./format";

export type EnrichedPost = FunctionReturnType<typeof api.posts.feed>[number];
export type EnrichedReply = FunctionReturnType<
  typeof api.replies.listForPost
>[number];

export type Priority = (typeof PRIORITIES)[number];

/** Metadata for an image attachment passed into post/reply create mutations. */
export type AttachmentInput = {
  storageId: string;
  filename: string;
  contentType: string;
  size: number;
  width?: number;
  height?: number;
};

/** Attachment record with a live storage URL, from `api.attachments.listForPost`. */
export type AttachmentWithUrl = FunctionReturnType<
  typeof api.attachments.listForPost
>[number];

/**
 * Paginated query status from `usePaginatedQuery`. `"Exhausted"` is also used
 * for demo-mode hooks that return a complete (non-paginated) list.
 */
export type PageStatus =
  | "LoadingFirstPage"
  | "CanLoadMore"
  | "LoadingMore"
  | "Exhausted";

/** Result of `useFeed` — a page of posts + pagination controls. */
export type FeedResult = {
  posts: EnrichedPost[];
  status: PageStatus;
  loadMore: (() => void) | null;
};

/** Result of `useReplies` — accumulated replies + pagination controls. */
export type RepliesResult = {
  replies: EnrichedReply[];
  status: PageStatus;
  loadMore: (() => void) | null;
};
