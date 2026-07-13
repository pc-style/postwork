import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  env,
  internalAction,
  internalMutation,
  type ActionCtx,
} from "./_generated/server";
import { logError, logInfo, logWarn } from "./lib/observability";
import type { OutboundDeliveryCandidate } from "./notificationComposer";

const RESEND_IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1_000;
export const DELIVERY_RETRY_WINDOW_MS =
  RESEND_IDEMPOTENCY_RETENTION_MS - 60 * 60 * 1_000;
const DELIVERY_ATTEMPT_LEASE_MS = 60 * 1_000;
export const RESEND_REQUEST_TIMEOUT_MS = 10 * 1_000;

const notificationItem = v.object({
  postId: v.string(),
  title: v.string(),
  priority: v.union(
    v.literal("urgent"),
    v.literal("high"),
    v.literal("normal"),
  ),
  lastActivityAt: v.number(),
  unread: v.boolean(),
  space: v.optional(v.string()),
  url: v.optional(v.string()),
});

const outboundCandidate = v.object({
  kind: v.union(v.literal("immediate"), v.literal("digest")),
  items: v.array(notificationItem),
  omittedCount: v.number(),
});

type ResendConfig = {
  apiKey: string;
  from: string;
  appUrl: string;
};

type ResendSuccess = {
  ok: true;
  providerMessageId: string;
};

export type ResendFailure = {
  ok: false;
  statusCode: number | null;
  code: string;
  message: string;
  retryable: boolean;
};

export type ResendResult = ResendSuccess | ResendFailure;

type Fetcher = typeof fetch;

type DeliveryClaim =
  | { status: "ready" }
  | { status: "already_sent"; providerMessageId: string }
  | { status: "in_progress" }
  | { status: "blocked"; code: string; message: string };

type DispatchResult =
  | { status: "skipped_demo"; candidateCount: 0 }
  | {
      status: "provider_not_configured";
      candidateCount: number;
      missing: string[];
    }
  | {
      status: "provider_configuration_invalid";
      candidateCount: number;
      variable: "POSTWORK_APP_URL";
      error: string;
    }
  | {
      status: "provider_failed";
      candidateCount: number;
      sentCount?: number;
      retryable: boolean;
      error: string;
    }
  | {
      status: "sent";
      candidateCount: number;
      deliveries: Array<{
        kind: OutboundDeliveryCandidate["kind"];
        providerMessageId: string;
      }>;
    };

const deliveryResult = v.union(
  v.object({
    ok: v.literal(true),
    providerMessageId: v.string(),
  }),
  v.object({
    ok: v.literal(false),
    code: v.string(),
    message: v.string(),
    retryable: v.boolean(),
  }),
);

export const claimDelivery = internalMutation({
  args: {
    orgId: v.id("orgs"),
    idempotencyKey: v.string(),
    attemptId: v.string(),
  },
  handler: async (ctx, args): Promise<DeliveryClaim> => {
    const now = Date.now();
    const existing = await ctx.db
      .query("notificationDeliveries")
      .withIndex("by_org_id_and_idempotency_key", (q) =>
        q.eq("orgId", args.orgId).eq("idempotencyKey", args.idempotencyKey)
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("notificationDeliveries", {
        orgId: args.orgId,
        idempotencyKey: args.idempotencyKey,
        status: "attempt_in_flight",
        attemptId: args.attemptId,
        attemptCount: 1,
        firstAttemptAt: now,
        lastAttemptAt: now,
        retryDeadlineAt: now + DELIVERY_RETRY_WINDOW_MS,
      });
      return { status: "ready" };
    }

    if (existing.status === "sent" && existing.providerMessageId) {
      return {
        status: "already_sent",
        providerMessageId: existing.providerMessageId,
      };
    }
    if (existing.status === "permanent_failure") {
      return {
        status: "blocked",
        code: existing.errorCode ?? "permanent_failure",
        message: existing.errorMessage ?? "Delivery failed permanently.",
      };
    }
    if (now >= existing.retryDeadlineAt) {
      return {
        status: "blocked",
        code: "retry_window_expired",
        message: "The delivery retry window has expired.",
      };
    }
    if (
      existing.status === "attempt_in_flight" &&
      now - existing.lastAttemptAt < DELIVERY_ATTEMPT_LEASE_MS
    ) {
      return { status: "in_progress" };
    }

    await ctx.db.patch("notificationDeliveries", existing._id, {
      status: "attempt_in_flight",
      attemptId: args.attemptId,
      attemptCount: existing.attemptCount + 1,
      lastAttemptAt: now,
      errorCode: undefined,
      errorMessage: undefined,
    });
    return { status: "ready" };
  },
});

export const recordDeliveryResult = internalMutation({
  args: {
    orgId: v.id("orgs"),
    idempotencyKey: v.string(),
    attemptId: v.string(),
    result: deliveryResult,
  },
  handler: async (ctx, args): Promise<null> => {
    const existing = await ctx.db
      .query("notificationDeliveries")
      .withIndex("by_org_id_and_idempotency_key", (q) =>
        q.eq("orgId", args.orgId).eq("idempotencyKey", args.idempotencyKey)
      )
      .unique();
    if (!existing || existing.status === "sent") return null;

    if (args.result.ok) {
      await ctx.db.patch("notificationDeliveries", existing._id, {
        status: "sent",
        attemptId: undefined,
        providerMessageId: args.result.providerMessageId,
        sentAt: Date.now(),
        errorCode: undefined,
        errorMessage: undefined,
      });
      return null;
    }

    if (existing.attemptId !== args.attemptId) return null;
    await ctx.db.patch("notificationDeliveries", existing._id, {
      status: args.result.retryable ? "retryable_failure" : "permanent_failure",
      attemptId: undefined,
      errorCode: args.result.code,
      errorMessage: args.result.message,
    });
    return null;
  },
});

/**
 * Server-only provider boundary. Composition and preference checks happen
 * before this action. This boundary validates their output before sending.
 */
export const dispatch = internalAction({
  args: {
    orgId: v.id("orgs"),
    recipientEmail: v.string(),
    candidates: v.array(outboundCandidate),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args): Promise<DispatchResult> => {
    const plan = planProviderDispatch(args.candidates, env.DEMO !== "false", {
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM_EMAIL,
      appUrl: env.POSTWORK_APP_URL,
    });
    if (plan.status !== "ready") return plan;

    const invalidReason = validateDispatchInput(
      args.recipientEmail,
      args.idempotencyKey,
      args.candidates,
    );
    if (invalidReason) {
      logError("notification.deliveryRejected", { reason: invalidReason });
      return {
        status: "provider_failed" as const,
        candidateCount: args.candidates.length,
        retryable: false,
        error: invalidReason,
      };
    }

    const deliveries: Array<{
      kind: OutboundDeliveryCandidate["kind"];
      providerMessageId: string;
    }> = [];

    for (const candidate of args.candidates) {
      const providerIdempotencyKey = `${args.idempotencyKey}/${candidate.kind}`;
      const attemptId = crypto.randomUUID();
      const claim: DeliveryClaim = await ctx.runMutation(
        internal.notificationDelivery.claimDelivery,
        { orgId: args.orgId, idempotencyKey: providerIdempotencyKey, attemptId },
      );
      if (claim.status === "already_sent") {
        deliveries.push({
          kind: candidate.kind,
          providerMessageId: claim.providerMessageId,
        });
        continue;
      }
      if (claim.status !== "ready") {
        const retryable = claim.status === "in_progress";
        const code = retryable ? "delivery_in_progress" : claim.code;
        const error = retryable
          ? "Another delivery attempt is still in progress."
          : claim.message;
        logWarn("notification.deliveryDeferred", {
          kind: candidate.kind,
          code,
          retryable,
        });
        return {
          status: "provider_failed" as const,
          candidateCount: args.candidates.length,
          sentCount: deliveries.length,
          retryable,
          error,
        };
      }

      const result = await sendResendEmail({
        config: plan.config,
        recipientEmail: args.recipientEmail,
        candidate,
        idempotencyKey: providerIdempotencyKey,
      });
      await recordResult(
        ctx,
        args.orgId,
        providerIdempotencyKey,
        attemptId,
        result,
      );
      if (!result.ok) {
        const log = result.retryable ? logWarn : logError;
        log("notification.providerFailed", {
          provider: "resend",
          kind: candidate.kind,
          statusCode: result.statusCode,
          code: result.code,
          retryable: result.retryable,
        });
        return {
          status: "provider_failed" as const,
          candidateCount: args.candidates.length,
          sentCount: deliveries.length,
          retryable: result.retryable,
          error: result.message,
        };
      }
      deliveries.push({
        kind: candidate.kind,
        providerMessageId: result.providerMessageId,
      });
    }

    logInfo("notification.providerSent", {
      provider: "resend",
      candidateCount: deliveries.length,
    });
    return {
      status: "sent" as const,
      candidateCount: args.candidates.length,
      deliveries,
    };
  },
});

export function planProviderDispatch(
  candidates: readonly OutboundDeliveryCandidate[],
  demoMode: boolean,
  config: {
    apiKey?: string;
    from?: string;
    appUrl?: string;
  } = {},
):
  | { status: "skipped_demo"; candidateCount: 0 }
  | {
      status: "provider_not_configured";
      candidateCount: number;
      missing: string[];
    }
  | {
      status: "provider_configuration_invalid";
      candidateCount: number;
      variable: "POSTWORK_APP_URL";
      error: string;
    }
  | { status: "ready"; candidateCount: number; config: ResendConfig } {
  if (demoMode) {
    return { status: "skipped_demo", candidateCount: 0 };
  }

  const missing = [
    !config.apiKey ? "RESEND_API_KEY" : null,
    !config.from ? "RESEND_FROM_EMAIL" : null,
    !config.appUrl ? "POSTWORK_APP_URL" : null,
  ].filter((name): name is string => name !== null);
  if (missing.length > 0) {
    return {
      status: "provider_not_configured",
      candidateCount: candidates.length,
      missing,
    };
  }
  if (!config.apiKey || !config.from || !config.appUrl) {
    throw new Error("Provider configuration narrowing failed.");
  }

  const appOrigin = parseHttpOrigin(config.appUrl);
  if (!appOrigin) {
    return {
      status: "provider_configuration_invalid",
      candidateCount: candidates.length,
      variable: "POSTWORK_APP_URL",
      error: "POSTWORK_APP_URL must be an absolute HTTP or HTTPS origin.",
    };
  }

  return {
    status: "ready",
    candidateCount: candidates.length,
    config: {
      apiKey: config.apiKey,
      from: config.from,
      appUrl: appOrigin,
    },
  };
}

export async function sendResendEmail({
  config,
  recipientEmail,
  candidate,
  idempotencyKey,
  fetcher = fetch,
  timeoutMs = RESEND_REQUEST_TIMEOUT_MS,
}: {
  config: ResendConfig;
  recipientEmail: string;
  candidate: OutboundDeliveryCandidate;
  idempotencyKey: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
}): Promise<ResendResult> {
  const content = renderNotificationEmail(candidate, config.appUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: [recipientEmail],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);

    if (response.ok) {
      const id = getStringField(body, "id");
      if (id) return { ok: true, providerMessageId: id };
      return {
        ok: false,
        statusCode: response.status,
        code: "invalid_provider_response",
        message: "Resend accepted the request without returning a message ID.",
        retryable: true,
      };
    }

    const code = getStringField(body, "name") ?? "resend_error";
    return {
      ok: false,
      statusCode: response.status,
      code,
      message:
        getStringField(body, "message") ?? `Resend returned HTTP ${response.status}.`,
      retryable: isRetryableResendFailure(response.status, code),
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        statusCode: null,
        code: "request_timeout",
        message: `Resend request timed out after ${timeoutMs}ms.`,
        retryable: true,
      };
    }
    return {
      ok: false,
      statusCode: null,
      code: "network_error",
      message: error instanceof Error ? error.message : "Resend request failed.",
      retryable: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function recordResult(
  ctx: ActionCtx,
  orgId: Id<"orgs">,
  idempotencyKey: string,
  attemptId: string,
  result: ResendResult,
): Promise<void> {
  await ctx.runMutation(internal.notificationDelivery.recordDeliveryResult, {
    orgId,
    idempotencyKey,
    attemptId,
    result: result.ok
      ? { ok: true, providerMessageId: result.providerMessageId }
      : {
          ok: false,
          code: result.code,
          message: result.message,
          retryable: result.retryable,
        },
  });
}

function isRetryableResendFailure(statusCode: number, code: string): boolean {
  if (statusCode === 409) return code === "concurrent_idempotent_requests";
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

export function renderNotificationEmail(
  candidate: OutboundDeliveryCandidate,
  appUrl: string,
): { subject: string; html: string; text: string } {
  const count = candidate.items.length + candidate.omittedCount;
  const subject = candidate.kind === "immediate"
    ? count === 1
      ? `urgent: ${candidate.items[0]?.title ?? "post needs attention"}`
      : `${count} urgent posts need attention`
    : `your Postwork digest: ${count} unread ${count === 1 ? "post" : "posts"}`;
  const heading = candidate.kind === "immediate"
    ? "urgent posts need attention"
    : "your unread Postwork digest";
  const rows = candidate.items.map((item) => {
    const url = safeItemUrl(item.url, item.postId, appUrl);
    const label = `${item.priority}: ${item.title}`;
    return {
      html: `<li><a href="${escapeHtml(url)}">${escapeHtml(label)}</a>${item.space ? ` <span>in ${escapeHtml(item.space)}</span>` : ""}</li>`,
      text: `- ${label}${item.space ? ` in ${item.space}` : ""}\n  ${url}`,
    };
  });
  const omitted = candidate.omittedCount > 0
    ? `${candidate.omittedCount} more unread ${candidate.omittedCount === 1 ? "post is" : "posts are"} waiting in Postwork.`
    : "";
  const settings = `${appUrl.replace(/\/$/, "")}/`;

  return {
    subject,
    html: [
      `<h1>${escapeHtml(heading)}</h1>`,
      `<ul>${rows.map((row) => row.html).join("")}</ul>`,
      omitted ? `<p>${escapeHtml(omitted)}</p>` : "",
      `<p><a href="${escapeHtml(settings)}">open Postwork</a></p>`,
      "<p>Change outbound notifications in your Postwork profile.</p>",
    ].join(""),
    text: [
      heading,
      "",
      rows.map((row) => row.text).join("\n"),
      omitted,
      "",
      `Open Postwork: ${settings}`,
      "Change outbound notifications in your Postwork profile.",
    ].filter(Boolean).join("\n"),
  };
}

function validateDispatchInput(
  recipientEmail: string,
  idempotencyKey: string,
  candidates: readonly OutboundDeliveryCandidate[],
): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return "Recipient email is invalid.";
  }
  if (idempotencyKey.length < 1 || idempotencyKey.length > 240) {
    return "Idempotency key must be between 1 and 240 characters.";
  }
  if (candidates.length > 2) return "A dispatch can contain at most two candidates.";
  if (new Set(candidates.map(({ kind }) => kind)).size !== candidates.length) {
    return "A dispatch cannot repeat a candidate kind.";
  }
  for (const candidate of candidates) {
    const limit = candidate.kind === "immediate" ? 5 : 25;
    if (candidate.items.length < 1 || candidate.items.length > limit) {
      return `${candidate.kind} candidate size is invalid.`;
    }
    if (candidate.omittedCount < 0 || !Number.isInteger(candidate.omittedCount)) {
      return "Omitted count must be a non-negative integer.";
    }
    if (candidate.items.some((item) => !item.unread)) {
      return "Read posts cannot cross the provider boundary.";
    }
    if (
      candidate.kind === "immediate" &&
      candidate.items.some((item) => item.priority !== "urgent")
    ) {
      return "Immediate delivery is reserved for urgent posts.";
    }
  }
  return null;
}

function safeItemUrl(url: string | undefined, postId: string, appUrl: string): string {
  const base = `${appUrl}/`;
  const fallback = new URL(`/posts/${encodeURIComponent(postId)}`, base).toString();
  if (!url) return fallback;
  try {
    const parsed = new URL(url, base);
    return parsed.origin === appUrl ? parsed.toString() : fallback;
  } catch {
    return fallback;
  }
}

function parseHttpOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (
      parsed.username || parsed.password || parsed.pathname !== "/" ||
      parsed.search || parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function getStringField(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const fieldValue = Reflect.get(value, field);
  return typeof fieldValue === "string" ? fieldValue : undefined;
}
