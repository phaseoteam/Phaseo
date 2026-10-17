import { ChevronDown, type LucideIcon } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Text } from "./text";

export function Chip({ label, selected, onPress, icon, dropdown, className }: { label: string; selected?: boolean; onPress?: () => void; icon?: LucideIcon; dropdown?: boolean; className?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn("h-8 flex-row items-center gap-1.5 rounded-full border px-3", selected ? "border-primary bg-primary" : "border-border bg-background active:bg-accent", className)}
    >
      {icon ? <Icon icon={icon} tone={selected ? "primary-foreground" : "muted"} size={14} /> : null}
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

/** Small inline label, e.g. "Free", "On Phaseo", "Deprecated". */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "primary" | "success" | "warning" | "destructive" }) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    primary: "bg-primary/12 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/12 text-destructive",
  } as const;
  const [bg, fg] = tones[tone].split(" ");
  return (
    <View className={cn("rounded-md px-1.5 py-0.5", bg)}>
      <Text variant="caption" className={cn("font-semibold", fg)}>{label}</Text>
    </View>
  );
}
