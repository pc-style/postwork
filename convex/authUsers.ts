import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { AVATAR_PALETTE } from "./avatarPalette";
import { isDemo } from "./lib/demo";

type AuthCtx = MutationCtx | QueryCtx;

export const DEFAULT_ORG_SLUG = "postwork-demo";
export const DEFAULT_ORG_NAME = "Postwork Demo";

export async function getDefaultOrgId(ctx: AuthCtx): Promise<Id<"orgs">> {
  const org = await ctx.db
    .query("orgs")
    .withIndex("by_slug", (q) => q.eq("slug", DEFAULT_ORG_SLUG))
    .unique();
  if (!org) {
    notFound("Default organization not found. Run the seed or create it first.");
  }
  return org._id;
}

export async function ensureDefaultOrg(ctx: MutationCtx): Promise<Id<"orgs">> {
  const existing = await ctx.db
    .query("orgs")
    .withIndex("by_slug", (q) => q.eq("slug", DEFAULT_ORG_SLUG))
    .unique();
  if (existing) return existing._id;
  return await ctx.db.insert("orgs", {
    name: DEFAULT_ORG_NAME,
    slug: DEFAULT_ORG_SLUG,
    createdAt: Date.now(),
  });
}

export type AuthIdentity = NonNullable<
  Awaited<ReturnType<AuthCtx["auth"]["getUserIdentity"]>>
>;

export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function nameFromIdentity(identity: AuthIdentity): string {
  return (
    identity.name ??
    identity.nickname ??
    identity.preferredUsername ??
    identity.email ??
    "member"
  );
}

export async function findUserForIdentity(
  ctx: AuthCtx,
  identity: AuthIdentity,
  orgId?: Id<"orgs">,
): Promise<Doc<"users"> | null> {
  const resolvedOrgId = orgId ?? (await getDefaultOrgId(ctx));
  const byToken = await ctx.db
    .query("users")
    .withIndex("by_org_id_and_token_identifier", (q) =>
      q.eq("orgId", resolvedOrgId).eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .first();
  if (byToken) return byToken;

  const bySubject = await ctx.db
    .query("users")
    .withIndex("by_org_id_and_subject", (q) =>
      q.eq("orgId", resolvedOrgId).eq("subject", identity.subject),
    )
    .first();
  if (!bySubject) return null;

  if ("patch" in ctx.db) {
    await ctx.db.patch(bySubject._id, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    return { ...bySubject, tokenIdentifier: identity.tokenIdentifier };
  }

  return bySubject;
}

export async function countAdmins(ctx: AuthCtx, orgId: Id<"orgs">): Promise<number> {
  const admins = await ctx.db.query("users").withIndex("by_org_id_and_role", (q) => q.eq("orgId", orgId).eq("role", "admin")).take(2);
  return admins.length;
}

export function unauthenticated(message: string): never {
  throw new ConvexError({
    code: "UNAUTHENTICATED",
    message,
  });
}

export function forbidden(message: string): never {
  throw new ConvexError({
    code: "FORBIDDEN",
    message,
  });
}

export function notFound(message: string): never {
  throw new ConvexError({
    code: "NOT_FOUND",
    message,
  });
}

export async function getViewerFromAuth(
  ctx: AuthCtx,
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await findUserForIdentity(ctx, identity);
}

export async function resolveViewerForRead(
  ctx: QueryCtx,
  requestedViewerId: Id<"users"> | undefined,
): Promise<Doc<"users"> | null> {
  const viewer = await getViewerFromAuth(ctx);
  if (viewer) return viewer;

  if (!isDemo() || !requestedViewerId) {
    return null;
  }

  return await ctx.db.get(requestedViewerId);
}

export async function ensureViewerUser(
  ctx: MutationCtx,
  options?: { unauthenticatedMessage?: string },
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    unauthenticated(options?.unauthenticatedMessage ?? "Sign in to continue.");
  }

  const orgId = await ensureDefaultOrg(ctx);
  const existing = await findUserForIdentity(ctx, identity, orgId);
  const name = nameFromIdentity(identity);
  const title = existing?.title?.trim() ? existing.title : "member";
  const initials = initialsFrom(name);

  if (existing) {
    // Moderation (Phase 3.5): deactivated users cannot write.
    if (existing.deactivatedAt) {
      forbidden("Your account has been deactivated. Contact an admin.");
    }
    const patch: Partial<Doc<"users">> = {};
    if (existing.name !== name) patch.name = name;
    if (existing.initials !== initials) patch.initials = initials;
    if (!existing.avatarColor) patch.avatarColor = colorFor(identity.tokenIdentifier);
    if (!existing.role) {
      patch.role = (await countAdmins(ctx, orgId)) === 0 ? "admin" : "member";
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, patch);
      return { ...existing, ...patch };
    }

    return existing;
  }

  const role = (await countAdmins(ctx, orgId)) === 0 ? "admin" : "member";
  const avatarColor = colorFor(identity.tokenIdentifier);
  const userId = await ctx.db.insert("users", {
    orgId,
    name,
    title,
    avatarColor,
    initials,
    role,
    tokenIdentifier: identity.tokenIdentifier,
    subject: identity.subject,
  });

  return {
    _id: userId,
    _creationTime: Date.now(),
    orgId,
    name,
    title,
    avatarColor,
    initials,
    role,
    tokenIdentifier: identity.tokenIdentifier,
    subject: identity.subject,
  };
}

export async function isSpaceMember(
  ctx: AuthCtx,
  spaceId: Id<"spaces">,
  userId: Id<"users">,
): Promise<boolean> {
  const orgId = await getDefaultOrgId(ctx);
  const membership = await ctx.db
    .query("spaceMemberships")
    .withIndex("by_org_id_and_space_id_and_user_id", (q) =>
      q.eq("orgId", orgId).eq("spaceId", spaceId).eq("userId", userId),
    )
    .unique();
  return membership !== null;
}

export async function canAccessSpace(
  ctx: AuthCtx,
  spaceId: Id<"spaces">,
  viewerId: Id<"users"> | undefined,
): Promise<boolean> {
  const space = await ctx.db.get(spaceId);
  if (!space || space.orgId !== (viewerId ? (await ctx.db.get(viewerId))?.orgId : await getDefaultOrgId(ctx))) {
    return false;
  }

  if (viewerId) {
    return await isSpaceMember(ctx, spaceId, viewerId);
  }

  return isDemo();
}

export async function canAccessPost(
  ctx: AuthCtx,
  post: Doc<"posts">,
  viewerId: Id<"users"> | undefined,
): Promise<boolean> {
  const orgId = viewerId ? (await ctx.db.get(viewerId))?.orgId : await getDefaultOrgId(ctx);
  if (post.orgId !== orgId) return false;

  if (!post.spaceId) {
    return true;
  }

  return await canAccessSpace(ctx, post.spaceId, viewerId);
}

export async function requireSpaceMember(
  ctx: AuthCtx,
  spaceId: Id<"spaces">,
  viewerId: Id<"users">,
  message = "You do not have access to this space.",
): Promise<void> {
  if (!(await isSpaceMember(ctx, spaceId, viewerId))) {
    forbidden(message);
  }
}
