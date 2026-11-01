import { Pressable, View } from "react-native";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { Text } from "./text";

/**
 * Options can give a fuller `accessibilityLabel` where their label is short ("1W" for 1 week), and a `count` shown
 * beside the label when above zero (chats that need you), which the label should then say too.
 */
export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: string; accessibilityLabel?: string; count?: number }[]; onChange(value: T): void; className?: string }) {
  return (
    <View accessibilityRole="tablist" className={cn("flex-row rounded-md bg-muted p-1", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.accessibilityLabel}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) haptic("selection");
              onChange(option.value);
            }}
            className={cn("h-8 flex-1 flex-row items-center justify-center gap-1 rounded-sm", active && "bg-background")}
          >
            <Text variant="small" numberOfLines={1} className={cn("px-1 font-semibold", active ? "text-foreground" : "text-muted-foreground")}>{option.label}</Text>
            {option.count ? <Text variant="caption" className="font-semibold text-warning">{option.count}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
