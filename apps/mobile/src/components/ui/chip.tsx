import { BADGE_TONES, type BadgeTone } from "@phaseo/app-kit/ui-recipes";
import { ChevronDown, type LucideIcon } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { Icon } from "./icon";
import { Text } from "./text";

/** A filter chip (one with `selected`) ticks when it's turned on or off; a dropdown chip or a plain action doesn't. */
export function Chip({ label, selected, onPress, icon, leading, dropdown, className }: { label: string; selected?: boolean; onPress?: () => void; icon?: LucideIcon; leading?: React.ReactNode; dropdown?: boolean; className?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress && selected !== undefined && !dropdown ? () => { haptic("selection"); onPress(); } : onPress}
      className={cn("h-8 flex-row items-center gap-1.5 rounded-md border px-3", selected ? "border-primary bg-primary" : "border-border bg-background active:bg-accent", className)}
    >
      {icon ? <Icon icon={icon} tone={selected ? "primary-foreground" : "muted"} size={14} /> : leading ?? null}
      <Text variant="small" className={cn("font-semibold", selected ? "text-primary-foreground" : "text-foreground")}>{label}</Text>
      {dropdown ? <Icon icon={ChevronDown} tone={selected ? "primary-foreground" : "muted"} size={14} /> : null}
    </Pressable>
  );
}

export function ChipRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" className={cn("grow-0", className)} contentContainerClassName="gap-2 px-4">
      {children}
    </ScrollView>
  );
}

/** Small inline label, e.g. "Free", "On Phaseo", "Deprecated". The tones are shared (packages/shared/app-kit/src/ui-recipes/badge.ts). */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const { surface, text } = BADGE_TONES[tone];
  return (
    <View className={cn("rounded-md px-1.5 py-0.5", surface)}>
      <Text variant="caption" className={cn("font-semibold", text)}>{label}</Text>
    </View>
  );
}
