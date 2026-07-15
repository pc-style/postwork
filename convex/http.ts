import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { hashConnectorSecret, parseConnectorToken } from "./connectors";

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
