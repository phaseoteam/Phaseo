import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useRouter, type Href } from "expo-router";
import { useEffect, useEffectEvent } from "react";
import { useOpenScreen } from "@/components/shell/useOpenScreen";
import { catalogueQuery, filtersStore } from "@/features/models/state";
import { useAuth } from "@/providers/AuthProvider";
import { ensurePushChannels, installationId, syncThisPhone } from "./device";
import { notificationRoute, notificationTarget, openLabModels, type NotificationTarget } from "./links";
import { notificationSettingsQuery } from "./state";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

type Router = ReturnType<typeof useRouter>;

// The tap that launched the app can arrive both as the last response and through the listener.
// Keyed by delivery time too, since a merged notification reuses the earlier one's identifier.
let lastOpened: string | null = null;

function openTarget(target: NotificationTarget, router: Router, openScreen: (href: string) => void, queryClient: QueryClient) {
  const { href, open } = notificationRoute(target);
  const navigate = () => (open === "push" ? router.push(href as Href) : openScreen(href));
  if (target.kind !== "lab") return navigate();
  void openLabModels(target.slug, {
    cached: queryClient.getQueryData(catalogueQuery.queryKey)?.models ?? null,
    refresh: async () => (await queryClient.fetchQuery({ ...catalogueQuery, staleTime: 0 })).models,
    filters: filtersStore,
    navigate,
  });
}

/**
 * Opens the screen a tapped notification points at, including one that launched the app. Also keeps
 * this phone's push setup current: the Android channels on every start, then (signed in) a
 * re-registration when something changed, which moves existing installs to channel scheme 2.
 */
export function NotificationObserver() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const userId = useAuth().session?.user.id ?? null;
  const openScreen = useOpenScreen();
  // Reads the screen showing at the tap, without subscribing again on every navigation.
  const openTapped = useEffectEvent((target: NotificationTarget) => openTarget(target, router, openScreen, queryClient));

  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const key = `${response.notification.request.identifier}:${response.notification.date}`;
      if (key === lastOpened) return;
      lastOpened = key;
      const target = notificationTarget(response.notification.request.content.data);
      if (target) openTapped(target);
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const listener = Notifications.addNotificationResponseReceivedListener(open);
    return () => listener.remove();
  }, []);

  useEffect(() => {
    void (async () => {
      await ensurePushChannels();
      if (!userId) return;
      const id = await installationId();
      await syncThisPhone(userId, () => queryClient.fetchQuery({ ...notificationSettingsQuery(userId, id), staleTime: 60_000 }));
    })().catch(() => undefined);
  }, [userId, queryClient]);

  return null;
}
