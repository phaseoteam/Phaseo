import { Archive, BellOff, Bell, CircleCheck, RotateCcw, type LucideIcon } from "lucide-react-native";
import { useContext, useMemo, useRef, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { acquireSwipeLock, releaseSwipeLock, SwipeLockContext } from "@/components/shell/swipeLock";
import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import type { PhoneChat } from "./protocol";
import { swipeActions, type SwipeAction } from "./threadActions";

const ICONS: Record<string, LucideIcon> = { settle: CircleCheck, unsettle: RotateCcw, archive: Archive, snooze: BellOff, wake: Bell };
const TONES: Record<SwipeAction["tone"], { box: string; text: string; icon: "primary-foreground" | "destructive-foreground" | "foreground" }> = {
  primary: { box: "bg-primary", text: "text-primary-foreground", icon: "primary-foreground" },
  destructive: { box: "bg-destructive", text: "text-destructive-foreground", icon: "destructive-foreground" },
  neutral: { box: "bg-muted", text: "text-foreground", icon: "foreground" },
};

/**
 * A thread row that swipes left to show the window's two quick actions (see swipeActions), the main one at the edge.
 * The sidebar is a drawer that also takes drags, so a touch that lands on the row takes the drawer's swipe lock until
 * the finger lifts, as sideways-scrolling rows do (see swipeLock): the drag moves the row, never the sidebar.
 */
export function ThreadRowActions({ chat, enabled, onAction, children }: { chat: PhoneChat; enabled: boolean; onAction(action: SwipeAction): void; children: ReactNode }) {
  const lock = useContext(SwipeLockContext);
  const swipeable = useRef<SwipeableMethods>(null);
  const gesture = useMemo(() => {
    if (!lock) return null;
    const release = () => {
      "worklet";
      releaseSwipeLock(lock);
    };
    // A manual gesture never activates, so it only watches the touches the row's own pan handles.
    return Gesture.Manual()
      .onTouchesDown(() => {
        "worklet";
        // eslint-disable-next-line react-hooks/purity -- runs on touch-down, on the UI thread, never during render
        acquireSwipeLock(lock, Date.now());
      })
      .onTouchesUp((event) => {
        "worklet";
        if (event.numberOfTouches === 0) release();
      })
      .onTouchesCancelled(release);
  }, [lock]);
  if (!enabled) return children;
  const actions = swipeActions(chat);
  const row = (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      onSwipeableWillOpen={() => haptic("selection")}
      renderRightActions={() => (
        <View className="flex-row pr-2">
          {actions.map((action) => {
            const tone = TONES[action.tone];
            return (
              <Pressable
                key={action.key}
                accessibilityRole="button"
                accessibilityLabel={`${action.label} ${chat.title}`}
                onPress={() => { swipeable.current?.close(); onAction(action); }}
                className={cn("ml-1 w-[72px] items-center justify-center gap-1 rounded-md", tone.box)}
              >
                <Icon icon={ICONS[action.key] ?? CircleCheck} tone={tone.icon} size={16} />
                <Text variant="caption" className={cn("font-semibold", tone.text)}>{action.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    >
      <View className="bg-background">{children}</View>
    </ReanimatedSwipeable>
  );
  return gesture ? <GestureDetector gesture={gesture}><View collapsable={false}>{row}</View></GestureDetector> : row;
}
