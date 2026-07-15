export const GITHUB_WEBHOOK_MAX_BYTES = 256 * 1024;

export type GitHubLifecycle =
  | {
      kind: "post";
      title: string;
      body: string;
      priority: "normal" | "high";
    }
  | {
      kind: "agentTask";
      title: string;
      body: string;
      prompt: string;
      priority: "high";
    };

export type GitHubEventRoute = {
  eventType: string;
  lifecycle: GitHubLifecycle;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, max);
  return normalized || null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function safeUrl(value: unknown): string | null {
  const candidate = text(value, 500);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function repositoryName(payload: Record<string, unknown>): string | null {
  return text(record(payload.repository)?.full_name, 200);
}

function senderName(payload: Record<string, unknown>): string | null {
  return text(record(payload.sender)?.login, 100);
}

function postBody(fields: {
  repository: string;
  url: string;
  actor: string;
  status: string;
}): string {
  return [
    `Repository: ${fields.repository}`,
    `Status: ${fields.status}`,
    `Actor: ${fields.actor}`,
    `GitHub: ${fields.url}`,
  ].join("\n");
}

function routeIssue(
  action: string,
  payload: Record<string, unknown>,
): GitHubEventRoute | null {
  if (!new Set(["opened", "reopened", "closed"]).has(action)) return null;
  const issue = record(payload.issue);
  const repository = repositoryName(payload);
  const actor = senderName(payload);
  const number = integer(issue?.number);
  const title = text(issue?.title, 140);
  const url = safeUrl(issue?.html_url);
  if (!issue || !repository || !actor || !number || !title || !url) return null;
  return {
    eventType: `issues.${action}`,
    lifecycle: {
      kind: "post",
      title: `GitHub issue #${number} ${action}: ${title}`.slice(0, 160),
      body: postBody({ repository, url, actor, status: action }),
      priority: action === "opened" || action === "reopened" ? "high" : "normal",
    },
  };
}

function routePullRequest(
  action: string,
  payload: Record<string, unknown>,
): GitHubEventRoute | null {
  if (!new Set(["opened", "reopened", "ready_for_review", "closed"]).has(action)) {
    return null;
  }
  const pullRequest = record(payload.pull_request);
  const repository = repositoryName(payload);
  const actor = senderName(payload);
  const number = integer(pullRequest?.number);
  const title = text(pullRequest?.title, 140);
  const url = safeUrl(pullRequest?.html_url);
  if (!pullRequest || !repository || !actor || !number || !title || !url) return null;
  const status = action === "closed" && pullRequest.merged === true ? "merged" : action;
  return {
    eventType: `pull_request.${action}`,
    lifecycle: {
      kind: "post",
      title: `GitHub PR #${number} ${status}: ${title}`.slice(0, 160),
      body: postBody({ repository, url, actor, status }),
      priority: action === "closed" ? "normal" : "high",
    },
  };
}

function routeWorkflowRun(
  action: string,
  payload: Record<string, unknown>,
): GitHubEventRoute | null {
  if (action !== "completed") return null;
  const workflow = record(payload.workflow_run);
  const repository = repositoryName(payload);
  const actor = senderName(payload);
  const name = text(workflow?.name, 140);
  const conclusion = text(workflow?.conclusion, 40);
  const url = safeUrl(workflow?.html_url);
  const runNumber = integer(workflow?.run_number);
  if (!workflow || !repository || !actor || !name || !conclusion || !url || !runNumber) {
    return null;
  }
  if (!new Set(["failure", "timed_out", "cancelled", "action_required"]).has(conclusion)) {
    return null;
  }
  const title = `GitHub workflow ${conclusion}: ${name} #${runNumber}`.slice(0, 160);
  return {
    eventType: "workflow_run.completed",
    lifecycle: {
      kind: "agentTask",
      title,
      body: postBody({ repository, url, actor, status: conclusion }),
      prompt: `Investigate the ${conclusion} GitHub workflow run ${name} #${runNumber} in ${repository}. Report likely causes and the next concrete check.`,
      priority: "high",
    },
  };
}

export function routeGitHubEvent(event: string, value: unknown): GitHubEventRoute | null {
  const payload = record(value);
  if (!payload) return null;
  const action = text(payload.action, 60);
  if (!action) return null;
  if (event === "issues") return routeIssue(action, payload);
  if (event === "pull_request") return routePullRequest(action, payload);
  if (event === "workflow_run") return routeWorkflowRun(action, payload);
  return null;
}

export function githubExternalEventId(deliveryId: string): string | null {
  const normalized = deliveryId.trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(normalized)
    ? `github:${normalized}`
    : null;
}

export async function signGitHubPayload(
  payload: Uint8Array,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, payload);
  return `sha256=${Array.from(new Uint8Array(signature), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("")}`;
}

export async function verifyGitHubSignature(
  payload: Uint8Array,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const provided = new Uint8Array(32);
  for (let index = 0; index < provided.length; index += 1) {
    provided[index] = Number.parseInt(signature.slice(7 + index * 2, 9 + index * 2), 16);
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return await crypto.subtle.verify("HMAC", key, provided, payload);
}
