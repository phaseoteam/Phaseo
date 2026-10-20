import { ChevronRight, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View, type AccessibilityActionEvent } from "react-native";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Text } from "./text";

/** A bold sentence-case heading over flat rows (no cards, no caps labels). */
export function Section({ title, description, action, children, className }: { title?: string; description?: string; action?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <View className={cn("mt-6", className)}>
      {title || action ? (
        <View className="mb-1 flex-row items-end justify-between gap-3 px-4">
          <View className="flex-1">
            {title ? <Text variant="heading">{title}</Text> : null}
            {description ? <Text variant="muted" className="mt-0.5">{description}</Text> : null}
          </View>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export type RowProps = {
  title: string;
  subtitle?: string | null;
  icon?: LucideIcon;
  leading?: ReactNode;
  trailing?: ReactNode;
  value?: string | null;
  onPress?: () => void;
  /** Also offered to screen readers as an action named `longPressLabel` ("Copy version"). */
  onLongPress?: () => void;
  longPressLabel?: string;
  selected?: boolean;
  destructive?: boolean;
  chevron?: boolean;
  last?: boolean;
  numberOfLines?: number;
  className?: string;
};

export function Row({ title, subtitle, icon, leading, trailing, value, onPress, onLongPress, longPressLabel, selected, destructive, chevron, last, numberOfLines = 1, className }: RowProps) {
  const content = (
    <>
      {leading ?? (icon ? <View className="w-7 items-center"><Icon icon={icon} tone={destructive ? "destructive" : "muted"} size={19} /></View> : null)}
      <View className={cn("min-h-[52px] flex-1 flex-row items-center gap-3 py-3", !last && "border-b border-border")}>
        <View className="flex-1">
          <Text variant="body" numberOfLines={numberOfLines} className={cn(destructive && "text-destructive", selected && "font-semibold")}>{title}</Text>
          {subtitle ? <Text variant="caption" numberOfLines={2} className="mt-0.5">{subtitle}</Text> : null}
        </View>
        {value ? <Text variant="muted" numberOfLines={1} className="max-w-[55%] text-right">{value}</Text> : null}
        {trailing}
        {chevron ?? Boolean(onPress) ? <Icon icon={ChevronRight} tone="muted" size={17} /> : null}
      </View>
    </>
  );
  const box = cn("flex-row items-center gap-3 pl-4 pr-3", selected && "bg-accent", className);
  if (!onPress) return <View className={box}>{content}</View>;
  const longPress = onLongPress ? {
    onLongPress,
    accessibilityActions: [{ name: "activate" }, { name: "longpress", label: longPressLabel }],
    onAccessibilityAction: (event: AccessibilityActionEvent) => (event.nativeEvent.actionName === "longpress" ? onLongPress() : onPress()),
  } : {};
  return <Pressable accessibilityRole="button" onPress={onPress} {...longPress} className={cn(box, "active:bg-accent")}>{content}</Pressable>;
}

/** Label/value line for facts (pricing, limits, dates). */
export function Fact({ label, value, last }: { label: string; value?: ReactNode; last?: boolean }) {
  // Unknown values ("—" from the formatters) are left out rather than shown as a dash.
  if (value == null || value === "" || value === "—") return null;
  return (
    <View className="pl-4">
      <View className={cn("flex-row items-start justify-between gap-4 py-3 pr-4", !last && "border-b border-border")}>
        <Text variant="muted" className="flex-1">{label}</Text>
        {typeof value === "string" || typeof value === "number" ? <Text variant="small" className="max-w-[60%] text-right font-semibold" selectable>{String(value)}</Text> : value}
      </View>
    </View>
  );
}

export function Divider({ className }: { className?: string }) {
  return <View className={cn("h-px bg-border", className)} />;
}
