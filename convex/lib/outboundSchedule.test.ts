import { describe, expect, test } from "vitest";
import {
  digestDue,
  digestReleaseMinutes,
  immediateKeySuffix,
  localDateKey,
  minutesInTimeZone,
  summaryTeaser,
} from "./outboundSchedule";
import type { NotificationItem } from "../notificationComposer";

function item(postId: string): NotificationItem {
  return {
    postId,
    title: postId,
    priority: "urgent",
    lastActivityAt: 1,
    unread: true,
  };
}

describe("digest release", () => {
  test("releases when quiet hours end", () => {
    expect(
      digestReleaseMinutes({ quietHoursEnabled: true, quietHoursEnd: "07:30" }),
    ).toBe(7 * 60 + 30);
  });

  test("falls back to 09:00 without quiet hours", () => {
    expect(
      digestReleaseMinutes({ quietHoursEnabled: false, quietHoursEnd: "07:30" }),
    ).toBe(9 * 60);
  });

  test("digestDue respects the preference time zone", () => {
    // 08:00 UTC = 10:00 in Berlin (summer), 04:00 in New York.
    const now = new Date("2026-08-16T08:00:00Z");
    const base = { quietHoursEnabled: true, quietHoursEnd: "08:00" };
    expect(digestDue(now, { ...base, quietHoursTimeZone: "Europe/Berlin" })).toBe(true);
    expect(digestDue(now, { ...base, quietHoursTimeZone: "America/New_York" })).toBe(false);
  });

  test("invalid time zone falls back to UTC instead of throwing", () => {
    const now = new Date("2026-08-16T10:00:00Z");
    expect(minutesInTimeZone(now, "Not/AZone")).toBe(10 * 60);
    expect(localDateKey(now, "Not/AZone")).toBe("2026-08-16");
  });
});

describe("localDateKey", () => {
  test("uses the local calendar date", () => {
    // 23:30 UTC on the 16th is already the 17th in Tokyo.
    const now = new Date("2026-08-16T23:30:00Z");
    expect(localDateKey(now, "Asia/Tokyo")).toBe("2026-08-17");
    expect(localDateKey(now, "UTC")).toBe("2026-08-16");
  });
});

describe("immediateKeySuffix", () => {
  test("is order-independent and bounded", () => {
    const a = immediateKeySuffix([item("b"), item("a")]);
    const b = immediateKeySuffix([item("a"), item("b")]);
    expect(a).toBe(b);
    expect(a).toBe("a,b");

    const many = immediateKeySuffix(
      Array.from({ length: 20 }, (_, index) => item(`p${String(index).padStart(2, "0")}`)),
    );
    expect(many.split(",")).toHaveLength(8);
  });

  test("a new urgent post changes the key", () => {
    expect(immediateKeySuffix([item("a")])).not.toBe(
      immediateKeySuffix([item("a"), item("c")]),
    );
  });
});

describe("summaryTeaser", () => {
  test("drops a leading tl;dr label and strips markdown", () => {
    expect(summaryTeaser("TL;DR: **Ship it** — see [the doc](https://x.test).")).toBe(
      "Ship it — see the doc.",
    );
  });

  test("collapses whitespace and returns undefined for empty summaries", () => {
    expect(summaryTeaser("  \n\t ")).toBeUndefined();
    expect(summaryTeaser(undefined)).toBeUndefined();
    expect(summaryTeaser("a\n\nb")).toBe("a b");
  });

  test("truncates long summaries on a word boundary with an ellipsis", () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const teaser = summaryTeaser(long)!;
    expect(teaser.length).toBeLessThanOrEqual(161);
    expect(teaser.endsWith("\u2026")).toBe(true);
    expect(teaser).not.toContain("word59");
  });
});
