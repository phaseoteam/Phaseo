import { View } from "react-native";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Simple daily bars (usage, tokens). Values are already aggregated by the API. */
export function BarChart({ values, labels, height = 96, className }: { values: number[]; labels?: [string, string]; height?: number; className?: string }) {
  const max = Math.max(1, ...values);
  return (
    <View className={cn("px-4", className)}>
      <View className="flex-row items-end gap-[2px]" style={{ height }}>
        {values.map((value, index) => (
          <View key={index} className={cn("flex-1 rounded-t-[2px]", value > 0 ? "bg-chart-3" : "bg-muted")} style={{ height: Math.max(2, (value / max) * height) }} />
        ))}
      </View>
      {labels ? (
        <View className="mt-1.5 flex-row justify-between">
          <Text variant="caption">{labels[0]}</Text>
          <Text variant="caption">{labels[1]}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Horizontal share bars for breakdowns (spend by model). */
export function ShareBar({ fraction }: { fraction: number }) {
  return (
    <View className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
      <View className="h-full rounded-full bg-chart-3" style={{ width: `${Math.max(2, Math.min(100, fraction * 100))}%` }} />
    </View>
  );
}
