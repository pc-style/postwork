export type NotificationPriority = "urgent" | "high" | "normal";

export type NotificationPreferences = {
  outboundEnabled: boolean;
  immediateUrgentEnabled: boolean;
  digestEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  quietHoursTimeZone: string;
};

export type NotificationItem = {
  postId: string;
  title: string;
  priority: NotificationPriority;
  lastActivityAt: number;
  unread: boolean;
  space?: string;
  url?: string;
};

export type OutboundDeliveryCandidate = {
  kind: "immediate" | "digest";
  items: NotificationItem[];
  omittedCount: number;
};

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  outboundEnabled: false,
  immediateUrgentEnabled: true,
  digestEnabled: true,
  quietHoursEnabled: true,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  quietHoursTimeZone: "UTC",
} satisfies NotificationPreferences;

const PRIORITY_ORDER: Record<NotificationPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
};

const IMMEDIATE_ITEM_LIMIT = 5;
const DIGEST_ITEM_LIMIT = 25;

/**
 * Compose bounded, provider-neutral outbound candidates from current unread
 * state. This function never changes read state and performs no side effects.
 */
export function composeOutboundCandidates({
  items,
  preferences,
  now,
}: {
  items: readonly NotificationItem[];
  preferences: NotificationPreferences;
  now: Date;
}): OutboundDeliveryCandidate[] {
  if (!preferences.outboundEnabled) return [];

  const unreadItems = deduplicateUnreadItems(items);
  if (unreadItems.length === 0) return [];

  const quiet = isWithinQuietHours(now, preferences);
  const urgent = unreadItems.filter((item) => item.priority === "urgent");
  const digestOnly = unreadItems.filter((item) => item.priority !== "urgent");
  const candidates: OutboundDeliveryCandidate[] = [];

  if (preferences.immediateUrgentEnabled && !quiet && urgent.length > 0) {
    candidates.push({
      kind: "immediate",
      items: urgent.slice(0, IMMEDIATE_ITEM_LIMIT),
      omittedCount: Math.max(0, urgent.length - IMMEDIATE_ITEM_LIMIT),
    });
  } else {
    digestOnly.unshift(...urgent);
  }

  if (preferences.digestEnabled && digestOnly.length > 0) {
    digestOnly.sort(compareItems);
    candidates.push({
      kind: "digest",
      items: digestOnly.slice(0, DIGEST_ITEM_LIMIT),
      omittedCount: Math.max(0, digestOnly.length - DIGEST_ITEM_LIMIT),
    });
  }

  return candidates;
}

export function isWithinQuietHours(
  now: Date,
  preferences: Pick<
    NotificationPreferences,
    | "quietHoursEnabled"
    | "quietHoursStart"
    | "quietHoursEnd"
    | "quietHoursTimeZone"
  >,
): boolean {
  if (!preferences.quietHoursEnabled) return false;

  const currentMinutes = minutesInTimeZone(now, preferences.quietHoursTimeZone);
  const start = parseTime(preferences.quietHoursStart);
  const end = parseTime(preferences.quietHoursEnd);

  if (start === end) return true;
  if (start < end) return currentMinutes >= start && currentMinutes < end;
  return currentMinutes >= start || currentMinutes < end;
}

function deduplicateUnreadItems(
  items: readonly NotificationItem[],
): NotificationItem[] {
  const byPost = new Map<string, NotificationItem>();
  for (const item of items) {
    if (!item.unread) continue;
    const existing = byPost.get(item.postId);
    if (!existing || item.lastActivityAt > existing.lastActivityAt) {
      byPost.set(item.postId, item);
    }
  }
  return [...byPost.values()].sort(compareItems);
}

function compareItems(a: NotificationItem, b: NotificationItem): number {
  return (
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    b.lastActivityAt - a.lastActivityAt ||
    a.postId.localeCompare(b.postId)
  );
}

function minutesInTimeZone(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}

function parseTime(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
