import { useContext, useMemo, type ReactNode } from "react";
import { ScrollView, type ScrollViewProps } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { acquireSwipeLock, releaseSwipeLock, SwipeLockContext } from "@/components/shell/swipeLock";

/**
 * Every sideways-scrolling row (a bare `<ScrollView horizontal>` fails lint). The phone's sidebar drawer pans on drags
 * anywhere on the screen, so a touch that lands on a row takes the drawer's swipe lock until the finger lifts (see
 * swipeLock): the drag scrolls the row either way, at its start too, and never moves the sidebar. Without a drawer
 * (split layouts, sheets) it's a plain ScrollView.
 */
export function HorizontalScroll(props: Omit<ScrollViewProps, "horizontal">) {
  const lock = useContext(SwipeLockContext);
  const gesture = useMemo(() => {
    if (!lock) return null;
    const release = () => {
      "worklet";
      releaseSwipeLock(lock);
    };
    return Gesture.Native()
      .onTouchesDown(() => {
        "worklet";
        acquireSwipeLock(lock, Date.now());
      })
      .onTouchesUp((event) => {
        "worklet";
        if (event.numberOfTouches === 0) release();
      })
      .onTouchesCancelled(release);
  }, [lock]);
  const row = <ScrollView horizontal showsHorizontalScrollIndicator={false} {...props} />;
  return gesture ? <GestureDetector gesture={gesture}>{row}</GestureDetector> : row;
}

/** Content shown over the drawer in its own window (a Modal), which the drawer's pan can't reach. */
export function OutsideDrawer({ children }: { children: ReactNode }) {
  return <SwipeLockContext.Provider value={null}>{children}</SwipeLockContext.Provider>;
}
