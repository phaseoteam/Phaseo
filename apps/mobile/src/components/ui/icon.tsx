import type { LucideIcon } from "lucide-react-native";
import { useCSSVariable } from "uniwind";

export type IconTone = "foreground" | "muted" | "primary" | "primary-foreground" | "destructive" | "success" | "warning";

const variable: Record<IconTone, string> = {
  foreground: "--color-foreground",
  muted: "--color-muted-foreground",
  primary: "--color-primary",
  "primary-foreground": "--color-primary-foreground",
  destructive: "--color-destructive",
  success: "--color-success",
  warning: "--color-warning",
};

export function useToneColor(tone: IconTone = "foreground") {
  return String(useCSSVariable(variable[tone]) ?? "#888");
}

export function Icon({ icon: Glyph, tone = "foreground", size = 20, strokeWidth = 1.8 }: { icon: LucideIcon; tone?: IconTone; size?: number; strokeWidth?: number }) {
  const color = useToneColor(tone);
  return <Glyph color={color} size={size} strokeWidth={strokeWidth} />;
}
