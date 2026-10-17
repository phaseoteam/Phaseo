import type { TabTriggerSlotProps } from "expo-router/ui";
import type { LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

// TabTriggerSlotProps types `ref` as the View component rather than its instance; the trigger works without it.
// It also passes its own `style`, which would replace our classes, so layout lives on inner views.
type Props = TabTriggerSlotProps & { label: string; icon: LucideIcon; layout: "bar" | "rail" | "sidebar" };

export function TabButton({ label, icon, layout, isFocused, ref: _ref, style: _style, ...props }: Props) {
  const tone = isFocused ? "foreground" : "muted";
  const a11y = { accessibilityRole: "tab" as const, accessibilityLabel: label, accessibilityState: { selected: isFocused } };
  if (layout === "bar") {
    return (
      <Pressable {...props} {...a11y} style={{ flex: 1 }}>
        <View className="items-center justify-center gap-1 pb-1 pt-2">
          <Icon icon={icon} tone={tone} size={22} strokeWidth={isFocused ? 2.2 : 1.8} />
          <Text variant="caption" className={cn("text-[11px]", isFocused ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</Text>
        </View>
      </Pressable>
    );
  }
  if (layout === "rail") {
    return (
      <Pressable {...props} {...a11y}>
        <View className="items-center gap-1 py-2">
          <View className={cn("h-9 w-12 items-center justify-center rounded-full", isFocused && "bg-sidebar-accent")}>
            <Icon icon={icon} tone={tone} size={21} strokeWidth={isFocused ? 2.2 : 1.8} />
          </View>
          <Text variant="caption" className={cn("text-[11px]", isFocused ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</Text>
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable {...props} {...a11y}>
      <View className={cn("h-10 flex-row items-center gap-3 rounded-lg px-3", isFocused && "bg-sidebar-accent")}>
        <Icon icon={icon} tone={tone} size={19} strokeWidth={isFocused ? 2.2 : 1.8} />
        <Text variant="body" className={cn(isFocused ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</Text>
      </View>
    </Pressable>
  );
}
