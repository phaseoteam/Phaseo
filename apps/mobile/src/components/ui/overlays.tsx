import { CircleAlert, CircleCheck, Info, X } from "lucide-react-native";
import { useEffect, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { cancelAnimation, FadeInUp, FadeOutUp, LinearTransition, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { useLayout } from "@/hooks/useLayout";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { EASE_IN_OUT, EASE_OUT, project, rubberband, SHEET_SPRING, SNAP_BACK_SPRING, useReleaseVelocity } from "@/lib/motion";
import { Button } from "./button";
import { Sheet } from "./dialog";
import { Icon } from "./icon";
import { closeActions, dismissToast, onToast, overlayStore, settleConfirm, type ConfirmRequest, type Toast } from "./overlayStore";
import { ActionMenu } from "./select";
import { Text } from "./text";

/**
 * Draws the app's own confirmations, action menus and toasts (see overlayStore), in place of the
 * system's alert dialogs. Mounted once at the root, above every screen.
 */
export function OverlayHost() {
  const { confirm, menu, toasts } = overlayStore.use();
  // An outcome toast is felt as well as seen; a neutral notice isn't.
  useEffect(() => {
    onToast((shown) => {
      if (shown.tone === "success") haptic("success");
      else if (shown.tone === "error") haptic("error");
    });
    return () => onToast(null);
  }, []);
  return (
    <>
      <ActionMenu open={Boolean(menu?.open)} title={menu?.title} actions={menu?.actions ?? []} anchor={menu?.anchor} onClose={closeActions} />
      <Sheet open={Boolean(confirm?.open)} onClose={() => settleConfirm(false)}>
        {confirm ? <ConfirmBody request={confirm} /> : null}
      </Sheet>
      <ToastStack toasts={toasts} />
    </>
  );
}

/** One confirmation: title, a sentence, then Cancel and the action (red when destructive). */
function ConfirmBody({ request }: { request: ConfirmRequest }) {
  const { split } = useLayout();
  return (
    <View accessibilityRole="alert" className={split ? "p-5" : "px-4 pb-1 pt-2"}>
      <Text variant="heading">{request.title}</Text>
      {request.body ? <Text variant="muted" className="mt-1.5">{request.body}</Text> : null}
      {split ? (
        <View className="mt-6 flex-row justify-end gap-2">
          <Button label={request.cancelLabel} variant="outline" size="sm" onPress={() => settleConfirm(false)} />
          <Button label={request.confirmLabel} variant={request.destructive ? "danger" : "primary"} size="sm" onPress={() => settleConfirm(true)} />
        </View>
      ) : (
        <View className="mt-5 gap-2">
          <Button label={request.confirmLabel} variant={request.destructive ? "danger" : "primary"} onPress={() => settleConfirm(true)} />
          <Button label={request.cancelLabel} variant="outline" onPress={() => settleConfirm(false)} />
        </View>
      )}
    </View>
  );
}

const TOAST_ICONS = { neutral: { icon: Info, tone: "muted" }, success: { icon: CircleCheck, tone: "success" }, error: { icon: CircleAlert, tone: "destructive" } } as const;

// Toasts rise into place and leave upwards, the way a swipe sends them, a little faster than they arrive.
const TOAST_ENTER = FadeInUp.duration(180).easing(EASE_OUT);
const TOAST_EXIT = FadeOutUp.duration(150).easing(EASE_OUT);
const TOAST_REFLOW = LinearTransition.duration(200).easing(EASE_IN_OUT);
/** How far up (px, where a flick would come to rest) a toast has to go to be dismissed. */
const TOAST_DISMISS_AT = 40;

/**
 * Toasts sit under the status bar, so the keyboard and the composer never hide them. The stack stays mounted when
 * it's empty, so the last toast still plays its exit.
 */
function ToastStack({ toasts }: { toasts: Toast[] }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 top-0 items-center gap-2 px-3" style={{ paddingTop: insets.top + 8 }}>
      {toasts.map((entry) => {
        const meta = TOAST_ICONS[entry.tone];
        return (
          // Reanimated views take styles only; the themed box is a core View inside. When one leaves, the rest slide
          // up into its place rather than jumping.
          <Animated.View key={entry.id} entering={TOAST_ENTER} exiting={TOAST_EXIT} layout={TOAST_REFLOW} style={{ width: "100%", maxWidth: 480 }}>
            <SwipeAway onDismiss={() => dismissToast(entry.id)}>
              <View
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                className={cn("flex-row items-start gap-2.5 rounded-md border bg-popover py-3 pl-3.5 pr-2", entry.tone === "error" ? "border-destructive/40" : "border-border")}
                style={{ elevation: 6, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}
              >
                <View className="pt-0.5"><Icon icon={meta.icon} tone={meta.tone} size={17} /></View>
                <View className="flex-1">
                  {entry.title ? <Text variant="label">{entry.title}</Text> : null}
                  <Text variant={entry.title ? "muted" : "small"} className={entry.title ? "mt-0.5 text-[13px] leading-[18px]" : "font-medium"}>{entry.message}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} onPress={() => dismissToast(entry.id)} className="h-6 w-6 items-center justify-center rounded-md active:bg-accent">
                  <Icon icon={X} tone="muted" size={14} />
                </Pressable>
              </View>
            </SwipeAway>
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * A toast follows a finger up and is dismissed by a flick up (or a drag most of its height); let go short of that, it
 * springs back. Dragged down it resists, since there's nowhere for it to go. The × stays for screen readers.
 */
function SwipeAway({ onDismiss, children }: { onDismiss: () => void; children: ReactNode }) {
  const offset = useSharedValue(0);
  const height = useSharedValue(0);
  const dragFrom = useSharedValue(0);
  const speed = useReleaseVelocity();
  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-16, 16],
    onActivate: (event) => {
      "worklet";
      // From where it is now, even springing back or flying off, so catching it never makes it jump.
      cancelAnimation(offset);
      dragFrom.set(offset.get());
      speed.start(event.translationY);
    },
    onUpdate: (event) => {
      "worklet";
      speed.track(event.translationY);
      const y = dragFrom.get() + event.translationY;
      offset.set(y <= 0 ? y : rubberband(y, height.get()));
    },
    onDeactivate: (event) => {
      "worklet";
      const velocity = speed.release(event.velocityY);
      const travel = offset.get() + project(velocity);
      if (!event.canceled && (travel < -TOAST_DISMISS_AT || offset.get() < -height.get() / 2)) {
        // Off the top with the flick's speed, then gone (unless it's caught again on the way).
        offset.set(withSpring(-(height.get() + 80), { ...SHEET_SPRING, velocity, overshootClamping: true }, (finished) => {
          if (finished) scheduleOnRN(onDismiss);
        }));
        return;
      }
      offset.set(withSpring(0, { ...SNAP_BACK_SPRING, velocity }));
    },
  });
  const style = useAnimatedStyle(() => ({
    opacity: height.get() > 0 ? 1 - Math.min(1, Math.max(0, -offset.get() / height.get()) * 0.6) : 1,
    transform: [{ translateY: offset.get() }],
  }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style} onLayout={(event) => height.set(event.nativeEvent.layout.height)}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
