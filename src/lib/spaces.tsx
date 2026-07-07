import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSession } from "./session";

export type SpaceListItem = FunctionReturnType<typeof api.spaces.list>[number];
export type SpaceDetails = NonNullable<FunctionReturnType<typeof api.spaces.getBySlug>>;
export type SpaceMembership = FunctionReturnType<
  typeof api.spaces.membershipsForSpace
>[number];

export function useSpacesList() {
  const { currentUserId } = useSession();
  return useQuery(api.spaces.list, { viewerId: currentUserId }) ?? [];
}

export function useSpaceBySlug(slug: string) {
  const { currentUserId } = useSession();
  const space = useQuery(api.spaces.getBySlug, { slug, viewerId: currentUserId });
  return space === undefined ? undefined : space;
}

export function useSpaceMemberships(spaceId: Id<"spaces"> | undefined) {
  const { currentUserId } = useSession();
  return (
    useQuery(
      api.spaces.membershipsForSpace,
      spaceId ? { spaceId, viewerId: currentUserId } : "skip",
    ) ?? []
  );
}
