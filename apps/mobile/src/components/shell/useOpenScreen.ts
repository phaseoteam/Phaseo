import { useNavigationContainerRef, usePathname, useRouter, type Href } from "expo-router";
import { useCallback } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { opensAsSection, sectionSwitch, sidebarMove, stackedSections } from "./navigation";

/**
 * Opens a screen the way the sidebar does (see sidebarMove): a section replaces the one showing, at its root, so back
 * unwinds it and then returns to the launch screen, and nothing is open twice. A detail gets its section's root under
 * it (`withAnchor`): a thread from a notification has the Code list behind it.
 */
export function useOpenScreen() {
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  const pathname = usePathname();
  const signedIn = Boolean(useAuth().session);
  return useCallback((href: string) => {
    const root = navigation.isReady() ? navigation.getRootState() : undefined;
    const withAnchor = !opensAsSection(href);
    switch (sidebarMove(pathname, href, signedIn, stackedSections(root))) {
      case "push": return router.push(href as Href, { withAnchor });
      case "switch": {
        const reset = sectionSwitch(root, href, signedIn);
        return reset ? navigation.dispatch(reset) : router.replace(href as Href);
      }
      case "replace": return router.replace(href as Href, { withAnchor });
      case "back": return router.dismissTo(href as Href);
      case "stay": return;
    }
  }, [router, navigation, pathname, signedIn]);
}
