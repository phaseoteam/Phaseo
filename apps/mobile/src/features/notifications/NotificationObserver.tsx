import * as Notifications from "expo-notifications";
import { useRouter, type Href } from "expo-router";
import { useEffect } from "react";
import { notificationHref } from "./device";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

/** Opens the screen a tapped notification points at, including one that launched the app. */
export function NotificationObserver() {
  const router = useRouter();
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const href = response ? notificationHref(response) : null;
      if (href) router.push(href as Href);
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const listener = Notifications.addNotificationResponseReceivedListener(open);
    return () => listener.remove();
  }, [router]);
  return null;
}
