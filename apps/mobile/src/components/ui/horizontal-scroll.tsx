import { useContext, useMemo, type ReactNode } from "react";
import { ScrollView, type ScrollViewProps } from "react-native";
import { DrawerGestureContext } from "react-native-drawer-layout";
import { Gesture, GestureDetector, type LegacyPanGesture } from "react-native-gesture-handler";

/**
 * Every sideways-scrolling row (a bare `<ScrollView horizontal>` fails lint). The phone's sidebar drawer pans on drags
 * anywhere on the screen, and gesture-handler cancels a plain native scroll view once that pan takes over, so a drag
 * right on a row opened the sidebar instead of scrolling back. The row registers its scroll with the pan and blocks
 * it, so a drag that starts on the row scrolls it either way. It blocks at its start too: Android's scroll view claims
 * every sideways drag, even one with nothing to scroll to, so handing those to the drawer wasn't reliable. Without a
 * drawer (split layouts, sheets) it's a plain ScrollView.
 */
export function HorizontalScroll(props: Omit<ScrollViewProps, "horizontal">) {
  // react-native-drawer-layout builds its pan with the legacy Gesture API (its types name gesture-handler 3's hook
  // gesture), and relations only work between gestures of one API, so the row's scroll is a legacy one too.
  const drawerPan = useContext(DrawerGestureContext) as unknown as LegacyPanGesture | undefined;
  const gesture = useMemo(() => (drawerPan ? Gesture.Native().blocksExternalGesture(drawerPan) : null), [drawerPan]);
  const row = <ScrollView horizontal showsHorizontalScrollIndicator={false} {...props} />;
  return gesture ? <GestureDetector gesture={gesture}>{row}</GestureDetector> : row;
}

/** Content shown over the drawer in its own window (a Modal), which the drawer's pan can't reach. */
export function OutsideDrawer({ children }: { children: ReactNode }) {
  return <DrawerGestureContext.Provider value={undefined}>{children}</DrawerGestureContext.Provider>;
}
