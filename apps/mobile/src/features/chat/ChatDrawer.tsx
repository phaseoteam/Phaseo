import { useNavigationContainerRef, usePathname } from "expo-router";
import { PanelLeft } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { BackHandler, Pressable } from "react-native";
import { Drawer } from "react-native-drawer-layout";
import type { LegacyPanGesture } from "react-native-gesture-handler";
import { inApp, leadsWithSidebar, sectionDepth } from "@/components/shell/navigation";
import { SidebarDrawerContext, type SidebarDrawer } from "@/components/shell/sidebarDrawer";
import { Icon, Text } from "@/components/ui";
import { useNeedsYouCount } from "@/features/desktops/needsYou";
import { useLayout } from "@/hooks/useLayout";
import { drawerPan, drawerSwipe } from "./drawerSwipe";

/**
 * Phones: the sidebar slides in from the left over every screen of the app, from the header's sidebar button or a drag
 * to the right, following the finger (see drawerSwipe for when it takes a drag and where it settles). A drag left on
 * it, a tap on the dimmed screen or Back closes it. On a detail (a model, a thread, an account page) the left edge is
 * kept for the platform's back swipe, so only a drag that starts away from it opens the drawer. Split layouts render
 * the children alone, as the app layout keeps the sidebar open beside them.
 */
export function ChatDrawer({ sidebar, children }: { sidebar: () => ReactNode; children: ReactNode }) {
  const { split, width } = useLayout();
  const pathname = usePathname();
  const navigation = useNavigationContainerRef();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(pathname);
  const button = useMemo(() => <SidebarButton onPress={() => setOpen(true)} />, []);
  const controls = useMemo<SidebarDrawer>(() => ({ open: () => setOpen(true), close: () => setOpen(false), button }), [button]);
  const swipe = drawerSwipe(width);
  const leads = leadsWithSidebar(pathname, navigation.isReady() ? sectionDepth(navigation.getRootState()) : 0);
  // react-native-drawer-layout's own pan, with clearer offsets than its 5 dp (later calls replace earlier ones). It
  // builds the pan with the legacy Gesture API, though its types name gesture-handler 3's hook gesture.
  const configurePan = useCallback((gesture: LegacyPanGesture) => {
    const pan = drawerPan({ open, leads });
    const configured = gesture.activeOffsetX(pan.activeOffsetX).failOffsetY(pan.failOffsetY);
    return pan.hitSlop ? configured.hitSlop(pan.hitSlop) : configured;
  }, [open, leads]) as unknown as ComponentProps<typeof Drawer>["configureGestureHandler"];

  // Opening a screen in the app (from the sidebar, a link or a notification) closes the drawer. Pairing opens over the
  // app and keeps it open, so coming back shows the new computer's threads.
  if (pathname !== shown && inApp(pathname)) {
    setShown(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open || split) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [open, split]);

  if (split) return children;
  return (
    <SidebarDrawerContext.Provider value={controls}>
      <Drawer
        open={open}
        onOpen={controls.open}
        onClose={controls.close}
        renderDrawerContent={sidebar}
        drawerType="front"
        drawerStyle={{ width: swipe.width }}
        swipeEdgeWidth={swipe.swipeEdgeWidth}
        swipeMinDistance={swipe.swipeMinDistance}
        swipeMinVelocity={swipe.swipeMinVelocity}
        configureGestureHandler={configurePan}
        overlayAccessibilityLabel="Close sidebar"
      >
        {children}
      </Drawer>
    </SidebarDrawerContext.Provider>
  );
}

function SidebarButton({ onPress }: { onPress(): void }) {
  const count = useNeedsYouCount();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `Open sidebar, ${count} need you` : "Open sidebar"}
      hitSlop={8}
      onPress={onPress}
      className="h-10 min-w-10 flex-row items-center justify-center gap-1 rounded-md px-2 active:bg-accent"
    >
      <Icon icon={PanelLeft} size={20} />
      {count ? <Text variant="caption" className="font-semibold text-warning">{count}</Text> : null}
    </Pressable>
  );
}
