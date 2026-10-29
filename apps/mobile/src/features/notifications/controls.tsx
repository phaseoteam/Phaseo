import { Minus, Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Button, Icon, Text } from "@/components/ui";
import type { QuietHours } from "./setup";

export const QUIET_PRESETS = [{ start: "22:00", end: "07:00" }, { start: "23:00", end: "08:00" }, { start: "21:00", end: "09:00" }];

const same = (a: QuietHours, b: QuietHours) => Boolean(a && b && a.start === b.start && a.end === b.end);

/** Off and the presets, plus the saved hours when they're none of those (set on the website, say). */
export function QuietHoursChoice({ value, onChange }: { value: QuietHours; onChange(value: QuietHours): void }) {
  const options = value && !QUIET_PRESETS.some((preset) => same(preset, value)) ? [...QUIET_PRESETS, value] : QUIET_PRESETS;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Quiet hours" className="flex-row flex-wrap gap-2 px-4 pt-1">
      <Button label="Off" size="sm" variant={!value ? "primary" : "outline"} accessibilityRole="radio" accessibilityState={{ checked: !value }} accessibilityLabel="No quiet hours" onPress={() => onChange(null)} />
      {options.map((option) => {
        const active = same(option, value);
        return <Button key={`${option.start}-${option.end}`} label={`${option.start}–${option.end}`} size="sm" variant={active ? "primary" : "outline"} accessibilityRole="radio" accessibilityState={{ checked: active }} accessibilityLabel={`Quiet from ${option.start} to ${option.end}`} onPress={() => onChange(option)} />;
      })}
    </View>
  );
}

/** 1 to 100 a day: steps of 1 up to 10, then 5. */
export function DailyCapStepper({ value, onChange }: { value: number; onChange(value: number): void }) {
  return (
    <View className="flex-row items-center gap-4 px-4 pt-2">
      <Stepper icon={Minus} label="Fewer notifications a day" disabled={value <= 1} onPress={() => onChange(Math.max(1, value - (value > 10 ? 5 : 1)))} />
      <Text variant="title" accessibilityLabel={`${value} a day`} accessibilityLiveRegion="polite" className="min-w-12 text-center">{value}</Text>
      <Stepper icon={Plus} label="More notifications a day" disabled={value >= 100} onPress={() => onChange(Math.min(100, value + (value >= 10 ? 5 : 1)))} />
      <Text variant="muted" importantForAccessibility="no" accessibilityElementsHidden>a day</Text>
    </View>
  );
}

function Stepper({ icon, label, disabled, onPress }: { icon: typeof Plus; label: string; disabled?: boolean; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} className="h-10 w-10 items-center justify-center rounded-md border border-border active:bg-accent disabled:opacity-40">
      <Icon icon={icon} size={18} />
    </Pressable>
  );
}
