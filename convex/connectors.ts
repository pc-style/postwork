import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  env,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ensureActiveViewerUser, getViewerFromAuth, initialsFrom } from "./authUsers";
import { insertAgentReply } from "./replies";
import { connectorAuthStrategy, connectorCapability } from "./schema";
import { parse, replyBodySchema } from "./lib/validation";
import {
  connectorSecretKeyring,
  decryptConnectorSecret,
  encryptConnectorSecret,
  sha256Hex,
} from "./lib/connectorSecrets";

const TOKEN_PREFIX = "pwc";

function invalid(message: string): never {
  throw new ConvexError({ code: "INVALID_INPUT", message });
}

function forbidden(message: string): never {
  throw new ConvexError({ code: "FORBIDDEN", message });
}

function randomHex(bytes: number): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function hashConnectorSecret(secret: string): Promise<string> {
  return await sha256Hex(secret);
}

export function parseConnectorToken(
  authorization: string | null,
): { credentialId: string; secret: string } | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const [prefix, credentialId, secret, extra] = authorization.slice(7).split(".");
  if (prefix !== TOKEN_PREFIX || !credentialId || !secret || extra) return null;
  return { credentialId, secret };
}

function connectorSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  if (!slug) invalid("Connector slug is required.");
  return slug;
}

function normalizeExternalRunId(value: string): string {
  const externalRunId = value.trim().slice(0, 200);
  if (!externalRunId) invalid("External run ID is required.");
  return externalRunId;
}

type OrgUser = Doc<"users"> & { orgId: Id<"orgs"> };

async function requireAdminForRead(ctx: QueryCtx): Promise<OrgUser> {
  const viewer = await getViewerFromAuth(ctx);
  if (!viewer) forbidden("Sign in first.");
  if (
    !viewer.orgId ||
    viewer.status === "pending" ||
    viewer.deactivatedAt ||
    viewer.role !== "admin"
  ) {
    forbidden("Admins only.");
  }
  return viewer as OrgUser;
}

async function requireAdminForWrite(ctx: MutationCtx): Promise<OrgUser> {
  const viewer = await ensureActiveViewerUser(ctx);
  if (!viewer.orgId || viewer.role !== "admin") forbidden("Admins only.");
  return viewer as OrgUser;
}

function publicConnector(connector: Doc<"connectors">) {
  return {
    _id: connector._id,
    _creationTime: connector._creationTime,
    name: connector.name,
    slug: connector.slug,
    capability: connector.capability,
    authStrategy: connector.authStrategy,
    agentId: connector.agentId,
    createdById: connector.createdById,
    createdAt: connector.createdAt,
    updatedAt: connector.updatedAt,
    revokedAt: connector.revokedAt,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdminForRead(ctx);
    const connectors = await ctx.db
      .query("connectors")
      .withIndex("by_org_id_and_slug", (q) => q.eq("orgId", admin.orgId))
      .take(100);
    return connectors.map(publicConnector);
  },
});

export const provision = action({
  args: {
    name: v.string(),
    slug: v.string(),
    capability: connectorCapability,
    authStrategy: connectorAuthStrategy,
  },
  handler: async (ctx, args): Promise<{
    connectorId: Id<"connectors">;
    agentId: Id<"users">;
    token: string | null;
    secret: string | null;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) forbidden("Sign in first.");
    if (
      // agentTasks connectors poll with a bearer token. inboundEvents accepts
      // either a provider signature (github) or a bearer token (the opt-in
      // browser-extension flow, e.g. the x digest).
      args.capability === "agentTasks" && args.authStrategy !== "bearer"
    ) {
      invalid("That authentication strategy does not match the connector capability.");
    }

    const credentialId = args.authStrategy === "bearer" ? randomHex(8) : undefined;
    const secret = randomHex(32);
    const secretHash = secret ? await hashConnectorSecret(secret) : undefined;
    const encryptedSecret = args.authStrategy === "providerSignature"
      ? await encryptConnectorSecret(
          secret,
          connectorSecretKeyring(env),
        )
      : undefined;
    const created: { connectorId: Id<"connectors">; agentId: Id<"users"> } =
      await ctx.runMutation(internal.connectors.provisionRecord, {
        adminTokenIdentifier: identity.tokenIdentifier,
        name: args.name,
        slug: args.slug,
        capability: args.capability,
        authStrategy: args.authStrategy,
        credentialId,
        secretHash,
        encryptedSecret,
      });
    return {
      ...created,
      token: credentialId ? `${TOKEN_PREFIX}.${credentialId}.${secret}` : null,
      secret: args.authStrategy === "providerSignature" ? secret : null,
    };
  },
});

export const rewrapGithubSecret = action({
  args: { connectorId: v.id("connectors") },
  handler: async (ctx, args): Promise<{
    connectorId: Id<"connectors">;
    keyId: string;
    rewrapped: boolean;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) forbidden("Sign in first.");
    const material: { encryptedSecret: string } = await ctx.runQuery(
      internal.connectors.getGithubSecretForRewrap,
      {
        adminTokenIdentifier: identity.tokenIdentifier,
        connectorId: args.connectorId,
      },
    );
    const keyring = connectorSecretKeyring(env);
    const decrypted = await decryptConnectorSecret(material.encryptedSecret, keyring);
    if (decrypted.keyId === keyring.activeKeyId) {
      return {
        connectorId: args.connectorId,
        keyId: keyring.activeKeyId,
        rewrapped: false,
      };
    }
    const encryptedSecret = await encryptConnectorSecret(decrypted.secret, keyring);
    await ctx.runMutation(internal.connectors.commitGithubSecretRewrap, {
      adminTokenIdentifier: identity.tokenIdentifier,
      connectorId: args.connectorId,
      expectedEncryptedSecret: material.encryptedSecret,
      encryptedSecret,
      fromKeyId: decrypted.keyId,
      toKeyId: keyring.activeKeyId,
    });
    return {
      connectorId: args.connectorId,
      keyId: keyring.activeKeyId,
      rewrapped: true,
    };
  },
});

export const provisionRecord = internalMutation({
  args: {
    adminTokenIdentifier: v.string(),
    name: v.string(),
    slug: v.string(),
    capability: connectorCapability,
    authStrategy: connectorAuthStrategy,
    credentialId: v.optional(v.string()),
    secretHash: v.optional(v.string()),
    encryptedSecret: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", args.adminTokenIdentifier),
      )
      .unique();
    if (
      !admin?.orgId ||
      admin.role !== "admin" ||
      admin.status === "pending" ||
      admin.deactivatedAt
    ) {
      forbidden("Admins only.");
    }
    const orgId = admin.orgId;

    const name = args.name.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) invalid("Connector name is required.");
    const slug = connectorSlug(args.slug);
    const existing = await ctx.db
      .query("connectors")
      .withIndex("by_org_id_and_slug", (q) => q.eq("orgId", orgId).eq("slug", slug))
      .unique();
    if (existing) invalid("A connector with that slug already exists.");

    const bearer = args.authStrategy === "bearer";
    const providerSignature = args.authStrategy === "providerSignature";
    // agentTasks connectors poll with a bearer token. inboundEvents accepts a
    // provider signature (github) or a bearer token (the x cross-post sync).
    if (args.capability === "agentTasks" && args.authStrategy !== "bearer") {
      invalid("That authentication strategy does not match the connector capability.");
    }
    if (
      (bearer && (!args.credentialId || !args.secretHash || args.encryptedSecret)) ||
      (providerSignature && (args.credentialId || !args.secretHash || !args.encryptedSecret))
    ) {
      invalid("Connector credentials do not match the authentication strategy.");
    }
    if (args.credentialId) {
      const credentialOwner = await ctx.db
        .query("connectors")
        .withIndex("by_credential_id", (q) => q.eq("credentialId", args.credentialId))
        .unique();
      if (credentialOwner) invalid("Connector credential collision.");
    }

    const now = Date.now();
    const agentId = await ctx.db.insert("users", {
      orgId,
      name,
      title: args.capability === "agentTasks" ? "Coding Agent" : "Integration Agent",
      avatarColor: "#5f6f8f",
      initials: initialsFrom(name),
      role: "member",
      status: "active",
      isAgent: true,
    });
    const connectorId = await ctx.db.insert("connectors", {
      orgId,
      name,
      slug,
      capability: args.capability,
      authStrategy: args.authStrategy,
      agentId,
      credentialId: args.credentialId,
      secretHash: args.secretHash,
      encryptedSecret: args.encryptedSecret,
      createdById: admin._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      orgId,
      actorId: admin._id,
      action: "connector.provisioned",
      targetType: "connector",
      targetId: connectorId,
      metadata: JSON.stringify({
        agentId,
        capability: args.capability,
        authStrategy: args.authStrategy,
      }),
      createdAt: now,
    });
    return { connectorId, agentId };
  },
});

export const getGithubInboundSignatureMaterial = internalQuery({
  args: { connectorId: v.id("connectors") },
  handler: async (ctx, args) => {
    const connector = await ctx.db.get(args.connectorId);
    if (
      !connector ||
      connector.slug !== "github" ||
      connector.capability !== "inboundEvents" ||
      connector.authStrategy !== "providerSignature" ||
      !connector.encryptedSecret ||
      connector.revokedAt
    ) {
      forbidden("Inbound connector is unavailable.");
    }
    const agent = await ctx.db.get(connector.agentId);
    if (
      !agent ||
      agent.orgId !== connector.orgId ||
      agent.isAgent !== true ||
      agent.deactivatedAt !== undefined
    ) {
      forbidden("Inbound connector is unavailable.");
    }
    return { encryptedSecret: connector.encryptedSecret };
  },
});

export const getGithubSecretForRewrap = internalQuery({
  args: {
    adminTokenIdentifier: v.string(),
    connectorId: v.id("connectors"),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", args.adminTokenIdentifier),
      )
      .unique();
    if (
      !admin?.orgId ||
      admin.role !== "admin" ||
      admin.status === "pending" ||
      admin.deactivatedAt
    ) {
      forbidden("Admins only.");
    }
    const connector = await ctx.db.get(args.connectorId);
    if (
      !connector ||
      connector.orgId !== admin.orgId ||
      connector.slug !== "github" ||
      connector.capability !== "inboundEvents" ||
      connector.authStrategy !== "providerSignature" ||
      !connector.encryptedSecret ||
      connector.revokedAt
    ) {
      invalid("GitHub connector not found.");
    }
    return { encryptedSecret: connector.encryptedSecret };
  },
});

export const commitGithubSecretRewrap = internalMutation({
  args: {
    adminTokenIdentifier: v.string(),
    connectorId: v.id("connectors"),
    expectedEncryptedSecret: v.string(),
    encryptedSecret: v.string(),
    fromKeyId: v.string(),
    toKeyId: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", args.adminTokenIdentifier),
      )
      .unique();
    if (
      !admin?.orgId ||
      admin.role !== "admin" ||
      admin.status === "pending" ||
      admin.deactivatedAt
    ) {
      forbidden("Admins only.");
    }
    const connector = await ctx.db.get(args.connectorId);
    if (
      !connector ||
      connector.orgId !== admin.orgId ||
      connector.slug !== "github" ||
      connector.capability !== "inboundEvents" ||
      connector.authStrategy !== "providerSignature" ||
      connector.revokedAt
    ) {
      invalid("GitHub connector not found.");
    }
    if (connector.encryptedSecret !== args.expectedEncryptedSecret) {
      invalid("Connector secret changed during rewrap.");
    }
    const now = Date.now();
    await ctx.db.patch(connector._id, {
      encryptedSecret: args.encryptedSecret,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      orgId: admin.orgId,
      actorId: admin._id,
      action: "connector.secret.rewrapped",
      targetType: "connector",
      targetId: connector._id,
      metadata: JSON.stringify({
        fromKeyId: args.fromKeyId,
        toKeyId: args.toKeyId,
      }),
      createdAt: now,
    });
  },
});

export const revoke = mutation({
  args: { connectorId: v.id("connectors") },
  handler: async (ctx, args) => {
    const admin = await requireAdminForWrite(ctx);
    const connector = await ctx.db.get(args.connectorId);
    if (!connector || connector.orgId !== admin.orgId) invalid("Connector not found.");
    if (connector.revokedAt) return;
    const now = Date.now();
    await ctx.db.patch(connector._id, { revokedAt: now, updatedAt: now });
    await ctx.db.patch(connector.agentId, { deactivatedAt: now });
    await ctx.db.insert("auditLog", {
      orgId: admin.orgId,
      actorId: admin._id,
      action: "connector.revoked",
      targetType: "connector",
      targetId: connector._id,
      createdAt: now,
    });
  },
});

async function authenticatedBearerConnector(
  ctx: MutationCtx,
  credentialId: string,
  secretHash: string,
): Promise<Doc<"connectors">> {
  const connector = await ctx.db
    .query("connectors")
    .withIndex("by_credential_id", (q) => q.eq("credentialId", credentialId))
    .unique();
  if (
    !connector ||
    connector.authStrategy !== "bearer" ||
    connector.secretHash !== secretHash ||
    connector.revokedAt
  ) {
    forbidden("Connector authentication failed.");
  }
  const agent = await ctx.db.get(connector.agentId);
  if (
    !agent ||
    agent.orgId !== connector.orgId ||
    agent.isAgent !== true ||
    agent.deactivatedAt !== undefined
  ) {
    forbidden("Connector authentication failed.");
  }
  return connector;
}

async function taskContext(ctx: MutationCtx, task: Doc<"agentTasks">) {
  const [post, agent] = await Promise.all([
    ctx.db.get(task.postId),
    ctx.db.get(task.agentId),
  ]);
  if (!post || !agent || post.orgId !== task.orgId || agent.orgId !== task.orgId) {
    invalid("Task context could not be loaded.");
  }
  const replyWindow = await ctx.db
    .query("replies")
    .withIndex("by_org_id_and_post_id_and_created_at", (q) =>
      q.eq("orgId", task.orgId).eq("postId", task.postId),
    )
    .order("asc")
    .take(201);
  const replies = replyWindow.slice(0, 200);
  return {
    taskId: task._id,
    post: { id: post._id, title: post.title, body: post.body },
    sourceReplyId: task.sourceReplyId,
    prompt: task.prompt,
    agent: { id: agent._id, name: agent.name },
    replies: replies.map((reply) => ({
      id: reply._id,
      parentId: reply.parentId,
      authorId: reply.authorId,
      body: reply.body,
    })),
    repliesTruncated: replyWindow.length > replies.length,
  };
}

export const claimAgentTask = internalMutation({
  args: {
    credentialId: v.string(),
    secretHash: v.string(),
    taskId: v.id("agentTasks"),
    externalRunId: v.string(),
  },
  handler: async (ctx, args) => {
    const connector = await authenticatedBearerConnector(
      ctx,
      args.credentialId,
      args.secretHash,
    );
    if (connector.capability !== "agentTasks") forbidden("Connector cannot run tasks.");
    const task = await ctx.db.get(args.taskId);
    if (
      !task ||
      task.orgId !== connector.orgId ||
      task.connectorId !== connector._id ||
      task.agentId !== connector.agentId
    ) {
      invalid("Task not found.");
    }
    const externalRunId = normalizeExternalRunId(args.externalRunId);
    if (task.status === "running" && task.externalRunId === externalRunId) {
      return await taskContext(ctx, task);
    }
    if (task.status !== "queued") invalid("Task is not available to claim.");

    const now = Date.now();
    await ctx.db.patch(task._id, {
      status: "running",
      externalRunId,
      claimedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      orgId: connector.orgId,
      actorId: connector.agentId,
      action: "connector.agent_task.claimed",
      targetType: "agentTask",
      targetId: task._id,
      metadata: JSON.stringify({ connectorId: connector._id, externalRunId }),
      createdAt: now,
    });
    return await taskContext(ctx, { ...task, status: "running", externalRunId });
  },
});

export const finishAgentTask = internalMutation({
  args: {
    credentialId: v.string(),
    secretHash: v.string(),
    taskId: v.id("agentTasks"),
    externalRunId: v.string(),
    outcome: v.union(
      v.object({
        status: v.literal("done"),
        body: v.string(),
        model: v.optional(v.string()),
      }),
      v.object({ status: v.literal("failed"), error: v.string() }),
    ),
  },
  handler: async (ctx, args) => {
    const connector = await authenticatedBearerConnector(
      ctx,
      args.credentialId,
      args.secretHash,
    );
    const externalRunId = normalizeExternalRunId(args.externalRunId);
    const task = await ctx.db.get(args.taskId);
    if (
      !task ||
      task.orgId !== connector.orgId ||
      task.connectorId !== connector._id ||
      task.agentId !== connector.agentId ||
      task.externalRunId !== externalRunId
    ) {
      invalid("Task not found.");
    }
    if (task.status === "done" && task.resultReplyId && args.outcome.status === "done") {
      return { status: "done" as const, replyId: task.resultReplyId };
    }
    if (task.status === "failed" && args.outcome.status === "failed") {
      return { status: "failed" as const };
    }
    if (task.status !== "running") invalid("Task is not running.");

    const now = Date.now();
    if (args.outcome.status === "failed") {
      const error = args.outcome.error.trim().slice(0, 1000);
      if (!error) invalid("Failure reason is required.");
      await ctx.db.patch(task._id, {
        status: "failed",
        error,
        completedAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("auditLog", {
        orgId: connector.orgId,
        actorId: connector.agentId,
        action: "connector.agent_task.failed",
        targetType: "agentTask",
        targetId: task._id,
        metadata: JSON.stringify({ connectorId: connector._id }),
        createdAt: now,
      });
      return { status: "failed" as const };
    }

    const result = parse(replyBodySchema, args.outcome.body, "body");
    const replyId = await insertAgentReply(ctx, {
      postId: task.postId,
      parentId: task.sourceReplyId,
      authorId: connector.agentId,
      body: result,
    });
    await ctx.db.patch(task._id, {
      status: "done",
      result,
      model: args.outcome.model?.trim().slice(0, 200) || `connector/${connector.slug}`,
      resultReplyId: replyId,
      completedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditLog", {
      orgId: connector.orgId,
      actorId: connector.agentId,
      action: "connector.agent_task.completed",
      targetType: "agentTask",
      targetId: task._id,
      metadata: JSON.stringify({ connectorId: connector._id, replyId }),
      createdAt: now,
    });
    return { status: "done" as const, replyId };
  },
});

// Provider-specific HTTP actions must verify their signature before calling
// this mutation. It records only the delivery identity, never the raw payload.
export const recordInboundEvent = internalMutation({
  args: {
    connectorId: v.id("connectors"),
    externalEventId: v.string(),
    eventType: v.string(),
    lifecycle: v.optional(
      v.union(
        v.object({
          kind: v.literal("post"),
          title: v.string(),
          body: v.string(),
          priority: v.union(v.literal("normal"), v.literal("high")),
        }),
        v.object({
          kind: v.literal("agentTask"),
          title: v.string(),
          body: v.string(),
          prompt: v.string(),
          priority: v.literal("high"),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const connector = await ctx.db.get(args.connectorId);
    if (
      !connector ||
      connector.capability !== "inboundEvents" ||
      connector.authStrategy !== "providerSignature" ||
      connector.revokedAt
    ) {
      forbidden("Inbound connector is unavailable.");
    }
    const externalEventId = args.externalEventId.trim().slice(0, 300);
    const eventType = args.eventType.trim().slice(0, 120);
    if (!externalEventId || !eventType) invalid("Event ID and type are required.");
    const existing = await ctx.db
      .query("connectorEvents")
      .withIndex("by_connector_id_and_external_event_id", (q) =>
        q.eq("connectorId", connector._id).eq("externalEventId", externalEventId),
      )
      .unique();
    if (existing) {
      return {
        eventId: existing._id,
        duplicate: true as const,
        postId: existing.postId,
        agentTaskId: existing.agentTaskId,
      };
    }

    const agent = await ctx.db.get(connector.agentId);
    if (
      !agent ||
      agent.orgId !== connector.orgId ||
      agent.isAgent !== true ||
      agent.deactivatedAt !== undefined
    ) {
      forbidden("Inbound connector is unavailable.");
    }

    const now = Date.now();
    const eventId = await ctx.db.insert("connectorEvents", {
      orgId: connector.orgId,
      connectorId: connector._id,
      externalEventId,
      eventType,
      receivedAt: now,
    });
    await ctx.db.insert("auditLog", {
      orgId: connector.orgId,
      actorId: connector.agentId,
      action: "connector.inbound_event.received",
      targetType: "connectorEvent",
      targetId: eventId,
      metadata: JSON.stringify({ connectorId: connector._id, eventType }),
      createdAt: now,
    });

    if (!args.lifecycle) {
      return {
        eventId,
        duplicate: false as const,
        postId: undefined,
        agentTaskId: undefined,
      };
    }

    const title = args.lifecycle.title.trim().replace(/\s+/g, " ").slice(0, 160);
    const body = args.lifecycle.body.trim().slice(0, 12_000);
    if (!title || !body) invalid("Inbound lifecycle content is required.");
    const postId = await ctx.db.insert("posts", {
      orgId: connector.orgId,
      authorId: connector.agentId,
      title,
      body,
      space: "Engineering",
      priority: args.lifecycle.priority,
      pinned: false,
      createdAt: now,
      lastActivityAt: now,
      replyCount: 0,
      participantIds: [connector.agentId],
    });

    let agentTaskId: Id<"agentTasks"> | undefined;
    if (args.lifecycle.kind === "agentTask") {
      const prompt = args.lifecycle.prompt.trim().slice(0, 4_000);
      if (!prompt) invalid("Inbound agent task prompt is required.");
      agentTaskId = await ctx.db.insert("agentTasks", {
        orgId: connector.orgId,
        postId,
        agentId: connector.agentId,
        requestedById: connector.createdById,
        status: "queued",
        prompt,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.agentTasks.runSimulated, { taskId: agentTaskId });
    }

    await ctx.db.patch(eventId, { postId, agentTaskId });
    await ctx.db.insert("auditLog", {
      orgId: connector.orgId,
      actorId: connector.agentId,
      action: agentTaskId
        ? "connector.github.agent_task.queued"
        : "connector.github.post.created",
      targetType: agentTaskId ? "agentTask" : "post",
      targetId: agentTaskId ?? postId,
      metadata: JSON.stringify({ connectorId: connector._id, eventId, eventType }),
      createdAt: now,
    });
    return { eventId, duplicate: false as const, postId, agentTaskId };
  },
});

// Shared insert path for X cross-posts: dedupes on the tweet id, mirrors the
// tweet as a post by the connector's agent, and audit-logs the ingestion.
async function insertXCrossPost(
  ctx: MutationCtx,
  connector: Doc<"connectors">,
  tweet: { id: string; handle: string; text: string; url?: string },
) {
  const tweetId = tweet.id.trim().slice(0, 100);
  const handle = tweet.handle.trim().replace(/^@/, "").slice(0, 30);
  const text = tweet.text.trim().slice(0, 12_000);
  if (!tweetId || !handle || !text) invalid("Tweet id, handle, and text are required.");
  const url = tweet.url?.trim().slice(0, 400);

  const externalEventId = `x-post-${tweetId}`;
  const existing = await ctx.db
    .query("connectorEvents")
    .withIndex("by_connector_id_and_external_event_id", (q) =>
      q.eq("connectorId", connector._id).eq("externalEventId", externalEventId),
    )
    .unique();
  if (existing) {
    return { eventId: existing._id, duplicate: true as const, postId: existing.postId };
  }

  const now = Date.now();
  const eventId = await ctx.db.insert("connectorEvents", {
    orgId: connector.orgId,
    connectorId: connector._id,
    externalEventId,
    eventType: "x.post.created",
    receivedAt: now,
  });

  const teaser = text.replace(/\s+/g, " ").slice(0, 90);
  const title = `@${handle} on x: ${teaser}${text.length > 90 ? "…" : ""}`.slice(0, 160);
  const body = url
    ? `${text}\n\n—\nCross-posted from ${url}`
    : `${text}\n\n—\nCross-posted from @${handle} on X.`;
  const postId = await ctx.db.insert("posts", {
    orgId: connector.orgId,
    authorId: connector.agentId,
    title,
    body,
    space: "Growth",
    priority: "normal",
    pinned: false,
    createdAt: now,
    lastActivityAt: now,
    replyCount: 0,
    participantIds: [connector.agentId],
  });

  await ctx.db.patch(eventId, { postId });
  await ctx.db.insert("auditLog", {
    orgId: connector.orgId,
    actorId: connector.agentId,
    action: "connector.x.post.created",
    targetType: "post",
    targetId: postId,
    metadata: JSON.stringify({ connectorId: connector._id, eventId, tweetId }),
    createdAt: now,
  });
  return { eventId, duplicate: false as const, postId };
}

// Inbound cross-posting from X via the opt-in browser extension. The extension
// catches a tweet as the user posts it and mirrors it into Postwork as a post
// by the connector's agent. Authenticated with a bearer connector token, so a
// team member opts in by pasting the token into the extension — no X API keys.
export const recordXCrossPost = internalMutation({
  args: {
    credentialId: v.string(),
    secretHash: v.string(),
    tweet: v.object({
      id: v.string(),
      handle: v.string(),
      text: v.string(),
      url: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const connector = await authenticatedBearerConnector(
      ctx,
      args.credentialId,
      args.secretHash,
    );
    if (connector.capability !== "inboundEvents") {
      forbidden("Connector cannot record inbound events.");
    }
    return await insertXCrossPost(ctx, connector, args.tweet);
  },
});

// Locates the connector the X sync should post through when
// X_SYNC_CONNECTOR_ID is not set: the first active inboundEvents connector
// with the "x" slug. Internal-only; used by the scheduled sync action.
export const findXSyncConnector = internalQuery({
  args: {},
  handler: async (ctx) => {
    const connectors = await ctx.db.query("connectors").take(500);
    const match = connectors.find(
      (connector) =>
        connector.slug === "x" &&
        connector.capability === "inboundEvents" &&
        !connector.revokedAt,
    );
    return match ? { connectorId: match._id } : null;
  },
});

// Trusted path for the server-side X sync (cron polling x.pcstyle.dev).
// Internal-only: callers are our own scheduled actions, so it authenticates
// the connector by id instead of a bearer credential.
export const recordXCrossPostFromSync = internalMutation({
  args: {
    connectorId: v.id("connectors"),
    tweet: v.object({
      id: v.string(),
      handle: v.string(),
      text: v.string(),
      url: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const connector = await ctx.db.get(args.connectorId);
    if (
      !connector ||
      connector.capability !== "inboundEvents" ||
      connector.revokedAt
    ) {
      forbidden("Inbound connector is unavailable.");
    }
    const agent = await ctx.db.get(connector.agentId);
    if (
      !agent ||
      agent.orgId !== connector.orgId ||
      agent.isAgent !== true ||
      agent.deactivatedAt !== undefined
    ) {
      forbidden("Inbound connector is unavailable.");
    }
    return await insertXCrossPost(ctx, connector, args.tweet);
  },
});
