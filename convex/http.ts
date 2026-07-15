import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { hashConnectorSecret, parseConnectorToken } from "./connectors";
import { decryptConnectorSecret } from "./lib/connectorSecrets";
import {
  GITHUB_WEBHOOK_MAX_BYTES,
  githubExternalEventId,
  routeGitHubEvent,
  verifyGitHubSignature,
} from "./lib/githubWebhooks";

const http = httpRouter();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function objectBody(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

http.route({
  path: "/api/connectors/github",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const connectorId = new URL(request.url).searchParams.get("connector")?.trim();
    const deliveryId = request.headers.get("x-github-delivery");
    const event = request.headers.get("x-github-event")?.trim();
    const externalEventId = deliveryId ? githubExternalEventId(deliveryId) : null;
    if (!connectorId || !event || !externalEventId) {
      return json({ error: "invalid_headers" }, 400);
    }

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > GITHUB_WEBHOOK_MAX_BYTES) {
      return json({ error: "payload_too_large" }, 413);
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > GITHUB_WEBHOOK_MAX_BYTES) {
      return json({ error: "payload_too_large" }, 413);
    }

    let material: { encryptedSecret: string };
    try {
      material = await ctx.runQuery(internal.connectors.getInboundSignatureMaterial, {
        connectorId: connectorId as Id<"connectors">,
      });
    } catch {
      return json({ error: "unauthorized" }, 401);
    }

    let secret: string;
    try {
      secret = await decryptConnectorSecret(
        material.encryptedSecret,
        env.CONNECTOR_SECRET_ENCRYPTION_KEY ?? "",
      );
    } catch {
      return json({ error: "connector_unavailable" }, 503);
    }
    if (!(await verifyGitHubSignature(
      bytes,
      request.headers.get("x-hub-signature-256"),
      secret,
    ))) {
      return json({ error: "invalid_signature" }, 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const route = routeGitHubEvent(event, payload);
    if (!route) return json({ error: "unsupported_event" }, 422);

    try {
      const receipt = await ctx.runMutation(internal.connectors.recordInboundEvent, {
        connectorId: connectorId as Id<"connectors">,
        externalEventId,
        eventType: route.eventType,
        lifecycle: route.lifecycle,
      });
      return json(receipt, receipt.duplicate ? 200 : 202);
    } catch {
      return json({ error: "event_rejected" }, 409);
    }
  }),
});

http.route({
  path: "/api/connectors/agent-tasks/claim",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const credential = parseConnectorToken(request.headers.get("authorization"));
    if (!credential) return json({ error: "unauthorized" }, 401);
    const body = objectBody(await request.json().catch(() => null));
    if (
      !body ||
      typeof body.taskId !== "string" ||
      typeof body.externalRunId !== "string"
    ) {
      return json({ error: "invalid_request" }, 400);
    }
    try {
      const task = await ctx.runMutation(internal.connectors.claimAgentTask, {
        credentialId: credential.credentialId,
        secretHash: await hashConnectorSecret(credential.secret),
        taskId: body.taskId as Id<"agentTasks">,
        externalRunId: body.externalRunId,
      });
      return json(task);
    } catch {
      return json({ error: "claim_rejected" }, 409);
    }
  }),
});

http.route({
  path: "/api/connectors/agent-tasks/result",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const credential = parseConnectorToken(request.headers.get("authorization"));
    if (!credential) return json({ error: "unauthorized" }, 401);
    const body = objectBody(await request.json().catch(() => null));
    if (
      !body ||
      typeof body.taskId !== "string" ||
      typeof body.externalRunId !== "string" ||
      (body.status !== "done" && body.status !== "failed")
    ) {
      return json({ error: "invalid_request" }, 400);
    }
    const outcome = body.status === "done"
      ? typeof body.body === "string"
        ? {
            status: "done" as const,
            body: body.body,
            model: typeof body.model === "string" ? body.model : undefined,
          }
        : null
      : typeof body.error === "string"
        ? { status: "failed" as const, error: body.error }
        : null;
    if (!outcome) return json({ error: "invalid_request" }, 400);
    try {
      const result = await ctx.runMutation(internal.connectors.finishAgentTask, {
        credentialId: credential.credentialId,
        secretHash: await hashConnectorSecret(credential.secret),
        taskId: body.taskId as Id<"agentTasks">,
        externalRunId: body.externalRunId,
        outcome,
      });
      return json(result);
    } catch {
      return json({ error: "result_rejected" }, 409);
    }
  }),
});

export default http;
