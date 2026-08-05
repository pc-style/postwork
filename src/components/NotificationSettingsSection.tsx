import { Button } from "./Button";
import {
  useBrowserNotificationsEnabled,
  useNotificationPermission,
} from "../lib/notifications";

const PERMISSION_LABELS = {
  granted: "granted",
  denied: "denied",
  default: "not asked",
  unsupported: "unsupported",
} as const;

export function NotificationSettingsSection() {
  const { permission, request } = useNotificationPermission();
  const [enabled, setEnabled] = useBrowserNotificationsEnabled();

  return (
    <div className="max-w-xl rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-title font-medium">browser notifications</h3>
            <span className="rounded-sm bg-surface-2 px-1.5 py-px text-body leading-tight text-muted">
              {PERMISSION_LABELS[permission]}
            </span>
          </div>
          <p className="mt-1 text-body text-muted">
            get an alert when a teammate needs your attention.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {permission === "default" ? (
            <Button variant="secondary" size="sm" onClick={() => void request()}>
              allow notifications
            </Button>
          ) : null}
          {permission !== "denied" ? (
            <Button
              variant="quiet"
              size="sm"
              aria-pressed={enabled}
              onClick={async () => {
                if (enabled) {
                  setEnabled(false);
                  return;
                }
                // "turn on" is only meaningful with browser permission: ask
                // first when we haven't yet, and enable only on grant.
                if (permission === "default") {
                  await request();
                  if (Notification.permission === "granted") setEnabled(true);
                  return;
                }
                setEnabled(true);
              }}
            >
              {enabled ? "turn off" : "turn on"}
            </Button>
          ) : null}
        </div>
      </div>
      {permission === "denied" ? (
        <p className="mt-3 text-body text-muted">
          notifications are blocked. allow postwork notifications in your browser settings, then reload this page.
        </p>
      ) : null}
    </div>
  );
}
