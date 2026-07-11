/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { assertStorageUnattached, validateStoredAttachment } from "./lib/attachmentStorage";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const storageId = "storage-1" as Id<"_storage">;
const uploadToken = "ticket-1" as Id<"attachmentUploadTickets">;
const ownerId = "user-1" as Id<"users">;

const attachment = {
  storageId,
  uploadToken,
  filename: "proof.png",
  contentType: "image/png" as const,
  mediaKind: "image" as const,
  size: 12,
};

function attachmentContext(
  ticketStorageId: Id<"_storage"> | undefined,
  existingAttachment = false,
) {
  let ticketExists = true;
  const ctx = {
    db: {
      get: async () => (ticketExists
        ? {
            _id: uploadToken,
            userId: ownerId,
            orgId: undefined,
            storageId: ticketStorageId,
            expiresAt: Date.now() + 60_000,
          }
        : null),
      system: {
        get: async () => ({ contentType: "image/png", size: 12 }),
      },
      query: () => ({
        withIndex: () => ({ unique: async () => (existingAttachment ? { _id: "attachment-1" } : null) }),
      }),
      delete: async () => {
        ticketExists = false;
      },
    },
  } as unknown as MutationCtx;
  return ctx;
}

describe("attachment upload tickets", () => {
  test("cleans expired unclaimed ticket rows", async () => {
    const t = convexTest(schema, modules);
    const { ticketId } = await t.run(async (ctx) => {
      const orgId = await ctx.db.insert("orgs", {
        name: "Acme",
        slug: "acme",
        createdAt: 1,
      });
      const userId = await ctx.db.insert("users", {
        orgId,
        name: "Ada",
        title: "Engineer",
        avatarColor: "#8c1862",
        initials: "AD",
        role: "member",
        status: "active",
      });
      const ticketId = await ctx.db.insert("attachmentUploadTickets", {
        orgId,
        userId,
        createdAt: 1,
        expiresAt: 2,
      });
      return { ticketId };
    });

    await expect(
      t.mutation(internal.attachments.cleanupExpiredUploadTickets, {}),
    ).resolves.toEqual({ deleted: 1 });
    await expect(t.run(async (ctx) => await ctx.db.get(ticketId))).resolves.toBeNull();
  });

  test("requires the ticket's exact claimed storage ID", async () => {
    const mismatchedStorageId = "storage-2" as Id<"_storage">;
    const ctx = attachmentContext(storageId);

    await expect(
      validateStoredAttachment(ctx, ownerId, undefined, { ...attachment, storageId: mismatchedStorageId }),
    ).rejects.toBeInstanceOf(ConvexError);
  });

  test("refuses to bind storage already referenced by an attachment", async () => {
    const ctx = attachmentContext(undefined, true);

    await expect(assertStorageUnattached(ctx, storageId)).rejects.toBeInstanceOf(ConvexError);
  });

  test("consumes a claimed ticket exactly once", async () => {
    const ctx = attachmentContext(storageId);

    await expect(validateStoredAttachment(ctx, ownerId, undefined, attachment)).resolves.toMatchObject({ storageId });
    await expect(validateStoredAttachment(ctx, ownerId, undefined, attachment)).rejects.toBeInstanceOf(ConvexError);
  });
});
