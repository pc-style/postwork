import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { isDemo } from "./demoMode";
import { useSession } from "./session";
import { isLocalId, useStore } from "./store";

export type SpaceListItem = FunctionReturnType<typeof api.spaces.list>[number];
export type SpaceDetails = NonNullable<FunctionReturnType<typeof api.spaces.getBySlug>>;
export type SpaceMembership = FunctionReturnType<
  typeof api.spaces.membershipsForSpace
>[number];

export function useSpacesList() {
  const { currentUserId } = useSession();
  const store = useStore();
  const backend = useQuery(api.spaces.list, { viewerId: currentUserId }) ?? [];
  if (store.mode === "product") return backend;
  const localSpaces = store.overlay.spaces
    .filter((space) => space.createdBy === currentUserId)
    .map((space) => {
      const posts = store.overlay.posts.filter((post) => post.spaceId === space._id);
      return {
        ...space,
        postCount: posts.length,
        latestActivityAt: posts.reduce(
          (latest, post) => Math.max(latest, post.lastActivityAt),
          space.createdAt,
        ),
      };
    });
  return [
    ...localSpaces,
    ...backend,
  ];
}

export function useSpaceCreationStatus() {
  const { currentUser, currentUserId } = useSession();
  const store = useStore();
  const backend = useQuery(
    api.spaces.creationStatus,
    isDemo ? "skip" : { viewerId: currentUserId },
  );
  if (store.mode === "product") return backend;
  if (!currentUser) return undefined;

  const limit = currentUser.role === "admin" ? null : currentUser.role === "tester" ? 3 : 1;
  const createdCount = store.overlay.spaces.filter(
    (space) => space.createdBy === currentUserId,
  ).length;
  return {
    limit,
    createdCount,
    canCreate: limit === null || createdCount < limit,
  };
}

export function useSpaceBySlug(slug: string) {
  const { currentUserId } = useSession();
  const store = useStore();
  const local = store.overlay.spaces.find(
    (space) => space.slug === slug && space.createdBy === currentUserId,
  );
  const space = useQuery(
    api.spaces.getBySlug,
    local ? "skip" : { slug, viewerId: currentUserId },
  );
  if (local) return local;
  return space === undefined ? undefined : space;
}

export function useSpaceMemberships(spaceId: Id<"spaces"> | undefined) {
  const { currentUser, currentUserId } = useSession();
  const local = spaceId ? isLocalId(spaceId) : false;
  const localSpaceId = local ? spaceId : undefined;
  const membership =
    localSpaceId && currentUser
      ? [{
          _id: `local_membership_${localSpaceId}` as Id<"spaceMemberships">,
          _creationTime: currentUser._creationTime,
          orgId: currentUser.orgId,
          spaceId: localSpaceId,
          userId: currentUser._id,
          createdAt: currentUser._creationTime,
          user: currentUser,
        }]
      : [];
  return (
    useQuery(
      api.spaces.membershipsForSpace,
      spaceId && !local ? { spaceId, viewerId: currentUserId } : "skip",
    ) ?? membership
  );
}
