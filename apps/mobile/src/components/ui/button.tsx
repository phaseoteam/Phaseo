import type { LucideIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, type GestureResponderEvent, Pressable, type PressableProps, View } from "react-native";
import Animated, { cubicBezier, useReducedMotion } from "react-native-reanimated";
import { cn } from "@/lib/cn";
import { Icon, useToneColor, type IconTone } from "./icon";
import { Text } from "./text";

const variants = {
  primary: { box: "bg-primary active:opacity-85", text: "text-primary-foreground", tone: "primary-foreground" },
  secondary: { box: "bg-secondary active:bg-accent", text: "text-secondary-foreground", tone: "foreground" },
  outline: { box: "border border-border bg-background active:bg-accent", text: "text-foreground", tone: "foreground" },
  ghost: { box: "active:bg-accent", text: "text-foreground", tone: "foreground" },
  destructive: { box: "border border-border active:bg-accent", text: "text-destructive", tone: "destructive" },
  /** The confirming action of a destructive dialog (the website's destructive AlertDialogAction). */
  danger: { box: "bg-destructive active:opacity-85", text: "text-destructive-foreground", tone: "destructive-foreground" },
} as const satisfies Record<string, { box: string; text: string; tone: IconTone }>;

const sizes = {
  sm: "h-9 px-3 rounded-md gap-1.5",
  md: "h-11 px-4 rounded-md gap-2",
  lg: "h-12 px-5 rounded-md gap-2",
} as const;

// Reanimated's CSS transitions need an animated component; className still goes to the (Uniwind) Pressable inside.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressed buttons shrink by 3% over 120 ms with a strong ease-out: felt more than seen, and gone on release. */
// Reanimated's CSS easing takes `cubicBezier()`, not a "cubic-bezier(…)" string: the string throws on first render.
const PRESS_TRANSITION = { transitionProperty: "transform", transitionDuration: 120, transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1) } as const;
const PRESSED_SCALE = 0.97;

/**
 * Press feedback for a button: it shrinks while a finger is on it, so the press is felt on press-in rather than when
 * the tap completes. Not when the system asks for reduced motion, where the colour change alone shows the press.
 */
function usePressScale({ onPressIn, onPressOut, disabled }: { onPressIn?: PressableProps["onPressIn"]; onPressOut?: PressableProps["onPressOut"]; disabled?: boolean | null }) {
  const reduced = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const scale = pressed && !disabled && !reduced ? PRESSED_SCALE : 1;
  return {
    onPressIn: (event: GestureResponderEvent) => { setPressed(true); onPressIn?.(event); },
    onPressOut: (event: GestureResponderEvent) => { setPressed(false); onPressOut?.(event); },
    style: [PRESS_TRANSITION, { transform: [{ scale }] }],
  };
}

export type ButtonProps = Omit<PressableProps, "children"> & {
  label: string;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  icon?: LucideIcon;
  /** A logo or other element shown before the label, in place of an icon. */
  leading?: ReactNode;
  loading?: boolean;
  className?: string;
};

export function Button({ label, variant = "primary", size = "md", icon, leading, loading, disabled, className, onPressIn, onPressOut, ...props }: ButtonProps) {
  const style = variants[variant];
  const spinner = useToneColor(style.tone);
  const press = usePressScale({ onPressIn, onPressOut, disabled: disabled || loading });
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      {...props}
      {...press}
      className={cn("flex-row items-center justify-center disabled:opacity-50", sizes[size], style.box, className)}
    >
      {loading ? <ActivityIndicator size="small" color={spinner} /> : icon ? <Icon icon={icon} tone={style.tone} size={size === "sm" ? 16 : 18} /> : leading ?? null}
      <Text variant="label" className={cn(style.text, size === "sm" && "text-[13px]")}>{label}</Text>
    </AnimatedPressable>
  );
}

export function IconButton({ icon, label, tone = "foreground", onPress, className, size = 20 }: { icon: LucideIcon; label: string; tone?: IconTone; onPress?: () => void; className?: string; size?: number }) {
  const press = usePressScale({});
  return (
    <AnimatedPressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} pressRetentionOffset={16} onPress={onPress} {...press} className={cn("h-10 w-10 items-center justify-center rounded-md active:bg-accent", className)}>
      <View pointerEvents="none"><Icon icon={icon} tone={tone} size={size} /></View>
    </AnimatedPressable>
  );
}
