import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Tenant-visible audit trail. Every governance or moderation write should
 * leave a row here; the /admin audit page reads it. Metadata is JSON-encoded
 * and must never contain secrets or member email addresses.
 */
export async function logAudit(
  ctx: MutationCtx,
  entry: {
    orgId: Id<"orgs"> | undefined;
    actorId?: Id<"users">;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await ctx.db.insert("auditLog", {
    orgId: entry.orgId,
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : undefined,
    createdAt: Date.now(),
  });
}
