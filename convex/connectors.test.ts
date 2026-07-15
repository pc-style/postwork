/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { hashConnectorSecret, parseConnectorToken } from "./connectors";

const modules = import.meta.glob("./**/*.ts");
const ADMIN_TOKEN = "https://issuer.example|connector-admin";

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

describe("connector agent task boundary", () => {
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
      encryptedSecret: "v1.test.encrypted",
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
