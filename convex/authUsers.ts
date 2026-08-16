import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { AVATAR_PALETTE } from "./avatarPalette";

type AuthCtx = MutationCtx | QueryCtx;
export type EffectiveOrgMembership = {
  orgId: Id<"orgs">;
  userId: Id<"users">;
  role: "admin" | "tester" | "member";
  status: "pending" | "active";
  deactivatedAt?: number;
};

export const DEMO_ORG_SLUG = "postwork-demo";
export const DEMO_ORG_NAME = "Postwork Demo";
export const PRODUCT_ORG_SLUG = "postwork";
export const PRODUCT_ORG_NAME = "Postwork";
// Seed compatibility only. Runtime code must choose demo or product explicitly.
export const DEFAULT_ORG_SLUG = DEMO_ORG_SLUG;
export const DEFAULT_ORG_NAME = DEMO_ORG_NAME;

async function getOrgIdBySlug(ctx: AuthCtx, slug: string, message: string) {
  const org = await ctx.db.query("orgs").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
  if (!org) notFound(message);
  return org._id;
}

export const getDemoOrgId = (ctx: AuthCtx) => getOrgIdBySlug(ctx, DEMO_ORG_SLUG, "Demo organization not found. Run the demo seed first.");
export const getProductOrgId = (ctx: AuthCtx) => getOrgIdBySlug(ctx, PRODUCT_ORG_SLUG, "Product organization not found. Run migrations:ensureProductOrg first.");

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
  const givenFamily = [identity.givenName, identity.familyName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return (
    identity.name?.trim() ||
    identity.nickname?.trim() ||
    identity.preferredUsername?.trim() ||
    givenFamily ||
    identity.email?.trim() ||
    "member"
  );
}

export function computeAvatarUrl(
  user: Pick<Doc<"users">, "avatarRemoved" | "providerAvatarUrl">,
  opts?: { uploadedUrl?: string | null },
): string | undefined {
  if (opts?.uploadedUrl) return opts.uploadedUrl;
  if (user.avatarRemoved) return undefined;
  return user.providerAvatarUrl;
}

export async function applyAvatarAction(
  ctx: MutationCtx,
  user: Doc<"users">,
  action:
    | { type: "upload"; storageId: Id<"_storage"> }
    | { type: "remove" }
    | { type: "useProvider" }
    | undefined,
): Promise<Partial<Doc<"users">>> {
  if (!action) return {};
  if (action.type === "upload") {
    // Validate the uploaded blob server-side — the client 5 MB / image-type
    // check is advisory only.
    const meta = await ctx.db.system.get(action.storageId);
    if (!meta) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "That upload could not be found.",
      });
    }
    const ALLOWED_AVATAR_TYPES = [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
    ];
    if (!meta.contentType || !ALLOWED_AVATAR_TYPES.includes(meta.contentType)) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Avatar must be a PNG, JPEG, GIF, or WEBP image.",
      });
    }
    if (meta.size > 5 * 1024 * 1024) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Avatar image must be under 5 MB.",
      });
    }
    const uploadedUrl = await ctx.storage.getUrl(action.storageId);
    if (!uploadedUrl) {
      throw new ConvexError({
        code: "INVALID_INPUT",
        message: "Could not read that uploaded image.",
      });
    }
    return {
      avatarStorageId: action.storageId,
      avatarRemoved: false,
      avatarUrl: uploadedUrl,
    };
  }
  if (action.type === "remove") {
    return {
      avatarStorageId: undefined,
      avatarRemoved: true,
      avatarUrl: undefined,
    };
  }
  return {
    avatarStorageId: undefined,
    avatarRemoved: false,
    avatarUrl: user.providerAvatarUrl,
  };
}

/**
 * Resolve canonical token identifiers globally. `legacyOrgId` is used only to
 * scope the subject lookup for legacy rows that do not have a token identifier.
 */
export async function findUserForIdentity(
  ctx: AuthCtx,
  identity: AuthIdentity,
  legacyOrgId?: Id<"orgs">,
): Promise<Doc<"users"> | null> {
  // tokenIdentifier includes the issuer and subject and is the canonical,
  // globally stable identity key. Resolve it without guessing an org so an
  // authenticated member can be found in whichever org owns their user row.
  const byToken = await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (byToken) return byToken;

  // Legacy subject-only rows predate tokenIdentifier. Keep that migration path
  // scoped to the fallback org; subject alone is not safe as a global identity key.
  if (!legacyOrgId) return null;

  const bySubject = await ctx.db
    .query("users")
    .withIndex("by_org_id_and_subject", (q) =>
      q.eq("orgId", legacyOrgId).eq("subject", identity.subject),
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
  const memberships = await ctx.db
    .query("orgMemberships")
    .withIndex("by_org_id_and_role", (q) =>
      q.eq("orgId", orgId).eq("role", "admin"),
    )
    .take(2);
  if (memberships.length > 0) {
    return memberships.filter(
      (membership) =>
        membership.status === "active" && !membership.deactivatedAt,
    ).length;
  }
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

export function requireOrgId(user: Pick<Doc<"users">, "orgId">): Id<"orgs"> {
  if (!user.orgId) forbidden("Your account is missing organization ownership.");
  return user.orgId;
}

export async function getOrgMembership(
  ctx: AuthCtx,
  orgId: Id<"orgs">,
  userId: Id<"users">,
): Promise<EffectiveOrgMembership | null> {
  const membership = await ctx.db
    .query("orgMemberships")
    .withIndex("by_org_id_and_user_id", (q) =>
      q.eq("orgId", orgId).eq("userId", userId),
    )
    .unique();
  if (membership) return membership;

  // Compatibility for the deployed client while the additive membership
  // backfill is rolling out.
  const user = await ctx.db.get(userId);
  if (!user || user.orgId !== orgId) return null;
  return {
    orgId,
    userId,
    role: user.role ?? "member",
    status: user.status ?? "active",
    deactivatedAt: user.deactivatedAt,
  };
}

export async function listOrgMembershipsForUser(
  ctx: AuthCtx,
  user: Doc<"users">,
): Promise<EffectiveOrgMembership[]> {
  const memberships = (
    await ctx.db
      .query("orgMemberships")
      .withIndex("by_user_id_and_status", (q) =>
        q.eq("userId", user._id).eq("status", "active"),
      )
      .collect()
  ).filter((m) => !m.deactivatedAt);
  if (memberships.length > 0) return memberships;
  if (!user.orgId) return [];
  return [{
    orgId: user.orgId,
    userId: user._id,
    role: user.role ?? "member",
    status: user.status ?? "active",
    deactivatedAt: user.deactivatedAt,
  }];
}

export async function requireOrgMembership(
  ctx: AuthCtx,
  orgId: Id<"orgs">,
  userId: Id<"users">,
  options?: {
    admin?: boolean;
    allowPending?: boolean;
    message?: string;
  },
): Promise<EffectiveOrgMembership> {
  const membership = await getOrgMembership(ctx, orgId, userId);
  if (
    !membership ||
    (!options?.allowPending && membership.status !== "active") ||
    membership.deactivatedAt
  ) {
    forbidden(options?.message ?? "You do not have access to this organization.");
  }
  if (options?.admin && membership.role !== "admin") {
    forbidden(options.message ?? "Organization admins only.");
  }
  return membership;
}

export async function getViewerFromAuth(
  ctx: AuthCtx,
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const legacyOrgId = await getProductOrgId(ctx);
  return await findUserForIdentity(ctx, identity, legacyOrgId);
}

export type ReadScope = { orgId: Id<"orgs">; viewer: Doc<"users"> | null; authenticated: boolean };

export async function resolveReadScope(
  ctx: QueryCtx,
  requestedViewerId?: Id<"users">,
  requestedOrgId?: Id<"orgs">,
): Promise<ReadScope> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    const productOrgId = await getProductOrgId(ctx);
    const viewer = await findUserForIdentity(ctx, identity, productOrgId);
    const orgId = requestedOrgId ?? viewer?.orgId ?? productOrgId;
    if (!viewer) {
      return { orgId, viewer: null, authenticated: true };
    }
    const membership = await getOrgMembership(ctx, orgId, viewer._id);
    return {
      orgId,
      viewer:
        membership?.status === "active" && !membership.deactivatedAt
          ? viewer
          : null,
      authenticated: true,
    };
  }
  const orgId = await getDemoOrgId(ctx);
  if (requestedOrgId && requestedOrgId !== orgId) {
    return { orgId: requestedOrgId, viewer: null, authenticated: false };
  }
  const requested = requestedViewerId ? await ctx.db.get(requestedViewerId) : null;
  return { orgId, viewer: requested?.orgId === orgId ? requested : null, authenticated: false };
}

export async function ensureViewerUser(
  ctx: MutationCtx,
  options?: { unauthenticatedMessage?: string },
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    unauthenticated(options?.unauthenticatedMessage ?? "Sign in to continue.");
  }

  // Resolve the canonical token globally. The product org is only the legacy
  // subject-lookup fallback for identities that predate tokenIdentifier.
  const legacyOrgId = await getProductOrgId(ctx);
  const existing = await findUserForIdentity(ctx, identity, legacyOrgId);
  const name = nameFromIdentity(identity);
  const title = existing?.title?.trim() ? existing.title : "member";
  const initials = initialsFrom(name);
  // Absent `picture` claim (JWT template may omit it) means "unknown", not
  // "clear" — the frontend syncs `providerAvatarUrl` from Clerk's imageUrl.
  const identityPicture = identity.pictureUrl?.trim() || undefined;

  if (existing) {
    // Legacy-only moderation fallback. Once membership rows exist,
    // deactivation is scoped to the organization selected by the request.
    const memberships = await ctx.db
      .query("orgMemberships")
      .withIndex("by_user_id_and_status", (q) =>
        q.eq("userId", existing._id).eq("status", "active"),
      )
      .collect();
    const usable = memberships.filter((m) => !m.deactivatedAt);
    if (existing.deactivatedAt && usable.length === 0) {
      forbidden("Your account has been deactivated. Contact an admin.");
    }
    const patch: Partial<Doc<"users">> = {};
    // Only identity-sync name/initials until the user has completed their
    // profile — afterwards their deliberate edits are authoritative.
    if (existing.profileCompletedAt === undefined) {
      if (existing.name !== name) patch.name = name;
      if (existing.initials !== initials) patch.initials = initials;
    }
    const effectiveProvider = identityPicture ?? existing.providerAvatarUrl;
    if (identityPicture !== undefined && existing.providerAvatarUrl !== identityPicture) {
      patch.providerAvatarUrl = identityPicture;
    }
    if (!existing.avatarStorageId) {
      const nextAvatarUrl = computeAvatarUrl({
        avatarRemoved: existing.avatarRemoved,
        providerAvatarUrl: effectiveProvider,
      });
      if (existing.avatarUrl !== nextAvatarUrl) patch.avatarUrl = nextAvatarUrl;
    }
    if (!existing.avatarColor) patch.avatarColor = colorFor(identity.tokenIdentifier);
    if (!existing.role) {
      patch.role =
        existing.orgId && (await countAdmins(ctx, existing.orgId)) === 0
          ? "admin"
          : "member";
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, patch);
      return { ...existing, ...patch };
    }

    return existing;
  }

  const role = "member";
  const avatarColor = colorFor(identity.tokenIdentifier);
  const userId = await ctx.db.insert("users", {
    orgId: undefined,
    name,
    title,
    avatarColor,
    initials,
    role,
    status: "pending",
    tokenIdentifier: identity.tokenIdentifier,
    subject: identity.subject,
    providerAvatarUrl: identityPicture,
    avatarUrl: computeAvatarUrl({
      providerAvatarUrl: identityPicture,
      avatarRemoved: false,
    }),
  });

  return {
    _id: userId,
    _creationTime: Date.now(),
    orgId: undefined,
    name,
    title,
    avatarColor,
    initials,
    role,
    status: "pending",
    tokenIdentifier: identity.tokenIdentifier,
    subject: identity.subject,
    providerAvatarUrl: identityPicture,
    avatarUrl: computeAvatarUrl({
      providerAvatarUrl: identityPicture,
      avatarRemoved: false,
    }),
  };
}

export async function ensureActiveViewerUser(
  ctx: MutationCtx,
  options?: { unauthenticatedMessage?: string },
): Promise<Doc<"users">> {
  const user = await ensureViewerUser(ctx, options);
  const activeMemberships = (
    await ctx.db
      .query("orgMemberships")
      .withIndex("by_user_id_and_status", (q) =>
        q.eq("userId", user._id).eq("status", "active"),
      )
      .collect()
  ).filter((m) => !m.deactivatedAt);
  if (user.status === "pending" && activeMemberships.length === 0) {
    throw new ConvexError({
      code: "PENDING_ACTIVATION",
      message: "Redeem an invite to activate your account.",
    });
  }
  return user;
}

export async function ensureActiveOrgViewer(
  ctx: MutationCtx,
  requestedOrgId?: Id<"orgs">,
  options?: {
    admin?: boolean;
    unauthenticatedMessage?: string;
  },
): Promise<{
  viewer: Doc<"users">;
  orgId: Id<"orgs">;
  membership: EffectiveOrgMembership;
}> {
  const viewer = await ensureActiveViewerUser(ctx, {
    unauthenticatedMessage: options?.unauthenticatedMessage,
  });
  const orgId = requestedOrgId ?? requireOrgId(viewer);
  const membership = await requireOrgMembership(ctx, orgId, viewer._id, {
    admin: options?.admin,
  });
  return { viewer, orgId, membership };
}

export async function isSpaceMember(
  ctx: AuthCtx,
  spaceId: Id<"spaces">,
  userId: Id<"users">,
): Promise<boolean> {
  const space = await ctx.db.get(spaceId);
  if (!space?.orgId) return false;
  const membership = await ctx.db
    .query("spaceMemberships")
    .withIndex("by_org_id_and_space_id_and_user_id", (q) =>
      q.eq("orgId", space.orgId).eq("spaceId", spaceId).eq("userId", userId),
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
  const orgId = space?.orgId ?? await getDemoOrgId(ctx);
  if (!space || space.orgId !== orgId) {
    return false;
  }

  if (viewerId) {
    const orgMembership = await getOrgMembership(ctx, orgId, viewerId);
    if (
      !orgMembership ||
      orgMembership.status !== "active" ||
      orgMembership.deactivatedAt
    ) {
      return false;
    }
    if (orgMembership.role === "admin" || space.visibility !== "private") {
      return true;
    }
    return await isSpaceMember(ctx, spaceId, viewerId);
  }

  return orgId === await getDemoOrgId(ctx);
}

export async function canAccessPost(
  ctx: AuthCtx,
  post: Doc<"posts">,
  viewerId: Id<"users"> | undefined,
): Promise<boolean> {
  const orgId = post.orgId;
  if (!orgId) return false;
  if (viewerId) {
    const membership = await getOrgMembership(ctx, orgId, viewerId);
    if (
      !membership ||
      membership.status !== "active" ||
      membership.deactivatedAt
    ) {
      return false;
    }
  } else if (orgId !== await getDemoOrgId(ctx)) {
    return false;
  }

  if (!post.spaceId) {
    return true;
  }

  return await canAccessSpace(ctx, post.spaceId, viewerId);
}

export async function requireSpaceReadAccess(
  ctx: AuthCtx,
  spaceId: Id<"spaces">,
  viewerId: Id<"users">,
  message = "You do not have access to this space.",
): Promise<void> {
  if (!(await canAccessSpace(ctx, spaceId, viewerId))) {
    forbidden(message);
  }
}

/**
 * Single write path for organization role/status/deactivation changes.
 * Writes the membership row (source of truth) and mirrors onto the legacy
 * user fields while the deployed client still reads them.
 * `deactivatedAt: null` clears the flag.
 */
export async function upsertOrgMembership(
  ctx: MutationCtx,
  orgId: Id<"orgs">,
  userId: Id<"users">,
  patch: {
    role?: "admin" | "tester" | "member";
    status?: "pending" | "active";
    deactivatedAt?: number | null;
  },
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("orgMemberships")
    .withIndex("by_org_id_and_user_id", (q) =>
      q.eq("orgId", orgId).eq("userId", userId),
    )
    .unique();
  const user = await ctx.db.get(userId);
  const legacyMatches = user?.orgId === orgId;
  if (existing) {
    const membershipPatch: Partial<Doc<"orgMemberships">> = { updatedAt: now };
    if (patch.role !== undefined) membershipPatch.role = patch.role;
    if (patch.status !== undefined) membershipPatch.status = patch.status;
    if (patch.deactivatedAt !== undefined) {
      membershipPatch.deactivatedAt = patch.deactivatedAt ?? undefined;
    }
    await ctx.db.patch(existing._id, membershipPatch);
  } else {
    await ctx.db.insert("orgMemberships", {
      orgId,
      userId,
      role: patch.role ?? (legacyMatches ? user?.role ?? "member" : "member"),
      status: patch.status ?? (legacyMatches ? user?.status ?? "active" : "active"),
      deactivatedAt:
        patch.deactivatedAt !== undefined
          ? patch.deactivatedAt ?? undefined
          : legacyMatches
            ? user?.deactivatedAt
            : undefined,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (user && legacyMatches) {
    const legacy: Partial<Doc<"users">> = {};
    if (patch.role !== undefined) legacy.role = patch.role;
    if (patch.status !== undefined) legacy.status = patch.status;
    if (patch.deactivatedAt !== undefined) legacy.deactivatedAt = patch.deactivatedAt ?? undefined;
    if (Object.keys(legacy).length > 0) await ctx.db.patch(userId, legacy);
  }
}

export async function canManageSpace(
  ctx: AuthCtx,
  spaceId: Id<"spaces">,
  userId: Id<"users">,
): Promise<boolean> {
  const space = await ctx.db.get(spaceId);
  if (!space?.orgId) return false;
  const orgMembership = await getOrgMembership(ctx, space.orgId, userId);
  if (
    !orgMembership ||
    orgMembership.status !== "active" ||
    orgMembership.deactivatedAt
  ) {
    return false;
  }
  if (orgMembership.role === "admin") return true;
  const membership = await ctx.db
    .query("spaceMemberships")
    .withIndex("by_org_id_and_space_id_and_user_id", (q) =>
      q.eq("orgId", space.orgId).eq("spaceId", spaceId).eq("userId", userId),
    )
    .unique();
  return membership?.role === "manager";
}

export async function requireSpaceWriteAccess(
  ctx: AuthCtx,
  spaceId: Id<"spaces">,
  userId: Id<"users">,
): Promise<Doc<"spaces">> {
  const space = await ctx.db.get(spaceId);
  if (!space?.orgId || !(await canAccessSpace(ctx, spaceId, userId))) {
    forbidden("You do not have access to this space.");
  }
  if (space.archivedAt) {
    forbidden("Archived spaces are read-only.");
  }
  return space;
}
