import { useNavigationContainerRef, usePathname, useRouter, type Href } from "expo-router";
import { useCallback } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { sidebarMove, stackedSections } from "./navigation";

/**
 * Opens a screen the way the sidebar does (see sidebarMove), so back always leads to the launch screen and nothing is
 * open twice. A section opened at a detail gets its root under it (`withAnchor`): a thread from a notification has the
 * Code list behind it.
 */
export function useOpenScreen() {
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  const pathname = usePathname();
  const signedIn = Boolean(useAuth().session);
  return useCallback((href: string) => {
    const stacked = stackedSections(navigation.isReady() ? navigation.getRootState() : undefined);
    switch (sidebarMove(pathname, href, signedIn, stacked)) {
      case "push": return router.push(href as Href, { withAnchor: true });
      case "replace": return router.replace(href as Href, { withAnchor: true });
      case "back": return router.dismissTo(href as Href);
      case "stay": return;
    }
  }, [router, navigation, pathname, signedIn]);
}
