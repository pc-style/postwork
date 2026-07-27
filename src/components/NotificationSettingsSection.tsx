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
    <div className="space-y-3 rounded-md border border-border bg-surface p-4">
      <p className="text-sm text-muted">
        browser permission: {PERMISSION_LABELS[permission]}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {permission === "default" ? (
          <Button variant="secondary" size="sm" onClick={() => void request()}>
            allow browser notifications
          </Button>
        ) : null}

        <Button
          variant="quiet"
          size="sm"
          aria-pressed={enabled}
          onClick={() => setEnabled(!enabled)}
        >
          browser notifications: {enabled ? "on" : "off"}
        </Button>
      </div>

      {permission === "denied" ? (
        <p className="text-xs text-muted">
          notifications are blocked in your browser settings.
        </p>
      ) : null}
    </div>
  );
}
