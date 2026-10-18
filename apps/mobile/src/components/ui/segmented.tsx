import { Pressable, View } from "react-native";
import { cn } from "@/lib/cn";
import { Text } from "./text";

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: string }[]; onChange(value: T): void; className?: string }) {
  return (
    <View accessibilityRole="tablist" className={cn("flex-row rounded-md bg-muted p-1", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            className={cn("h-8 flex-1 items-center justify-center rounded-sm", active && "bg-background")}
          >
            <Text variant="small" className={cn("font-semibold", active ? "text-foreground" : "text-muted-foreground")}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
