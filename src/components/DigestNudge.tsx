import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { demoPolicy } from "../lib/demoMode";
import { useSession } from "../lib/session";

const STORAGE_KEY = "postwork.digestNudgeDismissed";

/**
 * One-time nudge toward the daily digest email. Renders only for signed-in
 * product members who have outbound delivery off and have not dismissed it.
 */
export function DigestNudge() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return true;
    }
  });
  const { currentUser } = useSession();
  const eligible =
    demoPolicy.productAuth &&
    !dismissed &&
    currentUser !== undefined &&
    currentUser.status === "active" &&
    !currentUser.deactivatedAt;
  const preferences = useQuery(
    api.notificationPreferences.current,
    eligible ? {} : "skip",
  );

  if (!eligible || !preferences) return null;
  if (preferences.outboundEnabled) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Session-only dismissal is fine.
    }
  };

  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-border border-l-2 border-l-accent bg-surface px-4 py-3 text-sm">
      <p className="min-w-0 leading-6 text-muted">
        <span className="font-medium text-fg">get the daily digest.</span>{" "}
        one email a day with what moved while you were away — urgent posts
        arrive immediately. read a post in the app and it drops out of the
        email.{" "}
        <Link
          to="/app/settings"
          className="text-accent-soft underline decoration-accent-soft/40 underline-offset-2 transition-colors hover:text-fg"
        >
          turn it on in settings
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss digest suggestion"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent-soft"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
