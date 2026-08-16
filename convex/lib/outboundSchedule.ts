import type { NotificationPreferences } from "../notificationComposer";
import type { NotificationItem } from "../notificationComposer";

/**
 * Pure scheduling decisions for the outbound notification cron. Everything
 * here is deterministic on (now, preferences, items) so it stays unit-testable
 * without a Convex runtime.
 */

const FALLBACK_DIGEST_RELEASE = "09:00";

function parseTimeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 9 * 60;
  return hour * 60 + minute;
}

export function minutesInTimeZone(now: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    return hour * 60 + minute;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

/** The local calendar date (YYYY-MM-DD) used to key one digest per day. */
export function localDateKey(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * The digest releases when quiet hours end — the morning boundary people
 * already configured — or at 09:00 local when quiet hours are off.
 */
export function digestReleaseMinutes(
  preferences: Pick<NotificationPreferences, "quietHoursEnabled" | "quietHoursEnd">,
): number {
  return parseTimeToMinutes(
    preferences.quietHoursEnabled ? preferences.quietHoursEnd : FALLBACK_DIGEST_RELEASE,
  );
}

export function digestDue(
  now: Date,
  preferences: Pick<
    NotificationPreferences,
    "quietHoursEnabled" | "quietHoursEnd" | "quietHoursTimeZone"
  >,
): boolean {
  return (
    minutesInTimeZone(now, preferences.quietHoursTimeZone) >=
    digestReleaseMinutes(preferences)
  );
}

/**
 * Stable, bounded suffix so a persisting set of urgent posts sends one email,
 * while a new urgent post produces a new key (and a fresh send).
 */
export function immediateKeySuffix(items: readonly NotificationItem[]): string {
  return items
    .map((item) => item.postId)
    .sort()
    .slice(0, 8)
    .join(",");
}
