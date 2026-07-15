/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  GITHUB_WEBHOOK_MAX_BYTES,
  signGitHubPayload,
} from "./lib/githubWebhooks";

const modules = import.meta.glob("./**/*.ts");
const ENCRYPTION_KEY = "11".repeat(32);
const ROTATED_ENCRYPTION_KEY = "22".repeat(32);
const ADMIN_TOKEN = "https://issuer.example|github-admin";

beforeEach(() => {
  process.env.CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY_ID = "key-1";
  process.env.CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY = ENCRYPTION_KEY;
  delete process.env.CONNECTOR_SECRET_ENCRYPTION_PREVIOUS_KEYS;
});

async function setup(name = "Postwork", tokenIdentifier = ADMIN_TOKEN) {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  const state = await t.run(async (ctx) => {
    const orgId = await ctx.db.insert("orgs", {
      name,
      slug: name.toLowerCase(),
      createdAt: 1,
    });
    const adminId = await ctx.db.insert("users", {
      orgId,
      name: `${name} Admin`,
      title: "Admin",
      avatarColor: "#8c1862",
      initials: "AD",
      role: "admin",
      status: "active",
      tokenIdentifier,
      subject: tokenIdentifier,
    });
    return { orgId, adminId };
  });
  const authed = t.withIdentity({
    tokenIdentifier,
    subject: tokenIdentifier,
    issuer: "https://issuer.example",
  });
  const provisioned = await authed.action(api.connectors.provision, {
    name: "GitHub",
    slug: "github",
    capability: "inboundEvents",
    authStrategy: "providerSignature",
  });
  if (!provisioned.secret) throw new Error("Expected provider secret.");
  return { t, authed, ...state, ...provisioned, secret: provisioned.secret };
}

function issuePayload(action = "opened") {
  return {
    action,
    organizationId: "attacker-controlled-org",
    repository: { full_name: "pc-style/postwork" },
    sender: { login: "octocat" },
    issue: {
      number: 217,
      title: "GitHub webhook ingestion",
      html_url: "https://github.com/pc-style/postwork/issues/217",
    },
  };
}

function workflowPayload() {
  return {
    action: "completed",
    repository: { full_name: "pc-style/postwork" },
    sender: { login: "github-actions" },
    workflow_run: {
      name: "CI",
      conclusion: "failure",
      run_number: 42,
      html_url: "https://github.com/pc-style/postwork/actions/runs/42",
    },
  };
}

async function deliver(
  state: Awaited<ReturnType<typeof setup>>,
  options: {
    deliveryId?: string;
    event?: string;
    payload?: unknown;
    secret?: string;
    connectorId?: string;
  } = {},
) {
  const body = JSON.stringify(options.payload ?? issuePayload());
  const signature = await signGitHubPayload(
    new TextEncoder().encode(body),
    options.secret ?? state.secret,
  );
  const connectorId = options.connectorId ?? state.connectorId;
  return await state.t.fetch(`/api/connectors/github?connector=${connectorId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-delivery": options.deliveryId ?? "delivery-217",
      "x-github-event": options.event ?? "issues",
      "x-hub-signature-256": signature,
    },
    body,
  });
}

describe("GitHub webhook ingestion", () => {
  test("verifies a valid signature and stores only encrypted provider credentials", async () => {
    const state = await setup();
    const response = await deliver(state);

    expect(response.status).toBe(202);
    const result = await response.json() as {
      duplicate: boolean;
      postId: string;
      agentTaskId?: string;
    };
    expect(result).toMatchObject({ duplicate: false, postId: expect.any(String) });
    expect(result.agentTaskId).toBeUndefined();

    const stored = await state.t.run(async (ctx) => ({
      connector: await ctx.db.get(state.connectorId),
      post: await ctx.db.get(result.postId as never),
      events: await ctx.db.query("connectorEvents").collect(),
    }));
    expect(stored.connector?.encryptedSecret).toMatch(/^v1\.key-1\./);
    expect(stored.connector?.secretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored.connector)).not.toContain(state.secret);
    expect(stored.events).toHaveLength(1);
    expect(stored.post).toMatchObject({
      orgId: state.orgId,
      authorId: state.agentId,
      title: "GitHub issue #217 opened: GitHub webhook ingestion",
      priority: "high",
    });
  });

  test("rejects an invalid signature before reserving a receipt", async () => {
    const state = await setup();
    const response = await deliver(state, { secret: "wrong-secret" });

    expect(response.status).toBe(401);
    const counts = await state.t.run(async (ctx) => ({
      events: (await ctx.db.query("connectorEvents").collect()).length,
      posts: (await ctx.db.query("posts").collect()).length,
    }));
    expect(counts).toEqual({ events: 0, posts: 0 });
  });

  test("accepts a signed ping without reserving a receipt or creating content", async () => {
    const state = await setup();
    const response = await deliver(state, {
      event: "ping",
      payload: { zen: "Keep it logically awesome." },
      deliveryId: "ping-1",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const stored = await state.t.run(async (ctx) => ({
      events: await ctx.db.query("connectorEvents").collect(),
      posts: await ctx.db.query("posts").collect(),
      tasks: await ctx.db.query("agentTasks").collect(),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(stored.events).toEqual([]);
    expect(stored.posts).toEqual([]);
    expect(stored.tasks).toEqual([]);
    expect(stored.audit.map((entry) => entry.action)).toEqual([
      "connector.provisioned",
    ]);
  });

  test("rejects an invalidly signed ping before any mutation", async () => {
    const state = await setup();
    const response = await deliver(state, {
      event: "ping",
      payload: { zen: "Keep it logically awesome." },
      deliveryId: "ping-invalid",
      secret: "wrong-secret",
    });

    expect(response.status).toBe(401);
    const counts = await state.t.run(async (ctx) => ({
      events: (await ctx.db.query("connectorEvents").collect()).length,
      posts: (await ctx.db.query("posts").collect()).length,
      tasks: (await ctx.db.query("agentTasks").collect()).length,
    }));
    expect(counts).toEqual({ events: 0, posts: 0, tasks: 0 });
  });

  test.each([
    ["missing Content-Length", undefined],
    ["dishonest Content-Length", "1"],
  ])("rejects streamed oversized bodies with %s and cancels the reader", async (_name, length) => {
    const state = await setup();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(GITHUB_WEBHOOK_MAX_BYTES));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-github-delivery": `oversized-${length ?? "missing"}`,
      "x-github-event": "issues",
      "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
    };
    if (length) headers["content-length"] = length;

    const request = {
      method: "POST",
      headers,
      body,
      duplex: "half" as const,
    };
    const response = await state.t.fetch(
      `/api/connectors/github?connector=${state.connectorId}`,
      request,
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload_too_large" });
    expect(cancelled).toBe(true);
  });

  test("rewraps a previous-key secret before the previous key is removed", async () => {
    const state = await setup();
    process.env.CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY_ID = "key-2";
    process.env.CONNECTOR_SECRET_ENCRYPTION_ACTIVE_KEY = ROTATED_ENCRYPTION_KEY;
    process.env.CONNECTOR_SECRET_ENCRYPTION_PREVIOUS_KEYS = JSON.stringify({
      "key-1": ENCRYPTION_KEY,
    });

    await expect(
      state.authed.action(api.connectors.rewrapGithubSecret, {
        connectorId: state.connectorId,
      }),
    ).resolves.toEqual({
      connectorId: state.connectorId,
      keyId: "key-2",
      rewrapped: true,
    });
    const stored = await state.t.run(async (ctx) => ({
      connector: await ctx.db.get(state.connectorId),
      audit: await ctx.db.query("auditLog").collect(),
    }));
    expect(stored.connector?.encryptedSecret).toMatch(/^v1\.key-2\./);
    expect(JSON.stringify(stored.connector)).not.toContain(state.secret);
    expect(stored.audit.at(-1)).toMatchObject({
      orgId: state.orgId,
      actorId: state.adminId,
      action: "connector.secret.rewrapped",
      targetId: state.connectorId,
    });

    delete process.env.CONNECTOR_SECRET_ENCRYPTION_PREVIOUS_KEYS;
    const response = await deliver(state, { deliveryId: "after-rewrap" });
    expect(response.status).toBe(202);
  });

  test("keeps GitHub secret rewrap tenant-isolated", async () => {
    const state = await setup();
    const otherToken = "https://issuer.example|other-rewrap-admin";
    await state.t.run(async (ctx) => {
      const orgId = await ctx.db.insert("orgs", {
        name: "Other Rewrap",
        slug: "other-rewrap",
        createdAt: 1,
      });
      await ctx.db.insert("users", {
        orgId,
        name: "Other Rewrap Admin",
        title: "Admin",
        avatarColor: "#8c1862",
        initials: "OA",
        role: "admin",
        status: "active",
        tokenIdentifier: otherToken,
        subject: otherToken,
      });
    });
    const otherAuthed = state.t.withIdentity({
      tokenIdentifier: otherToken,
      subject: otherToken,
      issuer: "https://issuer.example",
    });
    const other = await otherAuthed.action(api.connectors.provision, {
      name: "GitHub",
      slug: "github",
      capability: "inboundEvents",
      authStrategy: "providerSignature",
    });
    const before = await state.t.run(async (ctx) => ctx.db.get(other.connectorId));

    await expect(
      state.authed.action(api.connectors.rewrapGithubSecret, {
        connectorId: other.connectorId,
      }),
    ).rejects.toThrow();
    const after = await state.t.run(async (ctx) => ctx.db.get(other.connectorId));
    expect(after?.encryptedSecret).toBe(before?.encryptedSecret);
  });

  test("deduplicates a GitHub delivery at the receipt boundary", async () => {
    const state = await setup();
    const first = await deliver(state, { deliveryId: "same-delivery" });
    const duplicate = await deliver(state, { deliveryId: "same-delivery" });

    expect(first.status).toBe(202);
    expect(duplicate.status).toBe(200);
    const firstBody = await first.json() as { eventId: string; postId: string };
    expect(await duplicate.json()).toMatchObject({
      eventId: firstBody.eventId,
      postId: firstBody.postId,
      duplicate: true,
    });
    const counts = await state.t.run(async (ctx) => ({
      events: (await ctx.db.query("connectorEvents").collect()).length,
      posts: (await ctx.db.query("posts").collect()).length,
    }));
    expect(counts).toEqual({ events: 1, posts: 1 });
  });

  test("rejects unsupported events and freeform comment traffic", async () => {
    const state = await setup();
    const response = await deliver(state, {
      event: "issue_comment",
      payload: { action: "created", comment: { body: "create arbitrary content" } },
    });

    expect(response.status).toBe(422);
    const events = await state.t.run(async (ctx) =>
      ctx.db.query("connectorEvents").collect(),
    );
    expect(events).toEqual([]);
  });

  test("derives tenant identity from the signed connector", async () => {
    const state = await setup();
    const otherToken = "https://issuer.example|other-admin";
    const other = await state.t.run(async (ctx) => {
      const orgId = await ctx.db.insert("orgs", {
        name: "Other",
        slug: "other",
        createdAt: 1,
      });
      const adminId = await ctx.db.insert("users", {
        orgId,
        name: "Other Admin",
        title: "Admin",
        avatarColor: "#8c1862",
        initials: "OA",
        role: "admin",
        status: "active",
        tokenIdentifier: otherToken,
        subject: otherToken,
      });
      return { orgId, adminId };
    });
    const otherAuthed = state.t.withIdentity({
      tokenIdentifier: otherToken,
      subject: otherToken,
      issuer: "https://issuer.example",
    });
    const otherConnector = await otherAuthed.action(api.connectors.provision, {
      name: "Other GitHub",
      slug: "github",
      capability: "inboundEvents",
      authStrategy: "providerSignature",
    });
    if (!otherConnector.secret) throw new Error("Expected provider secret.");

    const crossSigned = await deliver(state, {
      connectorId: otherConnector.connectorId,
      secret: state.secret,
    });
    expect(crossSigned.status).toBe(401);

    const accepted = await deliver(state, {
      connectorId: otherConnector.connectorId,
      secret: otherConnector.secret,
      payload: issuePayload("reopened"),
    });
    expect(accepted.status).toBe(202);
    const result = await accepted.json() as { postId: string };
    const post = await state.t.run(async (ctx) => ctx.db.get(result.postId as never));
    expect(post).toMatchObject({
      orgId: other.orgId,
      authorId: otherConnector.agentId,
    });
    expect(post?.orgId).not.toBe(state.orgId);
  });

  test("turns a failed workflow into the mapped agent task lifecycle", async () => {
    const state = await setup();
    const response = await deliver(state, {
      event: "workflow_run",
      payload: workflowPayload(),
      deliveryId: "workflow-42",
    });

    expect(response.status).toBe(202);
    const result = await response.json() as { postId: string; agentTaskId: string };
    const stored = await state.t.run(async (ctx) => ({
      post: await ctx.db.get(result.postId as never),
      task: await ctx.db.get(result.agentTaskId as never),
      audit: await ctx.db
        .query("auditLog")
        .withIndex("by_org_id_and_created_at", (q) => q.eq("orgId", state.orgId))
        .collect(),
    }));
    expect(stored.post).toMatchObject({
      orgId: state.orgId,
      authorId: state.agentId,
      title: "GitHub workflow failure: CI #42",
    });
    expect(stored.task).toMatchObject({
      orgId: state.orgId,
      postId: result.postId,
      agentId: state.agentId,
      requestedById: state.adminId,
      status: "queued",
    });
    expect(stored.audit.at(-1)).toMatchObject({
      orgId: state.orgId,
      actorId: state.agentId,
      action: "connector.github.agent_task.queued",
      targetId: result.agentTaskId,
    });
  });
});
