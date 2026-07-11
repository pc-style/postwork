export type CatchUpPriority = "urgent" | "high" | "normal";

export type CatchUpCandidate<TPost> = {
  post: TPost;
  postId: string;
  priority: CatchUpPriority;
  unread: boolean;
  createdAt: number;
  lastActivityAt: number;
  summary: string | undefined;
  summaryModel: string | undefined;
  summaryUpdatedAt: number | undefined;
  isStale: boolean;
};

export type CatchUpSummary =
  | { status: "missing"; text: null; model: null; updatedAt: null }
  | {
      status: "stale" | "fresh";
      text: string;
      model: string | null;
      updatedAt: number | null;
    };

export type CatchUpItem<TPost> = {
  post: TPost;
  summary: CatchUpSummary;
};

export type CatchUpDigest<TPost> = {
  items: CatchUpItem<TPost>[];
  eligibleInWindow: number;
  omittedEligibleInWindow: number;
};

const PRIORITY_ORDER: Record<CatchUpPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
};

export const DEFAULT_CATCH_UP_LIMIT = 25;

/**
 * Compose the focused return-to-work digest from already authorized posts.
 * Composition is pure: it never changes read state or generates summaries.
 */
export function composeCatchUpDigest<TPost>(
  candidates: readonly CatchUpCandidate<TPost>[],
  limit = DEFAULT_CATCH_UP_LIMIT,
): CatchUpDigest<TPost> {
  const eligible = candidates
    .filter((candidate) => candidate.unread)
    .sort(compareCandidates);
  const boundedLimit = Math.max(1, Math.floor(limit));

  return {
    items: eligible.slice(0, boundedLimit).map((candidate) => ({
      post: candidate.post,
      summary: projectSummary(candidate),
    })),
    eligibleInWindow: eligible.length,
    omittedEligibleInWindow: Math.max(0, eligible.length - boundedLimit),
  };
}

function compareCandidates<TPost>(
  a: CatchUpCandidate<TPost>,
  b: CatchUpCandidate<TPost>,
): number {
  return (
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    b.lastActivityAt - a.lastActivityAt ||
    b.createdAt - a.createdAt ||
    a.postId.localeCompare(b.postId)
  );
}

function projectSummary<TPost>(
  candidate: CatchUpCandidate<TPost>,
): CatchUpSummary {
  const text = candidate.summary?.trim();
  if (!text) {
    return { status: "missing", text: null, model: null, updatedAt: null };
  }

  return {
    status: candidate.isStale ? "stale" : "fresh",
    text,
    model: candidate.summaryModel ?? null,
    updatedAt: candidate.summaryUpdatedAt ?? null,
  };
}
