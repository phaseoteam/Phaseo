import { Check, ChevronDown, type LucideIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Text } from "./text";

export type SelectOption<T extends string> = { value: T; label: string; icon?: LucideIcon; leading?: ReactNode; description?: string };

/** A list of choices in a bottom panel over the page. Closes on pick or on tapping outside. */
export function OptionSheet<T extends string>({ open, title, value, options, onChange, onClose }: { open: boolean; title?: string; value?: T | null; options: SelectOption<T>[]; onChange(value: T): void; onClose(): void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable className="max-h-[75%] rounded-t-md border-t border-border bg-popover" style={{ paddingBottom: insets.bottom + 8 }} onPress={() => undefined}>
          {title ? <Text variant="label" className="px-4 pb-1 pt-4">{title}</Text> : null}
          <ScrollView contentContainerClassName="py-1">
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => { onChange(option.value); onClose(); }}
                  className={cn("min-h-12 flex-row items-center gap-3 px-4 py-2.5 active:bg-accent", selected && "bg-accent")}
                >
                  {option.leading ?? (option.icon ? <Icon icon={option.icon} tone={selected ? "foreground" : "muted"} size={18} /> : null)}
                  <View className="flex-1">
                    <Text variant="body" className={cn(selected ? "font-semibold text-foreground" : "text-foreground")}>{option.label}</Text>
                    {option.description ? <Text variant="caption" className="mt-0.5">{option.description}</Text> : null}
                  </View>
                  {selected ? <Icon icon={Check} tone="foreground" size={18} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** An outlined button showing the current choice, opening an OptionSheet (the website's Select). */
export function Select<T extends string>({ value, options, onChange, title, icon, label, className, size = "md" }: { value: T; options: SelectOption<T>[]; onChange(value: T): void; title?: string; icon?: LucideIcon; label?: string; className?: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  const glyph = icon ?? current?.icon;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title ?? label ?? current?.label}
        accessibilityHint="Opens a list of choices"
        onPress={() => setOpen(true)}
        className={cn("flex-row items-center gap-2 rounded-md border border-border bg-background px-3 active:bg-accent", size === "sm" ? "h-9" : "h-10", className)}
      >
        {glyph ? <Icon icon={glyph} tone="muted" size={16} /> : current?.leading ?? null}
        <Text variant="small" numberOfLines={1} className="flex-1 font-medium">{label ?? current?.label ?? ""}</Text>
        <Icon icon={ChevronDown} tone="muted" size={16} />
      </Pressable>
      <OptionSheet open={open} title={title} value={value} options={options} onChange={onChange} onClose={() => setOpen(false)} />
    </>
  );
}
