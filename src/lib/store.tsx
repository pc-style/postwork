import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id, TableNames } from "../../convex/_generated/dataModel";
import type { EnrichedPost, EnrichedReply, Priority } from "./types";
import { isDemo } from "./demoMode";
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
export const isLocalId = (id: string) => id.startsWith(LOCAL_PREFIX);

/**
 * Mint a synthetic session-local id for `table`, tagged with the `local_`
 * prefix so `isLocalId` can route it to the overlay instead of the backend.
 * The cast is necessary because these ids never exist in Convex.
 */
function makeLocalId<T extends TableNames>(table: T, n: number): Id<T> {
  return `${LOCAL_PREFIX}${table[0]}${n}` as unknown as Id<T>;
}

type SessionPost = Omit<
  Doc<"posts">,
  "summary" | "summaryModel" | "summaryUpdatedAt"
> & {
  summary?: string;
  summaryModel?: string;
  summaryUpdatedAt?: number;
};

type SessionReply = Doc<"replies">;

type PostBump = {
  lastActivityAt: number;
  replyCountDelta: number;
  addedParticipantIds: Id<"users">[];
};

type SummaryEntry = { summary: string; model: string; updatedAt: number };

type OverlayState = {
  posts: SessionPost[];
  replies: Record<string, SessionReply[]>;
  applyOverlay: (p: EnrichedPost) => EnrichedPost;
  enrichSessionPost: (sp: SessionPost) => EnrichedPost;
  enrichSessionReply: (r: SessionReply) => EnrichedReply;
};

type StoreValue = {
  mode: "demo" | "product";
  overlay: OverlayState;
  currentUserId: Id<"users"> | undefined;
  markRead: (postId: Id<"posts">) => void;
  markAllRead: () => void;
  createReply: (args: {
    postId: Id<"posts">;
    authorId?: Id<"users">;
    body: string;
    parentId?: Id<"replies">;
  }) => Promise<Id<"replies">>;
  createPost: (args: {
    title: string;
    body: string;
    space: string;
    spaceId?: Id<"spaces">;
    priority: Priority;
    wallOwnerId?: Id<"users">;
  }) => Promise<Id<"posts">>;
  summarize: (postId: Id<"posts">) => Promise<void>;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  if (isDemo) {
    return <OverlayStoreProvider>{children}</OverlayStoreProvider>;
  }

  return <ConvexStoreProvider>{children}</ConvexStoreProvider>;
}

function OverlayStoreProvider({ children }: { children: ReactNode }) {
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
      authorId?: Id<"users">;
      body: string;
      parentId?: Id<"replies">;
    }) => {
      const authorId = args.authorId ?? currentUserId;
      if (!authorId) {
        throw new Error("No current user.");
      }
      replyCounter.current += 1;
      const id = makeLocalId("replies", replyCounter.current);
      const now = Date.now();
      const reply: SessionReply = {
        _id: id,
        _creationTime: now,
        postId: args.postId,
        parentId: args.parentId,
        authorId,
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
            addedParticipantIds: existing.addedParticipantIds.includes(authorId)
              ? existing.addedParticipantIds
              : [...existing.addedParticipantIds, authorId],
          },
        };
      });
      // The replier has implicitly read up to now.
      const k = readKey(authorId, args.postId);
      if (k) setReads((prev) => ({ ...prev, [k]: now }));
      return id;
    },
    [currentUserId],
  );

  const createPost = useCallback(
    async (args: {
      title: string;
      body: string;
      space: string;
      spaceId?: Id<"spaces">;
      priority: Priority;
      wallOwnerId?: Id<"users">;
    }) => {
      if (!currentUserId) {
        throw new Error("No current user.");
      }
      postCounter.current += 1;
      const id = makeLocalId("posts", postCounter.current);
      const now = Date.now();
      const sp: SessionPost = {
        _id: id,
        _creationTime: now,
        authorId: currentUserId,
        title: args.title,
        body: args.body,
        space: args.space,
        spaceId: args.spaceId,
        priority: args.priority,
        pinned: false,
        createdAt: now,
        lastActivityAt: now,
        replyCount: 0,
        participantIds: [currentUserId],
        wallOwnerId: args.wallOwnerId,
      };
      setPosts((prev) => [sp, ...prev]);
      // Author has read their own new post.
      const k = readKey(currentUserId, id);
      if (k) setReads((prev) => ({ ...prev, [k]: now }));
      return id;
    },
    [currentUserId],
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

  const overlay = useMemo<OverlayState>(
    () => ({
      posts,
      replies,
      applyOverlay,
      enrichSessionPost,
      enrichSessionReply,
    }),
    [posts, replies, applyOverlay, enrichSessionPost, enrichSessionReply],
  );

  const value: StoreValue = useMemo(
    () => ({
      mode: "demo",
      overlay,
      currentUserId,
      markRead,
      markAllRead,
      createReply,
      createPost,
      summarize,
    }),
    [
      overlay,
      currentUserId,
      markRead,
      markAllRead,
      createReply,
      createPost,
      summarize,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function ConvexStoreProvider({ children }: { children: ReactNode }) {
  const { currentUserId } = useSession();
  const createPostMutation = useMutation(api.posts.create);
  const createReplyMutation = useMutation(api.replies.create);
  const markReadMutation = useMutation(api.posts.markRead);
  const markAllReadMutation = useMutation(api.posts.markAllRead);
  const summarizeAction = useAction(api.ai.regeneratePostSummary);

  const overlay = useMemo<OverlayState>(
    () => ({
      posts: [],
      replies: {},
      applyOverlay: (post) => post,
      enrichSessionPost: (post) => ({
        ...post,
        author: null,
        participants: [],
        unread: false,
        lastReadAt: 0,
      }),
      enrichSessionReply: (reply) => ({
        ...reply,
        author: null,
      }),
    }),
    [],
  );

  const markRead = useCallback(
    (postId: Id<"posts">) => {
      if (!currentUserId) return;
      void markReadMutation({ postId }).catch((error) => {
        console.error("Failed to mark post read", error);
      });
    },
    [currentUserId, markReadMutation],
  );

  const markAllRead = useCallback(() => {
    if (!currentUserId) return;
    void markAllReadMutation({}).catch((error) => {
      console.error("Failed to mark all posts read", error);
    });
  }, [currentUserId, markAllReadMutation]);

  const createReply = useCallback(
    async (args: {
      postId: Id<"posts">;
      authorId?: Id<"users">;
      body: string;
      parentId?: Id<"replies">;
    }) =>
      await createReplyMutation({
        postId: args.postId,
        body: args.body,
        parentId: args.parentId,
      }),
    [createReplyMutation],
  );

  const createPost = useCallback(
    async (args: {
      title: string;
      body: string;
      space: string;
      spaceId?: Id<"spaces">;
      priority: Priority;
      wallOwnerId?: Id<"users">;
    }) =>
      await createPostMutation({
        title: args.title,
        body: args.body,
        space: args.space,
        spaceId: args.spaceId,
        priority: args.priority,
        wallOwnerId: args.wallOwnerId,
      }),
    [createPostMutation],
  );

  const summarize = useCallback(
    async (postId: Id<"posts">) => {
      await summarizeAction({ postId });
    },
    [summarizeAction],
  );

  const value = useMemo<StoreValue>(
    () => ({
      mode: "product",
      overlay,
      currentUserId,
      markRead,
      markAllRead,
      createReply,
      createPost,
      summarize,
    }),
    [
      overlay,
      currentUserId,
      markRead,
      markAllRead,
      createReply,
      createPost,
      summarize,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

function sortPosts(a: EnrichedPost, b: EnrichedPost) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.lastActivityAt - a.lastActivityAt;
}

// ---- merged query hooks ---------------------------------------------------

export function useFeed(args: {
  space?: string;
  priority?: Priority;
  onlyUnread?: boolean;
}) {
  const store = useStore();
  const backend = useQuery(api.posts.feed, {
    viewerId: store.currentUserId,
    space: args.space,
    priority: args.priority,
    // onlyUnread is applied client-side so session activity can flip it.
  });

  if (backend === undefined) return undefined;
  if (store.mode === "product") {
    return args.onlyUnread ? backend.filter((post) => post.unread) : backend;
  }

  const { posts, applyOverlay, enrichSessionPost } = store.overlay;

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
}

// Group C — wall feed: a user's own posts plus posts left on their wall.
export function useWall(userId: Id<"users">) {
  const store = useStore();
  const backend = useQuery(api.posts.feed, { viewerId: store.currentUserId });
  if (backend === undefined) return undefined;
  if (store.mode === "product") {
    return backend.filter(
      (post) => post.wallOwnerId === userId || (!post.wallOwnerId && post.authorId === userId),
    );
  }

  const { posts, applyOverlay, enrichSessionPost } = store.overlay;
  const onWall = (p: { wallOwnerId?: Id<"users">; authorId: Id<"users"> }) =>
    p.wallOwnerId === userId || (!p.wallOwnerId && p.authorId === userId);
  const sessionMatched = posts.filter(onWall).map(enrichSessionPost);
  const merged = [
    ...sessionMatched,
    ...backend.filter(onWall).map(applyOverlay),
  ];
  merged.sort(sortPosts);
  return merged;
}

export function useSpaceFeed(
  args:
    | {
        spaceId: Id<"spaces">;
        spaceLabel: string;
      }
    | undefined,
) {
  const store = useStore();
  const backend = useQuery(
    api.spaces.postsForSpace,
    args
      ? {
          spaceId: args.spaceId,
          viewerId: store.currentUserId,
        }
      : "skip",
  );

  if (!args) return undefined;
  if (backend === undefined) return undefined;
  if (store.mode === "product") {
    return backend;
  }

  const { posts, applyOverlay, enrichSessionPost } = store.overlay;

  const sessionMatched = posts
    .filter(
      (post) =>
        !post.wallOwnerId &&
        (post.spaceId === args.spaceId ||
          (!post.spaceId && post.space === args.spaceLabel)),
    )
    .map(enrichSessionPost);

  const merged = [...sessionMatched, ...backend.map(applyOverlay)];
  merged.sort(sortPosts);
  return merged;
}

export function useSearch(term: string) {
  const store = useStore();
  const backend = useQuery(
    api.posts.search,
    term.trim() ? { term, viewerId: store.currentUserId } : "skip",
  );
  const t = term.trim().toLowerCase();
  if (!t) return undefined;
  if (store.mode === "product") {
    return backend;
  }

  const { posts, applyOverlay, enrichSessionPost } = store.overlay;
  const sessionMatched = posts
    .filter(
      (p) =>
        p.title.toLowerCase().includes(t) || p.body.toLowerCase().includes(t),
    )
    .map(enrichSessionPost);
  if (backend === undefined) return undefined;
  return [...sessionMatched, ...backend.map(applyOverlay)].sort(sortPosts);
}

export function usePost(postId: Id<"posts">) {
  const store = useStore();
  const local = isLocalId(postId);
  const backend = useQuery(
    api.posts.get,
    local ? "skip" : { postId, viewerId: store.currentUserId },
  );
  if (store.mode === "product") {
    if (local) return null;
    return backend;
  }

  const { posts, applyOverlay, enrichSessionPost } = store.overlay;
  if (local) {
    const sp = posts.find((p) => p._id === postId);
    return sp ? enrichSessionPost(sp) : null;
  }
  if (backend === undefined) return undefined;
  if (backend === null) return null;
  return applyOverlay(backend);
}

export function useReplies(postId: Id<"posts">) {
  const store = useStore();
  const local = isLocalId(postId);
  const backend = useQuery(
    api.replies.listForPost,
    local ? "skip" : { postId },
  );
  if (store.mode === "product") {
    if (local) return [];
    return backend ?? [];
  }

  const { replies, enrichSessionReply } = store.overlay;
  const session = (replies[postId] ?? []).map(enrichSessionReply);
  return [...(backend ?? []), ...session].sort(
    (a, b) => a.createdAt - b.createdAt,
  );
}

export function useCounts() {
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
}
