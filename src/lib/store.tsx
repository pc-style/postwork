import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { EnrichedPost, EnrichedReply } from "./types";
import { useSession } from "./session";

/**
 * Session-only overlay store.
 *
 * The public demo deployment keeps the Convex backend READ-ONLY. Everything a
 * visitor does — mark read, mark all read, write a reply, start a post,
 * regenerate an agent summary — is held in this in-memory layer and merged on
 * top of the backend query results. Refresh the page and it's gone, leaving
 * the seeded state untouched for the next visitor.
 *
 * Synthetic ids for session-created entities use the `local_` prefix so the
 * data hooks can route them to the overlay instead of the backend.
 */

const LOCAL_PREFIX = "local_";
const isLocalId = (id: string) => id.startsWith(LOCAL_PREFIX);

type Priority = "urgent" | "high" | "normal";

type SessionPost = Omit<
  Doc<"posts">,
  "summary" | "summaryModel" | "summaryUpdatedAt"
> & {
  summary?: string;
  summaryModel?: string;
  summaryUpdatedAt?: number;
};

type SessionReply = {
  _id: Id<"replies">;
  _creationTime: number;
  postId: Id<"posts">;
  parentId?: Id<"replies">;
  authorId: Id<"users">;
  body: string;
  createdAt: number;
};

type PostBump = {
  lastActivityAt: number;
  replyCountDelta: number;
  addedParticipantIds: Id<"users">[];
};

type SummaryEntry = { summary: string; model: string; updatedAt: number };

type StoreValue = {
  // merged query hooks
  useFeed: (args: {
    space?: string;
    priority?: Priority;
    onlyUnread?: boolean;
  }) => EnrichedPost[] | undefined;
  useSearch: (term: string) => EnrichedPost[] | undefined;
  usePost: (postId: Id<"posts">) => EnrichedPost | null | undefined;
  useReplies: (postId: Id<"posts">) => EnrichedReply[];
  useCounts: () =>
    | { total: number; unread: number; urgent: number }
    | undefined;

  // session-only mutations (replace the Convex mutations)
  markRead: (postId: Id<"posts">) => void;
  markAllRead: () => void;
  createReply: (args: {
    postId: Id<"posts">;
    authorId: Id<"users">;
    body: string;
    parentId?: Id<"replies">;
  }) => Promise<Id<"replies">>;
  createPost: (args: {
    authorId: Id<"users">;
    title: string;
    body: string;
    space: string;
    priority: Priority;
    wallOwnerId?: Id<"users">;
  }) => Promise<Id<"posts">>;
  summarize: (postId: Id<"posts">) => Promise<void>;
  // Group C — a user's wall: posts they authored + posts left on their wall,
  // in activity order. Wall posts are excluded from the global feed.
  useWall: (userId: Id<"users">) => EnrichedPost[] | undefined;
  isLocalId: (id: string) => boolean;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { users, currentUserId } = useSession();

  const [posts, setPosts] = useState<SessionPost[]>([]);
  const [replies, setReplies] = useState<Record<string, SessionReply[]>>({});
  const [postBumps, setPostBumps] = useState<Record<string, PostBump>>({});
  const [reads, setReads] = useState<Record<string, number>>({});
  const [readAllAt, setReadAllAt] = useState<Record<string, number>>({});
  const [summaries, setSummaries] = useState<Record<string, SummaryEntry>>({});

  const postCounter = useRef(0);
  const replyCounter = useRef(0);

  const userById = useMemo(() => {
    const m = new Map<string, Doc<"users">>();
    for (const u of users) m.set(u._id, u);
    return m;
  }, [users]);

  const readKey = (userId: Id<"users"> | undefined, postId: string) =>
    userId ? `${userId}:${postId}` : null;

  // Effective per-viewer read timestamp: max of session per-post read, session
  // mark-all-read, and the backend's recorded read.
  const effReadAt = useCallback(
    (postId: string, backendLastReadAt: number) => {
      if (!currentUserId) return 0;
      const k = readKey(currentUserId, postId);
      const perPost = k ? reads[k] ?? 0 : 0;
      const all = readAllAt[currentUserId] ?? 0;
      return Math.max(perPost, all, backendLastReadAt);
    },
    [currentUserId, reads, readAllAt],
  );

  const resolveParticipants = useCallback(
    (ids: Id<"users">[]): Doc<"users">[] =>
      ids.map((id) => userById.get(id)).filter((u): u is Doc<"users"> => !!u),
    [userById],
  );

  // Merge the session overlay onto a backend-enriched post.
  const applyOverlay = useCallback(
    (p: EnrichedPost): EnrichedPost => {
      const bump = postBumps[p._id];
      const summary = summaries[p._id];
      const lastActivityAt = bump?.lastActivityAt ?? p.lastActivityAt;
      const readAt = effReadAt(p._id, p.lastReadAt);
      // Dedupe across backend + session: the replier may already be a backend
      // participant (duplicates would double their avatar and collide keys).
      const participantIds = bump
        ? [...new Set([...p.participantIds, ...bump.addedParticipantIds])]
        : p.participantIds;
      return {
        ...p,
        lastActivityAt,
        replyCount: p.replyCount + (bump?.replyCountDelta ?? 0),
        participantIds,
        participants: bump ? resolveParticipants(participantIds) : p.participants,
        summary: summary?.summary ?? p.summary,
        summaryModel: summary?.model ?? p.summaryModel,
        summaryUpdatedAt: summary?.updatedAt ?? p.summaryUpdatedAt,
        unread: lastActivityAt > readAt,
      };
    },
    [postBumps, summaries, effReadAt, resolveParticipants],
  );

  // Build an EnrichedPost from a session-created post.
  const enrichSessionPost = useCallback(
    (sp: SessionPost): EnrichedPost => {
      const bump = postBumps[sp._id];
      const summary = summaries[sp._id];
      const lastActivityAt = bump?.lastActivityAt ?? sp.lastActivityAt;
      const participantIds = bump
        ? [...new Set([...sp.participantIds, ...bump.addedParticipantIds])]
        : sp.participantIds;
      const readAt = effReadAt(sp._id, 0);
      return {
        ...sp,
        lastActivityAt,
        replyCount: sp.replyCount + (bump?.replyCountDelta ?? 0),
        participantIds,
        author: userById.get(sp.authorId) ?? null,
        participants: resolveParticipants(participantIds),
        summary: summary?.summary ?? sp.summary,
        summaryModel: summary?.model ?? sp.summaryModel,
        summaryUpdatedAt: summary?.updatedAt ?? sp.summaryUpdatedAt,
        unread: lastActivityAt > readAt,
        lastReadAt: readAt,
      };
    },
    [postBumps, summaries, effReadAt, userById, resolveParticipants],
  );

  const enrichSessionReply = useCallback(
    (r: SessionReply): EnrichedReply => ({
      ...r,
      author: userById.get(r.authorId) ?? null,
    }),
    [userById],
  );

  const sortPosts = (a: EnrichedPost, b: EnrichedPost) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastActivityAt - a.lastActivityAt;
  };

  // ---- merged query hooks -------------------------------------------------

  const useFeed = (args: {
    space?: string;
    priority?: Priority;
    onlyUnread?: boolean;
  }) => {
    const backend = useQuery(api.posts.feed, {
      viewerId: currentUserId,
      space: args.space,
      priority: args.priority as never,
      // onlyUnread is applied client-side so session activity can flip it.
    });

    if (backend === undefined) return undefined;

    const sessionMatched = posts
      .filter(
        (p) =>
          !p.wallOwnerId &&
          (!args.space || p.space === args.space) &&
          (!args.priority || p.priority === args.priority),
      )
      .map(enrichSessionPost);

    // Wall posts live on user walls, not in the global feed.
    const merged = [
      ...sessionMatched,
      ...backend.filter((p) => !p.wallOwnerId).map(applyOverlay),
    ];
    merged.sort(sortPosts);
    return args.onlyUnread ? merged.filter((p) => p.unread) : merged;
  };

  // Group C — wall feed: a user's own posts plus posts left on their wall.
  const useWall = (userId: Id<"users">) => {
    const backend = useQuery(api.posts.feed, { viewerId: currentUserId });
    if (backend === undefined) return undefined;
    const onWall = (p: { wallOwnerId?: Id<"users">; authorId: Id<"users"> }) =>
      p.wallOwnerId === userId ||
      (!p.wallOwnerId && p.authorId === userId);
    const sessionMatched = posts.filter(onWall).map(enrichSessionPost);
    const merged = [
      ...sessionMatched,
      ...backend.filter(onWall).map(applyOverlay),
    ];
    merged.sort(sortPosts);
    return merged;
  };

  const useSearch = (term: string) => {
    const backend = useQuery(
      api.posts.search,
      term.trim() ? { term, viewerId: currentUserId } : "skip",
    );
    const t = term.trim().toLowerCase();
    if (!t) return undefined;
    const sessionMatched = posts
      .filter(
        (p) =>
          p.title.toLowerCase().includes(t) ||
          p.body.toLowerCase().includes(t),
      )
      .map(enrichSessionPost);
    if (backend === undefined) return undefined;
    return [...sessionMatched, ...backend.map(applyOverlay)].sort(sortPosts);
  };

  const usePost = (postId: Id<"posts">) => {
    const local = isLocalId(postId);
    const backend = useQuery(
      api.posts.get,
      local ? "skip" : { postId, viewerId: currentUserId },
    );
    if (local) {
      const sp = posts.find((p) => p._id === postId);
      return sp ? enrichSessionPost(sp) : null;
    }
    if (backend === undefined) return undefined;
    if (backend === null) return null;
    return applyOverlay(backend);
  };

  const useReplies = (postId: Id<"posts">) => {
    const local = isLocalId(postId);
    const backend = useQuery(
      api.replies.listForPost,
      local ? "skip" : { postId },
    );
    const session = (replies[postId] ?? []).map(enrichSessionReply);
    return [...(backend ?? []), ...session].sort(
      (a, b) => a.createdAt - b.createdAt,
    );
  };

  const useCounts = () => {
    const all = useFeed({});
    if (all === undefined) return undefined;
    let unread = 0;
    let urgent = 0;
    for (const p of all) {
      if (p.unread) {
        unread++;
        if (p.priority === "urgent") urgent++;
      }
    }
    return { total: all.length, unread, urgent };
  };

  // ---- session-only mutations --------------------------------------------

  const markRead = useCallback(
    (postId: Id<"posts">) => {
      if (!currentUserId) return;
      const k = readKey(currentUserId, postId);
      if (!k) return;
      setReads((prev) => ({ ...prev, [k]: Date.now() }));
    },
    [currentUserId],
  );

  const markAllRead = useCallback(() => {
    if (!currentUserId) return;
    setReadAllAt((prev) => ({ ...prev, [currentUserId]: Date.now() }));
  }, [currentUserId]);

  const createReply = useCallback(
    async (args: {
      postId: Id<"posts">;
      authorId: Id<"users">;
      body: string;
      parentId?: Id<"replies">;
    }) => {
      replyCounter.current += 1;
      const id = `${LOCAL_PREFIX}r${replyCounter.current}` as unknown as Id<"replies">;
      const now = Date.now();
      const reply: SessionReply = {
        _id: id,
        _creationTime: now,
        postId: args.postId,
        parentId: args.parentId,
        authorId: args.authorId,
        body: args.body,
        createdAt: now,
      };
      setReplies((prev) => ({
        ...prev,
        [args.postId]: [...(prev[args.postId] ?? []), reply],
      }));
      // Bump the post: activity timestamp, reply count, participants.
      setPostBumps((prev) => {
        const existing = prev[args.postId] ?? {
          lastActivityAt: 0,
          replyCountDelta: 0,
          addedParticipantIds: [],
        };
        return {
          ...prev,
          [args.postId]: {
            lastActivityAt: now,
            replyCountDelta: existing.replyCountDelta + 1,
            addedParticipantIds: existing.addedParticipantIds.includes(
              args.authorId,
            )
              ? existing.addedParticipantIds
              : [...existing.addedParticipantIds, args.authorId],
          },
        };
      });
      // The replier has implicitly read up to now.
      const k = readKey(args.authorId, args.postId);
      if (k) setReads((prev) => ({ ...prev, [k]: now }));
      return id;
    },
    [],
  );

  const createPost = useCallback(
    async (args: {
      authorId: Id<"users">;
      title: string;
      body: string;
      space: string;
      priority: Priority;
      wallOwnerId?: Id<"users">;
    }) => {
      postCounter.current += 1;
      const id = `${LOCAL_PREFIX}p${postCounter.current}` as unknown as Id<"posts">;
      const now = Date.now();
      const sp: SessionPost = {
        _id: id,
        _creationTime: now,
        authorId: args.authorId,
        title: args.title,
        body: args.body,
        space: args.space,
        priority: args.priority,
        pinned: false,
        createdAt: now,
        lastActivityAt: now,
        replyCount: 0,
        participantIds: [args.authorId],
        wallOwnerId: args.wallOwnerId,
      };
      setPosts((prev) => [sp, ...prev]);
      // Author has read their own new post.
      const k = readKey(args.authorId, id);
      if (k) setReads((prev) => ({ ...prev, [k]: now }));
      return id;
    },
    [],
  );

  const summarizeAction = useAction(api.ai.summarizePost);
  const summarize = useCallback(
    async (postId: Id<"posts">) => {
      if (isLocalId(postId)) return; // no backend context to summarize from
      const res = await summarizeAction({ postId });
      setSummaries((prev) => ({
        ...prev,
        [postId]: {
          summary: res.summary,
          model: res.model,
          updatedAt: Date.now(),
        },
      }));
    },
    [summarizeAction],
  );

  const value: StoreValue = {
    useFeed,
    useSearch,
    usePost,
    useReplies,
    useCounts,
    markRead,
    markAllRead,
    createReply,
    createPost,
    summarize,
    useWall,
    isLocalId,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
