import { describe, expect, test } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  composeOutboundCandidates,
  isWithinQuietHours,
  type NotificationItem,
  type NotificationPreferences,
} from "./notificationComposer";

const NOW = new Date("2026-07-10T12:00:00.000Z");

const enabledPreferences: NotificationPreferences = {
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  outboundEnabled: true,
  quietHoursTimeZone: "UTC",
};

function item(
  postId: string,
  priority: NotificationItem["priority"],
  lastActivityAt: number,
  unread = true,
): NotificationItem {
  return {
    postId,
    title: `Post ${postId}`,
    priority,
    lastActivityAt,
    unread,
  };
}

describe("composeOutboundCandidates", () => {
  test("gates delivery by priority and current unread state", () => {
    const candidates = composeOutboundCandidates({
      items: [
        item("urgent", "urgent", 4),
        item("high", "high", 3),
        item("normal", "normal", 2),
        item("read", "urgent", 5, false),
        item("high", "high", 1),
      ],
      preferences: enabledPreferences,
      now: NOW,
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      kind: "immediate",
      items: [{ postId: "urgent", priority: "urgent" }],
      omittedCount: 0,
    });
    expect(candidates[1]).toMatchObject({
      kind: "digest",
      items: [
        { postId: "high", priority: "high", lastActivityAt: 3 },
        { postId: "normal", priority: "normal" },
      ],
      omittedCount: 0,
    });
  });

  test("returns no candidates when outbound notifications are disabled", () => {
    const candidates = composeOutboundCandidates({
      items: [item("urgent", "urgent", 1)],
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      now: NOW,
    });

    expect(candidates).toEqual([]);
  });

  test("quiet hours suppress immediate delivery and defer urgent items to the digest", () => {
    const duringQuietHours = new Date("2026-07-10T23:00:00.000Z");
    const candidates = composeOutboundCandidates({
      items: [item("urgent", "urgent", 2), item("high", "high", 1)],
      preferences: enabledPreferences,
      now: duringQuietHours,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      kind: "digest",
      items: [
        { postId: "urgent", priority: "urgent" },
        { postId: "high", priority: "high" },
      ],
    });
    expect(isWithinQuietHours(duringQuietHours, enabledPreferences)).toBe(true);
    expect(
      isWithinQuietHours(
        new Date("2026-07-11T08:00:00.000Z"),
        enabledPreferences,
      ),
    ).toBe(false);
  });

  test("digest composition includes urgent when immediate is off and remains bounded", () => {
    const extraNormalItems = Array.from({ length: 25 }, (_, index) =>
      item(`normal-${index}`, "normal", index),
    );
    const candidates = composeOutboundCandidates({
      items: [
        item("urgent", "urgent", 100),
        item("high", "high", 90),
        ...extraNormalItems,
      ],
      preferences: {
        ...enabledPreferences,
        immediateUrgentEnabled: false,
      },
      now: NOW,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.kind).toBe("digest");
    expect(candidates[0]?.items).toHaveLength(25);
    expect(
      candidates[0]?.items.slice(0, 2).map(({ postId }) => postId),
    ).toEqual(["urgent", "high"]);
    expect(candidates[0]?.omittedCount).toBe(2);
  });
});
