import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { logError, logInfo, logWarn } from "./lib/observability";
import type { OutboundDeliveryCandidate } from "./notificationComposer";

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

/**
 * Server-only provider boundary. Composition and preference checks happen
 * before this action. This boundary validates their output before sending.
 */
export const dispatch = internalAction({
  args: {
    recipientEmail: v.string(),
    candidates: v.array(outboundCandidate),
    idempotencyKey: v.string(),
  },
  handler: async (_ctx, args) => {
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
      const result = await sendResendEmail({
        config: plan.config,
        recipientEmail: args.recipientEmail,
        candidate,
        idempotencyKey: `${args.idempotencyKey}/${candidate.kind}`,
      });
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

  return {
    status: "ready",
    candidateCount: candidates.length,
    config: {
      apiKey: config.apiKey,
      from: config.from,
      appUrl: config.appUrl.replace(/\/$/, ""),
    },
  };
}

export async function sendResendEmail({
  config,
  recipientEmail,
  candidate,
  idempotencyKey,
  fetcher = fetch,
}: {
  config: ResendConfig;
  recipientEmail: string;
  candidate: OutboundDeliveryCandidate;
  idempotencyKey: string;
  fetcher?: Fetcher;
}): Promise<ResendResult> {
  const content = renderNotificationEmail(candidate, config.appUrl);

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

    return {
      ok: false,
      statusCode: response.status,
      code: getStringField(body, "name") ?? "resend_error",
      message:
        getStringField(body, "message") ?? `Resend returned HTTP ${response.status}.`,
      retryable:
        response.status === 408 || response.status === 409 ||
        response.status === 429 || response.status >= 500,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      code: "network_error",
      message: error instanceof Error ? error.message : "Resend request failed.",
      retryable: true,
    };
  }
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
  const base = `${appUrl.replace(/\/$/, "")}/`;
  if (!url) return new URL(`/posts/${encodeURIComponent(postId)}`, base).toString();
  try {
    const parsed = new URL(url, base);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : base;
  } catch {
    return base;
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
