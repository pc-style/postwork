import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env, internalAction, internalQuery } from "./_generated/server";
import { logError, logInfo, logWarn } from "./lib/observability";

/**
 * Transactional invite delivery. approveAccessRequest (and email-targeted
 * invite creation) schedule this action so the invited person gets the join
 * link directly instead of waiting for an admin to copy a code around.
 *
 * Reuses the notification delivery claim table for idempotency: one send per
 * invite, retries stay inside the provider's idempotency window, and demo
 * deployments never email anyone.
 */

const RESEND_TIMEOUT_MS = 10_000;

export function renderInviteEmail({
  orgName,
  joinUrl,
  note,
}: {
  orgName: string;
  joinUrl: string;
  note?: string;
}): { subject: string; html: string; text: string } {
  const subject = `you're invited to ${orgName} on postwork`;
  const intro = `You've been invited to join ${orgName} on Postwork.`;
  return {
    subject,
    html: [
      `<p>${escapeHtml(intro)}</p>`,
      note ? `<p>${escapeHtml(note)}</p>` : "",
      `<p><a href="${escapeHtml(joinUrl)}">Accept the invite</a></p>`,
      `<p>Or open ${escapeHtml(joinUrl)} in your browser.</p>`,
      "<p>If you weren't expecting this, you can ignore it — the link only works with an account you control.</p>",
    ].join(""),
    text: [
      intro,
      note ?? "",
      "",
      `Accept the invite: ${joinUrl}`,
      "",
      "If you weren't expecting this, you can ignore it.",
    ]
      .filter((line, index) => line !== "" || index === 2 || index === 4)
      .join("\n"),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function inviteJoinUrl(appUrl: string, code: string): string | null {
  try {
    const base = new URL(appUrl);
    if (base.protocol !== "https:" && base.protocol !== "http:") return null;
    if (base.username || base.password || base.search || base.hash) return null;
    return new URL(`/join/${encodeURIComponent(code)}`, base).toString();
  } catch {
    return null;
  }
}

export const deliver = internalAction({
  args: {
    inviteId: v.id("invites"),
    recipientEmail: v.string(),
  },
  handler: async (ctx, args): Promise<{ status: string }> => {
    if (env.DEMO !== "false") return { status: "skipped_demo" };
    const apiKey = env.RESEND_API_KEY;
    const from = env.RESEND_FROM_EMAIL;
    const appUrl = env.POSTWORK_APP_URL;
    if (!apiKey || !from || !appUrl) {
      logWarn("invite.deliverySkipped", { reason: "provider_not_configured" });
      return { status: "provider_not_configured" };
    }
    const invite = await ctx.runQuery(internal.inviteDelivery.getInviteContext, {
      inviteId: args.inviteId,
    });
    if (!invite) return { status: "invite_not_found" };
    const joinUrl = inviteJoinUrl(appUrl, invite.code);
    if (!joinUrl) {
      logError("invite.deliveryRejected", { reason: "invalid_app_url" });
      return { status: "invalid_app_url" };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.recipientEmail)) {
      return { status: "invalid_recipient" };
    }

    const idempotencyKey = `invite/${args.inviteId}`;
    const attemptId = crypto.randomUUID();
    const claim = await ctx.runMutation(
      internal.notificationDelivery.claimDelivery,
      { orgId: invite.orgId, idempotencyKey, attemptId },
    );
    if (claim.status === "already_sent") return { status: "already_sent" };
    if (claim.status !== "ready") return { status: claim.status };

    const content = renderInviteEmail({
      orgName: invite.orgName,
      joinUrl,
      note: invite.note,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: [args.recipientEmail],
          subject: content.subject,
          html: content.html,
          text: content.text,
        }),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as
        | { id?: string; name?: string; message?: string }
        | null;
      if (response.ok && typeof body?.id === "string") {
        await ctx.runMutation(internal.notificationDelivery.recordDeliveryResult, {
          orgId: invite.orgId,
          idempotencyKey,
          attemptId,
          result: { ok: true, providerMessageId: body.id },
        });
        logInfo("invite.delivered", { inviteId: args.inviteId });
        return { status: "sent" };
      }
      const retryable =
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500;
      await ctx.runMutation(internal.notificationDelivery.recordDeliveryResult, {
        orgId: invite.orgId,
        idempotencyKey,
        attemptId,
        result: {
          ok: false,
          code: body?.name ?? `http_${response.status}`,
          message: body?.message ?? `Resend returned HTTP ${response.status}.`,
          retryable,
        },
      });
      logWarn("invite.deliveryFailed", {
        inviteId: args.inviteId,
        statusCode: response.status,
      });
      return { status: "provider_failed" };
    } catch (error) {
      await ctx.runMutation(internal.notificationDelivery.recordDeliveryResult, {
        orgId: invite.orgId,
        idempotencyKey,
        attemptId,
        result: {
          ok: false,
          code: controller.signal.aborted ? "request_timeout" : "network_error",
          message: error instanceof Error ? error.message : "Request failed.",
          retryable: true,
        },
      });
      return { status: "provider_failed" };
    } finally {
      clearTimeout(timeout);
    }
  },
});

export const getInviteContext = internalQuery({
  args: { inviteId: v.id("invites") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    orgId: Id<"orgs">;
    orgName: string;
    code: string;
    note: string | undefined;
  } | null> => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite?.orgId || invite.revokedAt) return null;
    const org = await ctx.db.get(invite.orgId);
    if (!org) return null;
    return {
      orgId: invite.orgId,
      orgName: org.name,
      code: invite.code,
      // The note is admin-authored ("access request: x@y.z") — don't leak it
      // to the recipient unless it reads like a welcome message.
      note: undefined,
    };
  },
});
