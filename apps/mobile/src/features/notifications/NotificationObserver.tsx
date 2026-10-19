import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useRouter, type Href } from "expo-router";
import { useEffect } from "react";
import { catalogueQuery, filtersStore } from "@/features/models/state";
import { DEFAULT_FILTERS } from "@/lib/catalogue";
import { labFilterName, notificationTarget, type NotificationTarget } from "./links";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

type Router = ReturnType<typeof useRouter>;

// The tap that launched the app can arrive both as the last response and through the listener.
// Keyed by delivery time too, since a merged notification reuses the earlier one's identifier.
let lastOpened: string | null = null;

/** Models, filtered to one lab (the app has no lab page) and newest first. */
async function openLab(slug: string, router: Router, queryClient: QueryClient) {
  const show = (name: string | null) => filtersStore.set({ ...DEFAULT_FILTERS, ...(name ? { organisations: [name] } : { query: slug }) });
  const cached = queryClient.getQueryData(catalogueQuery.queryKey);
  const name = cached ? labFilterName(cached.models, slug) : null;
  if (name) show(name);
  router.push("/models");
  if (name) return;
  // A lab newer than the cached catalogue needs fresh data; failing that, search for its slug.
  const fresh = await queryClient.fetchQuery({ ...catalogueQuery, staleTime: 0 }).catch(() => null);
  show(fresh ? labFilterName(fresh.models, slug) : null);
}

function openTarget(target: NotificationTarget, router: Router, queryClient: QueryClient) {
  switch (target.kind) {
    case "model": return router.push(`/models/${target.id}` as Href);
    case "lab": return void openLab(target.slug, router, queryClient);
    case "provider": return router.push({ pathname: "/providers/[id]", params: { id: target.id } });
    case "home": return router.push("/");
  }
}

/** Opens the screen a tapped notification points at, including one that launched the app. */
export function NotificationObserver() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const key = `${response.notification.request.identifier}:${response.notification.date}`;
      if (key === lastOpened) return;
      lastOpened = key;
      const target = notificationTarget(response.notification.request.content.data);
      if (target) openTarget(target, router, queryClient);
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const listener = Notifications.addNotificationResponseReceivedListener(open);
    return () => listener.remove();
  }, [router, queryClient]);

  return null;
}
