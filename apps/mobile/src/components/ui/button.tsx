import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, type PressableProps, View } from "react-native";
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

export function Button({ label, variant = "primary", size = "md", icon, leading, loading, disabled, className, ...props }: ButtonProps) {
  const style = variants[variant];
  const spinner = useToneColor(style.tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      {...props}
      className={cn("flex-row items-center justify-center disabled:opacity-50", sizes[size], style.box, className)}
    >
      {loading ? <ActivityIndicator size="small" color={spinner} /> : icon ? <Icon icon={icon} tone={style.tone} size={size === "sm" ? 16 : 18} /> : leading ?? null}
      <Text variant="label" className={style.text}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, tone = "foreground", onPress, className, size = 20 }: { icon: LucideIcon; label: string; tone?: IconTone; onPress?: () => void; className?: string; size?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} className={cn("h-10 w-10 items-center justify-center rounded-md active:bg-accent", className)}>
      <View pointerEvents="none"><Icon icon={icon} tone={tone} size={size} /></View>
    </Pressable>
  );
}
