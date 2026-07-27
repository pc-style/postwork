/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { hashConnectorSecret, parseConnectorToken } from "./connectors";
import {
  connectorSecretKeyring,
  decryptConnectorSecret,
  encryptConnectorSecret,
} from "./lib/connectorSecrets";

const modules = import.meta.glob("./**/*.ts");
const ADMIN_TOKEN = "https://issuer.example|connector-admin";
const OLD_ENCRYPTION_KEY = "11".repeat(32);
const ACTIVE_ENCRYPTION_KEY = "22".repeat(32);

async function setup() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  const state = await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("orgs", {
      name: "Postwork",
      slug: "postwork",
      createdAt: 1,
    });
    const adminId = await ctx.db.insert("users", {
      orgId,
      name: "Admin",
      title: "Admin",
      avatarColor: "#8c1862",
      initials: "AD",
      role: "admin",
      status: "active",
      tokenIdentifier: ADMIN_TOKEN,
      subject: "connector-admin",
    });
    const postId = await ctx.db.insert("posts", {
      orgId,
      authorId: adminId,
      title: "Investigate the regression",
      body: "The release regressed the account mapping flow.",
      space: "Engineering",
      priority: "high",
      pinned: false,
      createdAt: 2,
      lastActivityAt: 2,
      replyCount: 0,
      participantIds: [adminId],
    });
    return { orgId, adminId, postId };
  });
  const authed = t.withIdentity({
    tokenIdentifier: ADMIN_TOKEN,
    subject: "connector-admin",
    issuer: "https://issuer.example",
  });
  return { t, authed, ...state };
}

describe("connector secret key rotation", () => {
  test("decrypts ciphertext with active and bounded previous keys", async () => {
    const oldKeyring = connectorSecretKeyring({
      CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY_ID: "2026-06",
      CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY: OLD_ENCRYPTION_KEY,
    });
    const rotatedKeyring = connectorSecretKeyring({
      CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY_ID: "2026-07",
      CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY: ACTIVE_ENCRYPTION_KEY,
      CONNECTOR_SECRET_ENCRYPTION_PREVIOUS_KEYS: JSON.stringify({
        "2026-06": OLD_ENCRYPTION_KEY,
      }),
    });
    const oldCiphertext = await encryptConnectorSecret("old-secret", oldKeyring);
    const activeCiphertext = await encryptConnectorSecret("active-secret", rotatedKeyring);

    await expect(decryptConnectorSecret(oldCiphertext, rotatedKeyring)).resolves.toEqual({
      secret: "old-secret",
      keyId: "2026-06",
    });
    await expect(decryptConnectorSecret(activeCiphertext, rotatedKeyring)).resolves.toEqual({
      secret: "active-secret",
      keyId: "2026-07",
    });
  });

  test("fails closed when ciphertext references an unknown key", async () => {
    const oldCiphertext = await encryptConnectorSecret(
      "old-secret",
      connectorSecretKeyring({
        CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY_ID: "retired",
        CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY: OLD_ENCRYPTION_KEY,
      }),
    );
    const activeOnly = connectorSecretKeyring({
      CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY_ID: "active",
      CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY: ACTIVE_ENCRYPTION_KEY,
    });

    await expect(decryptConnectorSecret(oldCiphertext, activeOnly)).rejects.toThrow(
      "unavailable",
    );
  });
});

describe("connector agent task boundary", () => {
  test("schedules the simulator only for agents without a connected runner", async () => {
    const state = await setup();
    const unconnectedAgentId = await state.t.run(async (ctx) =>
      ctx.db.insert("users", {
        orgId: state.orgId,
        name: "Demo Agent",
        title: "Coding Agent",
        avatarColor: "#5f6f8f",
        initials: "DA",
        role: "member",
        status: "active",
        isAgent: true,
      })
    );
    const connected = await state.t.mutation(internal.connectors.provisionRecord, {
      adminTokenIdentifier: ADMIN_TOKEN,
      name: "Connected Agent",
      slug: "connected-agent",
      capability: "agentTasks",
      authStrategy: "bearer",
      credentialId: "credential-fallback",
      secretHash: "secret-fallback",
    });

    const demoTaskId = await state.authed.mutation(api.agentTasks.create, {
      postId: state.postId,
      agentId: unconnectedAgentId,
      prompt: "Use the simulator.",
    });
    const connectedTaskId = await state.authed.mutation(api.agentTasks.create, {
      postId: state.postId,
      agentId: connected.agentId,
      prompt: "Wait for the connector.",
    });
    const scheduled = await state.t.run(async (ctx) =>
      ctx.db.system.query("_scheduled_functions").take(10)
    );
    const tasks = await state.t.run(async (ctx) => ({
      demo: await ctx.db.get(demoTaskId),
      connected: await ctx.db.get(connectedTaskId),
    }));

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.name).toBe("agentTasks:runSimulated");
    expect(scheduled[0]?.args).toEqual([{ taskId: demoTaskId }]);
    expect(tasks.demo?.connectorId).toBeUndefined();
    expect(tasks.connected).toMatchObject({
      connectorId: connected.connectorId,
      status: "queued",
    });
  });

  test("returns a bearer secret once and stores only its digest", async () => {
    const state = await setup();
    const provisioned = await state.authed.action(api.connectors.provision, {
      name: "External Runner",
      slug: "external-runner",
      capability: "agentTasks",
      authStrategy: "bearer",
    });

    expect(provisioned.token).toMatch(/^pwc\.[a-f0-9]{16}\.[a-f0-9]{64}$/);
    const credential = parseConnectorToken(`Bearer ${provisioned.token}`);
    expect(credential).not.toBeNull();
    const stored = await state.t.run(async (ctx) =>
      ctx.db.get(provisioned.connectorId),
    );
    expect(stored?.credentialId).toBe(credential?.credentialId);
    expect(stored?.secretHash).toBe(
      await hashConnectorSecret(credential?.secret ?? ""),
    );
    expect(JSON.stringify(stored)).not.toContain(credential?.secret);
  });

  test("maps a connector to an agent and atomically turns its result into one reply", async () => {
    const state = await setup();
    const provisioned = await state.t.mutation(internal.connectors.provisionRecord, {
      adminTokenIdentifier: ADMIN_TOKEN,
      name: "Codex Runner",
      slug: "codex-runner",
      capability: "agentTasks",
      authStrategy: "bearer",
      credentialId: "credential-a",
      secretHash: "secret-hash-a",
    });
    const taskId = await state.authed.mutation(api.agentTasks.create, {
      postId: state.postId,
      agentId: provisioned.agentId,
      prompt: "Find the faulty change.",
    });

    const claim = await state.t.mutation(internal.connectors.claimAgentTask, {
      credentialId: "credential-a",
      secretHash: "secret-hash-a",
      taskId,
      externalRunId: "run-123",
    });
    expect(claim).toMatchObject({
      taskId,
      prompt: "Find the faulty change.",
      agent: { id: provisioned.agentId, name: "Codex Runner" },
    });

    const first = await state.t.mutation(internal.connectors.finishAgentTask, {
      credentialId: "credential-a",
      secretHash: "secret-hash-a",
      taskId,
      externalRunId: "run-123",
      outcome: { status: "done", body: "The serializer dropped the account ID." },
    });
    const retry = await state.t.mutation(internal.connectors.finishAgentTask, {
      credentialId: "credential-a",
      secretHash: "secret-hash-a",
      taskId,
      externalRunId: "run-123",
      outcome: { status: "done", body: "This retry must not create another reply." },
    });

    const stored = await state.t.run(async (ctx) => ({
      connector: await ctx.db.get(provisioned.connectorId),
      agent: await ctx.db.get(provisioned.agentId),
      task: await ctx.db.get(taskId),
      replies: await ctx.db
        .query("replies")
        .withIndex("by_org_id_and_post_id_and_created_at", (q) =>
          q.eq("orgId", state.orgId).eq("postId", state.postId),
        )
        .collect(),
      audit: await ctx.db
        .query("auditLog")
        .withIndex("by_org_id_and_created_at", (q) => q.eq("orgId", state.orgId))
        .collect(),
    }));
    expect(stored.connector?.agentId).toBe(provisioned.agentId);
    expect(stored.agent).toMatchObject({ isAgent: true, status: "active" });
    expect(stored.task).toMatchObject({
      connectorId: provisioned.connectorId,
      status: "done",
      externalRunId: "run-123",
      resultReplyId: first.replyId,
    });
    expect(retry).toEqual(first);
    expect(stored.replies).toHaveLength(1);
    expect(stored.replies[0]).toMatchObject({
      authorId: provisioned.agentId,
      body: "The serializer dropped the account ID.",
    });
    expect(stored.audit.map((entry) => entry.action)).toEqual([
      "connector.provisioned",
      "connector.agent_task.queued",
      "connector.agent_task.claimed",
      "connector.agent_task.completed",
    ]);
  });

  test("derives tenant and agent authority from the credential", async () => {
    const state = await setup();
    const first = await state.t.mutation(internal.connectors.provisionRecord, {
      adminTokenIdentifier: ADMIN_TOKEN,
      name: "First Runner",
      slug: "first-runner",
      capability: "agentTasks",
      authStrategy: "bearer",
      credentialId: "credential-first",
      secretHash: "secret-first",
    });
    const second = await state.t.mutation(internal.connectors.provisionRecord, {
      adminTokenIdentifier: ADMIN_TOKEN,
      name: "Second Runner",
      slug: "second-runner",
      capability: "agentTasks",
      authStrategy: "bearer",
      credentialId: "credential-second",
      secretHash: "secret-second",
    });
    const taskId = await state.authed.mutation(api.agentTasks.create, {
      postId: state.postId,
      agentId: second.agentId,
      prompt: "Run this task.",
    });
    const foreignTaskId = await state.t.run(async (ctx) => {
      const foreignOrgId = await ctx.db.insert("orgs", {
        name: "Foreign org",
        slug: "foreign-org",
        createdAt: 10,
      });
      const foreignAgentId = await ctx.db.insert("users", {
        orgId: foreignOrgId,
        name: "Foreign Runner",
        title: "Coding Agent",
        avatarColor: "#5f6f8f",
        initials: "FR",
        isAgent: true,
      });
      const foreignConnectorId = await ctx.db.insert("connectors", {
        orgId: foreignOrgId,
        name: "Foreign Runner",
        slug: "foreign-runner",
        capability: "agentTasks",
        authStrategy: "bearer",
        agentId: foreignAgentId,
        credentialId: "foreign-credential",
        secretHash: "foreign-secret",
        createdById: foreignAgentId,
        createdAt: 11,
        updatedAt: 11,
      });
      const foreignPostId = await ctx.db.insert("posts", {
        orgId: foreignOrgId,
        authorId: foreignAgentId,
        title: "Foreign post",
        body: "Foreign body",
        space: "Engineering",
        priority: "normal",
        pinned: false,
        createdAt: 12,
        lastActivityAt: 12,
        replyCount: 0,
        participantIds: [foreignAgentId],
      });
      return await ctx.db.insert("agentTasks", {
        orgId: foreignOrgId,
        postId: foreignPostId,
        agentId: foreignAgentId,
        requestedById: foreignAgentId,
        status: "queued",
        prompt: "Foreign task",
        connectorId: foreignConnectorId,
        createdAt: 13,
        updatedAt: 13,
      });
    });

    await expect(
      state.t.mutation(internal.connectors.claimAgentTask, {
        credentialId: "credential-first",
        secretHash: "secret-first",
        taskId,
        externalRunId: "wrong-runner",
      }),
    ).rejects.toThrow("Task not found.");
    await expect(
      state.t.mutation(internal.connectors.claimAgentTask, {
        credentialId: "credential-second",
        secretHash: "wrong-secret",
        taskId,
        externalRunId: "wrong-secret",
      }),
    ).rejects.toThrow("Connector authentication failed.");
    await expect(
      state.t.mutation(internal.connectors.claimAgentTask, {
        credentialId: "credential-first",
        secretHash: "secret-first",
        taskId: foreignTaskId,
        externalRunId: "cross-tenant",
      }),
    ).rejects.toThrow("Task not found.");
    expect(first.agentId).not.toBe(second.agentId);
  });

  test("rejects claims when the mapped agent was directly deactivated", async () => {
    const state = await setup();
    const provisioned = await state.t.mutation(internal.connectors.provisionRecord, {
      adminTokenIdentifier: ADMIN_TOKEN,
      name: "Deactivated Claim Runner",
      slug: "deactivated-claim-runner",
      capability: "agentTasks",
      authStrategy: "bearer",
      credentialId: "credential-deactivated-claim",
      secretHash: "secret-deactivated-claim",
    });
    const taskId = await state.authed.mutation(api.agentTasks.create, {
      postId: state.postId,
      agentId: provisioned.agentId,
      prompt: "This claim must be blocked.",
    });
    await state.t.run(async (ctx) => {
      await ctx.db.patch(provisioned.agentId, { deactivatedAt: 100 });
    });

    await expect(
      state.t.mutation(internal.connectors.claimAgentTask, {
        credentialId: "credential-deactivated-claim",
        secretHash: "secret-deactivated-claim",
        taskId,
        externalRunId: "blocked-claim",
      }),
    ).rejects.toThrow("Connector authentication failed.");
  });

  test("rejects results when the mapped agent was directly deactivated", async () => {
    const state = await setup();
    const provisioned = await state.t.mutation(internal.connectors.provisionRecord, {
      adminTokenIdentifier: ADMIN_TOKEN,
      name: "Deactivated Result Runner",
      slug: "deactivated-result-runner",
      capability: "agentTasks",
      authStrategy: "bearer",
      credentialId: "credential-deactivated-result",
      secretHash: "secret-deactivated-result",
    });
    const taskId = await state.authed.mutation(api.agentTasks.create, {
      postId: state.postId,
      agentId: provisioned.agentId,
      prompt: "This result must be blocked.",
    });
    await state.t.mutation(internal.connectors.claimAgentTask, {
      credentialId: "credential-deactivated-result",
      secretHash: "secret-deactivated-result",
      taskId,
      externalRunId: "blocked-result",
    });
    await state.t.run(async (ctx) => {
      await ctx.db.patch(provisioned.agentId, { deactivatedAt: 100 });
    });

    await expect(
      state.t.mutation(internal.connectors.finishAgentTask, {
        credentialId: "credential-deactivated-result",
        secretHash: "secret-deactivated-result",
        taskId,
        externalRunId: "blocked-result",
        outcome: { status: "done", body: "This must not be posted." },
      }),
    ).rejects.toThrow("Connector authentication failed.");
  });

  test("normalizes external run ID whitespace for claim and result", async () => {
    const state = await setup();
    const provisioned = await state.t.mutation(internal.connectors.provisionRecord, {
      adminTokenIdentifier: ADMIN_TOKEN,
      name: "Whitespace Runner",
      slug: "whitespace-runner",
      capability: "agentTasks",
      authStrategy: "bearer",
      credentialId: "credential-whitespace",
      secretHash: "secret-whitespace",
    });
    const taskId = await state.authed.mutation(api.agentTasks.create, {
      postId: state.postId,
      agentId: provisioned.agentId,
      prompt: "Normalize this run ID.",
    });

    await state.t.mutation(internal.connectors.claimAgentTask, {
      credentialId: "credential-whitespace",
      secretHash: "secret-whitespace",
      taskId,
      externalRunId: "  run-with-whitespace\n",
    });
    await expect(
      state.t.mutation(internal.connectors.finishAgentTask, {
        credentialId: "credential-whitespace",
        secretHash: "secret-whitespace",
        taskId,
        externalRunId: "\trun-with-whitespace  ",
        outcome: { status: "failed", error: "Expected test failure." },
      }),
    ).resolves.toEqual({ status: "failed" });

    const task = await state.t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.externalRunId).toBe("run-with-whitespace");
  });

  test("normalizes overlength external run IDs for claim and result", async () => {
    const state = await setup();
    const provisioned = await state.t.mutation(internal.connectors.provisionRecord, {
      adminTokenIdentifier: ADMIN_TOKEN,
      name: "Long ID Runner",
      slug: "long-id-runner",
      capability: "agentTasks",
      authStrategy: "bearer",
      credentialId: "credential-long-id",
      secretHash: "secret-long-id",
    });
    const taskId = await state.authed.mutation(api.agentTasks.create, {
      postId: state.postId,
      agentId: provisioned.agentId,
      prompt: "Normalize this long run ID.",
    });
    const externalRunId = "r".repeat(240);

    await state.t.mutation(internal.connectors.claimAgentTask, {
      credentialId: "credential-long-id",
      secretHash: "secret-long-id",
      taskId,
      externalRunId,
    });
    await expect(
      state.t.mutation(internal.connectors.finishAgentTask, {
        credentialId: "credential-long-id",
        secretHash: "secret-long-id",
        taskId,
        externalRunId,
        outcome: { status: "failed", error: "Expected test failure." },
      }),
    ).resolves.toEqual({ status: "failed" });

    const task = await state.t.run(async (ctx) => ctx.db.get(taskId));
    expect(task?.externalRunId).toBe("r".repeat(200));
  });
});

describe("inbound connector boundary", () => {
  test("deduplicates provider-authenticated event receipts without storing payloads", async () => {
    const state = await setup();
    const connector = await state.t.mutation(internal.connectors.provisionRecord, {
      adminTokenIdentifier: ADMIN_TOKEN,
      name: "GitHub",
      slug: "github",
      capability: "inboundEvents",
      authStrategy: "providerSignature",
      secretHash: "github-secret-hash",
      encryptedSecret: "v1.test.iv.encrypted",
    });

    const first = await state.t.mutation(internal.connectors.recordInboundEvent, {
      connectorId: connector.connectorId,
      externalEventId: "delivery-42",
      eventType: "issues.opened",
    });
    const retry = await state.t.mutation(internal.connectors.recordInboundEvent, {
      connectorId: connector.connectorId,
      externalEventId: "delivery-42",
      eventType: "issues.opened",
    });

    expect(first.duplicate).toBe(false);
    expect(retry).toEqual({ eventId: first.eventId, duplicate: true });
    const events = await state.t.run(async (ctx) => ctx.db.query("connectorEvents").collect());
    expect(events).toEqual([
      expect.objectContaining({
        orgId: state.orgId,
        connectorId: connector.connectorId,
        externalEventId: "delivery-42",
        eventType: "issues.opened",
      }),
    ]);
  });
});

describe("x cross-posting", () => {
  async function xConnector(state: Awaited<ReturnType<typeof setup>>) {
    return await state.t.mutation(internal.connectors.provisionRecord, {
      adminTokenIdentifier: ADMIN_TOKEN,
      name: "X Pulse",
      slug: "x",
      capability: "inboundEvents",
      authStrategy: "bearer",
      credentialId: "x-credential",
      secretHash: await hashConnectorSecret("x-secret"),
    });
  }

  test("configures X sync and provisions its connector agent when missing", async () => {
    const state = await setup();

    const result = await state.authed.mutation(api.connectors.setXSyncHandle, {
      handle: "  @Pronsh  ",
    });

    expect(result).toEqual({
      configured: true,
      handle: "pronsh",
      agentName: "X Pulse",
    });
    await expect(state.authed.query(api.connectors.xSyncStatus, {})).resolves.toEqual(result);
    const stored = await state.t.run(async (ctx) => {
      const connector = await ctx.db
        .query("connectors")
        .withIndex("by_org_id_and_slug", (q) =>
          q.eq("orgId", state.orgId).eq("slug", "x"),
        )
        .unique();
      return {
        connector,
        agent: connector ? await ctx.db.get(connector.agentId) : null,
      };
    });
    expect(stored.connector).toMatchObject({
      xSyncHandle: "pronsh",
      capability: "inboundEvents",
      authStrategy: "bearer",
      createdById: state.adminId,
    });
    expect(stored.connector?.credentialId).toMatch(/^x-[a-f0-9]{16}$/);
    expect(stored.agent).toMatchObject({
      orgId: state.orgId,
      name: "X Pulse",
      title: "Connector Agent",
      initials: "XP",
      isAgent: true,
    });
  });

  test("rejects an invalid X sync handle", async () => {
    const state = await setup();
    await expect(
      state.authed.mutation(api.connectors.setXSyncHandle, {
        handle: "not-a-handle",
      }),
    ).rejects.toThrow("X handle must be 1–15 letters, numbers, or underscores.");
  });

  test("clears the configured X sync handle", async () => {
    const state = await setup();
    await state.authed.mutation(api.connectors.setXSyncHandle, { handle: "pronsh" });

    await expect(
      state.authed.mutation(api.connectors.setXSyncHandle, { handle: null }),
    ).resolves.toEqual({ configured: false, handle: null, agentName: "X Pulse" });
    const connector = await state.t.run(async (ctx) =>
      ctx.db
        .query("connectors")
        .withIndex("by_org_id_and_slug", (q) =>
          q.eq("orgId", state.orgId).eq("slug", "x"),
        )
        .unique(),
    );
    expect(connector?.xSyncHandle).toBeUndefined();
  });

  test("rejects X sync configuration by non-admins", async () => {
    const state = await setup();
    const memberToken = "https://issuer.example|connector-member";
    await state.t.run(async (ctx) => {
      await ctx.db.insert("users", {
        orgId: state.orgId,
        name: "Member",
        title: "Member",
        avatarColor: "#555555",
        initials: "ME",
        role: "member",
        status: "active",
        tokenIdentifier: memberToken,
      });
    });
    const member = state.t.withIdentity({
      tokenIdentifier: memberToken,
      subject: "connector-member",
      issuer: "https://issuer.example",
    });

    await expect(
      member.mutation(api.connectors.setXSyncHandle, { handle: "pronsh" }),
    ).rejects.toThrow("Admins only.");
  });

  test("mirrors a tweet as a post by the connector agent and dedupes on tweet id", async () => {
    const state = await setup();
    const connector = await xConnector(state);

    const first = await state.t.mutation(internal.connectors.recordXCrossPostFromSync, {
      connectorId: connector.connectorId,
      tweet: {
        id: "2080000000000000001",
        handle: "pronsh",
        text: "wrec 3.0 is live. threads, agents, the lot.",
        url: "https://x.com/pronsh/status/2080000000000000001",
      },
    });
    expect(first.duplicate).toBe(false);
    const post = await state.t.run(async (ctx) => ctx.db.get(first.postId!));
    expect(post).toMatchObject({
      orgId: state.orgId,
      authorId: connector.agentId,
      space: "Growth",
      title: "@pronsh on x: wrec 3.0 is live. threads, agents, the lot.",
    });
    expect(post?.body).toContain("Cross-posted from https://x.com/pronsh/status/2080000000000000001");

    const retry = await state.t.mutation(internal.connectors.recordXCrossPostFromSync, {
      connectorId: connector.connectorId,
      tweet: {
        id: "2080000000000000001",
        handle: "pronsh",
        text: "wrec 3.0 is live. threads, agents, the lot.",
      },
    });
    expect(retry).toEqual({ eventId: first.eventId, duplicate: true, postId: first.postId });
    const posts = await state.t.run(async (ctx) =>
      ctx.db
        .query("posts")
        .collect()
        .then((rows) => rows.filter((row) => row.authorId === connector.agentId)),
    );
    expect(posts).toHaveLength(1);
  });

  test("rejects a revoked connector", async () => {
    const state = await setup();
    const connector = await xConnector(state);
    await state.t.run(async (ctx) => {
      await ctx.db.patch(connector.connectorId, { revokedAt: 100 });
    });
    await expect(
      state.t.mutation(internal.connectors.recordXCrossPostFromSync, {
        connectorId: connector.connectorId,
        tweet: { id: "1", handle: "pronsh", text: "hello" },
      }),
    ).rejects.toThrow("Inbound connector is unavailable.");
  });
});
