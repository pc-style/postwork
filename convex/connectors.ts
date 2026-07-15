import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ensureActiveViewerUser, getViewerFromAuth, initialsFrom } from "./authUsers";
import { insertAgentReply } from "./replies";
import { connectorAuthStrategy, connectorCapability } from "./schema";
import { parse, replyBodySchema } from "./lib/validation";

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
  const bytes = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
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
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) forbidden("Sign in first.");
    if (
      (args.capability === "agentTasks" && args.authStrategy !== "bearer") ||
      (args.capability === "inboundEvents" && args.authStrategy !== "providerSignature")
    ) {
      invalid("That authentication strategy does not match the connector capability.");
    }

    const credentialId = args.authStrategy === "bearer" ? randomHex(8) : undefined;
    const secret = args.authStrategy === "bearer" ? randomHex(32) : undefined;
    const secretHash = secret ? await hashConnectorSecret(secret) : undefined;
    const created: { connectorId: Id<"connectors">; agentId: Id<"users"> } =
      await ctx.runMutation(internal.connectors.provisionRecord, {
        adminTokenIdentifier: identity.tokenIdentifier,
        name: args.name,
        slug: args.slug,
        capability: args.capability,
        authStrategy: args.authStrategy,
        credentialId,
        secretHash,
      });
    return {
      ...created,
      token: credentialId && secret ? `${TOKEN_PREFIX}.${credentialId}.${secret}` : null,
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
    if (
      (args.capability === "agentTasks" && args.authStrategy !== "bearer") ||
      (args.capability === "inboundEvents" && args.authStrategy !== "providerSignature")
    ) {
      invalid("That authentication strategy does not match the connector capability.");
    }
    if (bearer !== Boolean(args.credentialId && args.secretHash)) {
      invalid("Bearer connectors require one generated credential.");
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
    if (existing) return { eventId: existing._id, duplicate: true as const };

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
    return { eventId, duplicate: false as const };
  },
});
