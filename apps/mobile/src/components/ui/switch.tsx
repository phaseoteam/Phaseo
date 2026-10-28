import { useEffect, useState } from "react";
import { Pressable, View, type PressableProps } from "react-native";
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";

/**
 * Geometry of the website's switch (apps/web/src/components/ui/switch.tsx): a 2 px border around the thumb, which
 * travels the track's inner width less its own (web's `translate-x-[calc(100%-4px)]`).
 */
export const SWITCH_SIZES = {
  default: { track: "h-5 w-8", thumb: "size-4", width: 32, height: 20, travel: 12 },
  sm: { track: "h-4 w-6", thumb: "size-3", width: 24, height: 16, travel: 8 },
} as const;

const BORDER = 2;
const MIN_TARGET = 44;

/**
 * Touch slop that grows the target to at least 44 × 44, and at least as far as the web's `after:-inset-x-3
 * after:-inset-y-2`.
 */
export function switchHitSlop(size: keyof typeof SWITCH_SIZES) {
  const { width, height } = SWITCH_SIZES[size];
  const x = Math.max(12, Math.ceil((MIN_TARGET - width) / 2));
  const y = Math.max(8, Math.ceil((MIN_TARGET - height) / 2));
  return { top: y, bottom: y, left: x, right: x };
}

/** The tick a switch gives when it turns on or off (`on` is its new value), also for rows that toggle as a whole. */
export function switchHaptic(on: boolean) {
  haptic(on ? "toggleOn" : "toggleOff");
}

export type SwitchProps = Omit<PressableProps, "children" | "onPress" | "disabled" | "style"> & {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  size?: keyof typeof SWITCH_SIZES;
  accessibilityLabel?: string;
  className?: string;
};

/**
 * The website's switch, in place of the platform's: primary when on, the input colour when off, with a round thumb
 * that slides in 150 ms (instantly when the system asks for reduced motion).
 *
 * Fully rounded on purpose (`rounded-2xl`, 18 px, which rounds a 20 px track fully). The app's rule is rounded-md and
 * no pills; the switch is the one exception, kept because it should look exactly like the website's.
 */
export function Switch({ value, onValueChange, disabled, size = "default", accessibilityLabel, className, onFocus, onBlur, ...props }: SwitchProps) {
  const geometry = SWITCH_SIZES[size];
  const progress = useSharedValue(value ? 1 : 0);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 150, reduceMotion: ReduceMotion.System });
  }, [progress, value]);

  const fill = useAnimatedStyle(() => ({ opacity: progress.value }));
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * geometry.travel }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      hitSlop={switchHitSlop(size)}
      {...props}
      disabled={disabled}
      onPress={() => {
        switchHaptic(!value);
        onValueChange?.(!value);
      }}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); onBlur?.(event); }}
      className={cn("relative shrink-0", geometry.track, disabled && "opacity-50", className)}
    >
      {/* Focus ring (keyboards and D-pads): web's `focus-visible:ring-3 ring-ring/30` outside the track. */}
      {focused ? <View pointerEvents="none" className="absolute rounded-2xl border-[3px] border-ring/30" style={{ top: -3, left: -3, right: -3, bottom: -3 }} /> : null}
      {/* Off: `bg-input/90` under a transparent border. On: primary fill and border, faded in with the thumb. */}
      <View pointerEvents="none" className="absolute inset-0 rounded-2xl bg-input/90" />
      {/* Reanimated views take styles only; the themed fill is a core View inside. */}
      <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, fill]}>
        <View className="flex-1 rounded-2xl bg-primary" />
      </Animated.View>
      {focused ? <View pointerEvents="none" className="absolute inset-0 rounded-2xl border-2 border-ring" /> : null}
      <Animated.View pointerEvents="none" style={[{ position: "absolute", top: BORDER, left: BORDER }, thumb]}>
        <View className={cn("rounded-2xl bg-background shadow-sm", geometry.thumb, value ? "dark:bg-primary-foreground" : "dark:bg-foreground")} />
      </Animated.View>
    </Pressable>
  );
}
