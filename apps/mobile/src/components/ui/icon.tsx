import type { LucideIcon } from "lucide-react-native";
import { useCSSVariable } from "uniwind";

export type IconTone = "foreground" | "background" | "muted" | "primary" | "primary-foreground" | "destructive" | "success" | "warning" | "link" | "border";

const variable: Record<IconTone, string> = {
  foreground: "--color-foreground",
  /** For icons on a bg-foreground fill (inverted in both themes). */
  background: "--color-background",
  muted: "--color-muted-foreground",
  primary: "--color-primary",
  "primary-foreground": "--color-primary-foreground",
  destructive: "--color-destructive",
  success: "--color-success",
  warning: "--color-warning",
  link: "--color-link",
  border: "--color-border",
};

export function useToneColor(tone: IconTone = "foreground") {
  return String(useCSSVariable(variable[tone]) ?? "#888");
}

/** `color` overrides the tone for fixed colours (provider brand colours, status hues). */
export function Icon({ icon: Glyph, tone = "foreground", size = 20, strokeWidth = 1.8, color }: { icon: LucideIcon; tone?: IconTone; size?: number; strokeWidth?: number; color?: string }) {
  const toneColor = useToneColor(tone);
  return <Glyph color={color ?? toneColor} size={size} strokeWidth={strokeWidth} />;
}
