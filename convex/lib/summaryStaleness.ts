/**
 * A summary is current only when it was generated after the post's latest
 * activity. Posts without a generated summary are actionable, but not stale.
 */
export function isSummaryStale(
  lastActivityAt: number,
  summaryUpdatedAt: number | undefined,
): boolean {
  return summaryUpdatedAt !== undefined && lastActivityAt > summaryUpdatedAt;
}
