import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { notificationModelId } from "@/lib/notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function NotificationObserver() {
  const router = useRouter();
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const modelId = notificationModelId(response);
      if (modelId) router.push({ pathname: "/model/[id]", params: { id: modelId } });
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const listener = Notifications.addNotificationResponseReceivedListener(open);
    return () => listener.remove();
  }, [router]);
  return null;
}
