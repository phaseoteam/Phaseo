import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { type LayoutChangeEvent, Modal, Pressable, useWindowDimensions, View } from "react-native";
import { GestureDetector, GestureHandlerRootView, usePanGesture } from "react-native-gesture-handler";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { cancelAnimation, Extrapolation, interpolate, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { useLayout } from "@/hooks/useLayout";
import { cn } from "@/lib/cn";
import { project, rubberband, SHEET_SPRING, SNAP_BACK_SPRING } from "@/lib/motion";
import { dialogFrame, type DialogSize } from "./overlay";
import { Screen } from "./screen";

/**
 * A centred dialog over a dimmed backdrop (tablets): rounded-md, up to 560 dp wide and 85% high.
 * Tapping the backdrop closes it; the system Back closes it through the Modal or the route. It shrinks
 * (and its lists scroll) when the keyboard leaves less room than its height.
 */
export function DialogFrame({ children, onClose, size = "fit" }: { children: ReactNode; onClose: () => void; size?: DialogSize }) {
  const window = useWindowDimensions();
  const frame = dialogFrame(window, size);
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="absolute inset-0 bg-black/40" />
      <View pointerEvents="box-none" className="flex-1 items-center justify-center p-6">
        <View accessibilityViewIsModal className="overflow-hidden rounded-md border border-border bg-popover" style={{ width: frame.width, maxHeight: frame.maxHeight, height: frame.height, minHeight: size === "fit" ? 160 : undefined, flexShrink: 1 }}>
          {children}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Content that isn't a short list of options (filters, forms): a bottom drawer on phones, a centred
 * dialog on tablets, where a full-width drawer would stretch across both panes.
 */
export function Sheet({ open, onClose, children, size = "fit", className }: { open: boolean; onClose: () => void; children: ReactNode; size?: DialogSize; className?: string }) {
  const { split } = useLayout();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {split ? (
        <DialogFrame onClose={onClose} size={size}>{children}</DialogFrame>
      ) : (
        <BottomDrawer onClose={onClose} maxHeight="85%" className={className} paddingBottom={insets.bottom + 12}>
          {children}
        </BottomDrawer>
      )}
    </Modal>
  );
}

/**
 * A phone's bottom drawer, drawn inside a transparent Modal: it rises from its own height as it opens, and the
 * grabber on top drags it, so a flick down (or a drag most of the way) closes it and anything less springs it back.
 * Closing otherwise (the backdrop, Back, an action) is the Modal's fade, so a drawer's Modal is gone as quickly as
 * before and an action can open the next one straight away. The backdrop dims with the drawer's position.
 */
export function BottomDrawer({ onClose, maxHeight, paddingBottom, className, children }: { onClose: () => void; maxHeight: `${number}%`; paddingBottom: number; className?: string; children: ReactNode }) {
  const window = useWindowDimensions();
  // Below the screen until it has been measured, then up from its own height.
  const offset = useSharedValue(window.height);
  const height = useSharedValue(0);
  const dragFrom = useSharedValue(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.height;
    const first = height.get() === 0;
    height.set(measured);
    if (!first) return;
    offset.set(measured);
    offset.set(withSpring(0, { ...SHEET_SPRING, reduceMotion: ReduceMotion.System }));
  };

  const drag = usePanGesture({
    failOffsetX: [-20, 20],
    // The grabber's strip is short, so the finger target reaches into the space above and below it (44 pt in all).
    hitSlop: { top: 12, bottom: 16 },
    onActivate: () => {
      "worklet";
      // From where it is now, even mid-animation, so catching it never makes it jump.
      cancelAnimation(offset);
      dragFrom.set(offset.get());
    },
    onUpdate: (event) => {
      "worklet";
      const next = dragFrom.get() + event.translationY;
      offset.set(next >= 0 ? next : rubberband(next, height.get()));
    },
    onDeactivate: (event) => {
      "worklet";
      const full = height.get();
      if (!event.canceled && (offset.get() + project(event.velocityY) > full * 0.4 || offset.get() > full / 2)) {
        offset.set(withSpring(full, { ...SHEET_SPRING, velocity: event.velocityY, overshootClamping: true }, (finished) => {
          if (finished) scheduleOnRN(onClose);
        }));
        return;
      }
      offset.set(withSpring(0, { ...SNAP_BACK_SPRING, velocity: event.velocityY }));
    },
  });

  const drawerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const backdropStyle = useAnimatedStyle(() => {
    const full = height.get();
    return { opacity: full > 0 ? interpolate(offset.get(), [0, full], [1, 0], Extrapolation.CLAMP) : 0 };
  });

  // A Modal is its own native window on Android, so gestures inside it need their own root.
  return (
    <GestureHandlerRootView style={{ flex: 1, justifyContent: "flex-end" }}>
      <Animated.View pointerEvents="box-none" style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, backdropStyle]}>
        <Pressable accessibilityLabel="Close" className="flex-1 bg-black/40" onPress={onClose} />
      </Animated.View>
      {/* Reanimated views take styles only; the themed drawer is a core View inside. */}
      <Animated.View accessibilityViewIsModal style={[{ maxHeight }, drawerStyle]} onLayout={onLayout}>
        <View className={cn("shrink rounded-t-md border-t border-border bg-popover", className)} style={{ paddingBottom }}>
          <GestureDetector gesture={drag}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="h-4 items-center justify-end">
              <View className="h-1 w-9 rounded-sm bg-muted-foreground/30" />
            </View>
          </GestureDetector>
          {children}
        </View>
      </Animated.View>
    </GestureHandlerRootView>
  );
}

/**
 * The body of a route opened as a sheet (sign-in, filters, pickers). Phones keep the native bottom
 * sheet (the stack presents these routes as form sheets); on tablets the stack presents them as
 * transparent modals and this draws the centred dialog.
 */
export function RouteSheet({ children, size = "fit" }: { children: ReactNode; size?: DialogSize }) {
  const { split } = useLayout();
  const router = useRouter();
  if (!split) return <Screen edges={[]} className="bg-popover">{children}</Screen>;
  return <DialogFrame size={size} onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}>{children}</DialogFrame>;
}

/** Stack options for routes drawn with RouteSheet: a native form sheet on phones, a see-through modal on tablets. */
export function routeSheetOptions(split: boolean, detents: number[]) {
  return split
    ? ({ presentation: "transparentModal", animation: "fade", contentStyle: { backgroundColor: "transparent" } } as const)
    : ({ presentation: "formSheet", sheetAllowedDetents: detents, sheetGrabberVisible: true } as const);
}
