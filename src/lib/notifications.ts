import { useCallback, useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { demoPolicy } from "./demoMode";

const BROWSER_NOTIFICATIONS_KEY = "postwork.browserNotifications";
const BROWSER_NOTIFICATIONS_CHANGE_EVENT =
  "postwork:browser-notifications-change";

type NotificationPermissionState = NotificationPermission | "unsupported";

function getNotificationPermission(): NotificationPermissionState {
  return typeof Notification === "undefined"
    ? "unsupported"
    : Notification.permission;
}

function getBrowserNotificationsEnabled() {
  return (
    typeof window !== "undefined" &&
    window.localStorage.getItem(BROWSER_NOTIFICATIONS_KEY) === "on"
  );
}

export function useNotificationPermission(): {
  supported: boolean;
  permission: NotificationPermissionState;
  request: () => Promise<void>;
} {
  const [permission, setPermission] = useState<NotificationPermissionState>(
    getNotificationPermission,
  );

  const request = useCallback(async () => {
    if (typeof Notification === "undefined") return;

    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);
  }, []);

  return {
    supported: permission !== "unsupported",
    permission,
    request,
  };
}

function useProductBrowserNotificationsEnabled(): [
  boolean,
  (enabled: boolean) => void,
] {
  const { isAuthenticated } = useConvexAuth();
  const useBackend = isAuthenticated;
  const preferences = useQuery(
    api.notificationPreferences.current,
    useBackend ? {} : "skip",
  );
  const updatePreferences = useMutation(api.notificationPreferences.update);
  const [localEnabled, setLocalEnabled] = useState(
    getBrowserNotificationsEnabled,
  );
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    setOptimisticEnabled(null);
  }, [preferences?.browserEnabled]);

  const setEnabled = useCallback((nextEnabled: boolean) => {
    if (useBackend) {
      if (!preferences) return;
      setOptimisticEnabled(nextEnabled);
      void updatePreferences({
        browserEnabled: nextEnabled,
        outboundEnabled: preferences.outboundEnabled,
        immediateUrgentEnabled: preferences.immediateUrgentEnabled,
        digestEnabled: preferences.digestEnabled,
        quietHoursEnabled: preferences.quietHoursEnabled,
        quietHoursStart: preferences.quietHoursStart,
        quietHoursEnd: preferences.quietHoursEnd,
        quietHoursTimeZone: preferences.quietHoursTimeZone,
      }).catch(() => setOptimisticEnabled(null));
      return;
    }

    setLocalEnabled(nextEnabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        BROWSER_NOTIFICATIONS_KEY,
        nextEnabled ? "on" : "off",
      );
      window.dispatchEvent(new Event(BROWSER_NOTIFICATIONS_CHANGE_EVENT));
    }
  }, [preferences, updatePreferences, useBackend]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === BROWSER_NOTIFICATIONS_KEY) {
        setLocalEnabled(event.newValue === "on");
      }
    }

    function handleLocalChange() {
      setLocalEnabled(getBrowserNotificationsEnabled());
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(
      BROWSER_NOTIFICATIONS_CHANGE_EVENT,
      handleLocalChange,
    );
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        BROWSER_NOTIFICATIONS_CHANGE_EVENT,
        handleLocalChange,
      );
    };
  }, []);

  const enabled = useBackend
    ? optimisticEnabled ?? preferences?.browserEnabled ?? false
    : localEnabled;
  return [enabled, setEnabled];
}

function useLocalBrowserNotificationsEnabled(): [
  boolean,
  (enabled: boolean) => void,
] {
  const [enabled, setEnabledState] = useState(getBrowserNotificationsEnabled);

  const setEnabled = useCallback((nextEnabled: boolean) => {
    setEnabledState(nextEnabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        BROWSER_NOTIFICATIONS_KEY,
        nextEnabled ? "on" : "off",
      );
      window.dispatchEvent(new Event(BROWSER_NOTIFICATIONS_CHANGE_EVENT));
    }
  }, []);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === BROWSER_NOTIFICATIONS_KEY) {
        setEnabledState(event.newValue === "on");
      }
    }
    function handleLocalChange() {
      setEnabledState(getBrowserNotificationsEnabled());
    }
    window.addEventListener("storage", handleStorage);
    window.addEventListener(
      BROWSER_NOTIFICATIONS_CHANGE_EVENT,
      handleLocalChange,
    );
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        BROWSER_NOTIFICATIONS_CHANGE_EVENT,
        handleLocalChange,
      );
    };
  }, []);

  return [enabled, setEnabled];
}

// Demo uses a plain ConvexProvider, which intentionally has no auth context.
// Product mode is fixed for the lifetime of the build, so select the hook once
// at module initialization rather than conditionally dispatching during render.
export const useBrowserNotificationsEnabled: () => [
  boolean,
  (enabled: boolean) => void,
] = demoPolicy.productAuth
  ? useProductBrowserNotificationsEnabled
  : useLocalBrowserNotificationsEnabled;

export function useUnreadNotifier(unread: number | undefined): void {
  const previousUnread = useRef<number | undefined>(undefined);
  const [enabled] = useBrowserNotificationsEnabled();

  useEffect(() => {
    const previous = previousUnread.current;
    previousUnread.current = unread;

    if (
      unread === undefined ||
      previous === undefined ||
      unread <= previous ||
      !enabled ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted" ||
      document.visibilityState !== "hidden"
    ) {
      return;
    }

    const notification = new Notification("postwork", {
      body: `${unread} unread post${unread === 1 ? "" : "s"}`,
      tag: "postwork-unread",
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }, [enabled, unread]);
}
