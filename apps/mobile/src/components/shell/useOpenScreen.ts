import { usePathname, useRouter, type Href } from "expo-router";
import { useCallback } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { sidebarMove } from "./navigation";

/** Opens a screen the way the sidebar does (see sidebarMove), so back always leads to the launch screen. */
export function useOpenScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const signedIn = Boolean(useAuth().session);
  return useCallback((href: string) => {
    switch (sidebarMove(pathname, href, signedIn)) {
      case "push": return router.push(href as Href);
      case "replace": return router.replace(href as Href);
      case "back": return router.dismissTo(href as Href);
      case "stay": return;
    }
  }, [router, pathname, signedIn]);
}
