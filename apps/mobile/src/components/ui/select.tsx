import { Check, ChevronDown, type LucideIcon } from "lucide-react-native";
import { useCallback, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from "react";
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLayout } from "@/hooks/useLayout";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { placeDropdown, type Anchor } from "./overlay";
import { Text } from "./text";

/** A ref to a core View (RN 0.88 types it as the host element). */
export type ViewRef = ComponentRef<typeof View>;

export type SelectOption<T extends string> = { value: T; label: string; icon?: LucideIcon; leading?: ReactNode; description?: string };

/** Measures a trigger so its menu can open underneath it. Wrap the trigger in `<View ref={ref} collapsable={false}>`. */
export function measureAnchor(ref: RefObject<ViewRef | null>): Promise<Anchor | null> {
  return new Promise((resolve) => {
    const node = ref.current;
    if (!node) return resolve(null);
    node.measureInWindow((x: number, y: number, width: number, height: number) => resolve(width || height ? { x, y, width, height } : null));
  });
}

/** Open/close state for a menu and where it opens from: `show(triggerRef)` measures the trigger first. */
export function useMenu() {
  const [state, setState] = useState<{ open: boolean; anchor: Anchor | null }>({ open: false, anchor: null });
  const show = useCallback(async (trigger: RefObject<ViewRef | null>) => {
    const anchor = await measureAnchor(trigger);
    setState({ open: true, anchor });
  }, []);
  const close = useCallback(() => setState((current) => ({ ...current, open: false })), []);
  return { open: state.open, anchor: state.anchor, show, close };
}

function OptionList<T extends string>({ value, options, onPick, compact }: { value?: T | null; options: SelectOption<T>[]; onPick(value: T): void; compact?: boolean }) {
  return (
    <>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onPick(option.value)}
            className={cn("flex-row items-center gap-3 active:bg-accent", compact ? "mx-1 min-h-10 rounded-[4px] px-3 py-2" : "min-h-12 px-4 py-2.5", selected && "bg-accent")}
          >
            {option.leading ?? (option.icon ? <Icon icon={option.icon} tone={selected ? "foreground" : "muted"} size={compact ? 16 : 18} /> : null)}
            <View className="flex-1">
              <Text variant={compact ? "small" : "body"} numberOfLines={compact ? 1 : undefined} className={cn(selected ? "font-semibold text-foreground" : "text-foreground")}>{option.label}</Text>
              {option.description ? <Text variant="caption" className="mt-0.5">{option.description}</Text> : null}
            </View>
            {selected ? <Icon icon={Check} tone="foreground" size={compact ? 16 : 18} /> : null}
          </Pressable>
        );
      })}
    </>
  );
}

/**
 * A short list of choices. Phones show it in a bottom panel; tablets show a dropdown under the button
 * that opened it (pass `anchor`), like the website's selects. Closes on pick, outside tap or Back.
 */
export function OptionSheet<T extends string>({ open, title, value, options, onChange, onClose, anchor }: { open: boolean; title?: string; value?: T | null; options: SelectOption<T>[]; onChange(value: T): void; onClose(): void; anchor?: Anchor | null }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { split } = useLayout();
  const pick = (next: T) => { onChange(next); onClose(); };
  if (split && anchor) {
    const place = placeDropdown(anchor, window, insets);
    return (
      <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
        <Pressable accessibilityLabel="Close" className="flex-1" onPress={onClose}>
          <Pressable
            accessibilityViewIsModal
            onPress={() => undefined}
            className="absolute overflow-hidden rounded-md border border-border bg-popover py-1"
            style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight, elevation: 8, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}
          >
            {title ? <Text variant="caption" className="px-4 pb-1 pt-1.5">{title}</Text> : null}
            <ScrollView>
              <OptionList value={value} options={options} onPick={pick} compact />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }
  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable className="max-h-[75%] rounded-t-md border-t border-border bg-popover" style={{ paddingBottom: insets.bottom + 8 }} onPress={() => undefined}>
          {title ? <Text variant="label" className="px-4 pb-1 pt-4">{title}</Text> : null}
          <ScrollView contentContainerClassName="py-1">
            <OptionList value={value} options={options} onPick={pick} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** An outlined button showing the current choice, opening an OptionSheet (the website's Select). */
export function Select<T extends string>({ value, options, onChange, title, icon, label, className, size = "md" }: { value: T; options: SelectOption<T>[]; onChange(value: T): void; title?: string; icon?: LucideIcon; label?: string; className?: string; size?: "sm" | "md" }) {
  const menu = useMenu();
  const triggerRef = useRef<ViewRef>(null);
  const current = options.find((option) => option.value === value);
  const glyph = icon ?? current?.icon;
  return (
    <>
      <View ref={triggerRef} collapsable={false} className={className}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title ?? label ?? current?.label}
          accessibilityHint="Opens a list of choices"
          onPress={() => void menu.show(triggerRef)}
          className={cn("flex-row items-center gap-2 rounded-md border border-border bg-background px-3 active:bg-accent", size === "sm" ? "h-9" : "h-10")}
        >
          {glyph ? <Icon icon={glyph} tone="muted" size={16} /> : current?.leading ?? null}
          <Text variant="small" numberOfLines={1} className="flex-1 font-medium">{label ?? current?.label ?? ""}</Text>
          <Icon icon={ChevronDown} tone="muted" size={16} />
        </Pressable>
      </View>
      <OptionSheet open={menu.open} anchor={menu.anchor} title={title} value={value} options={options} onChange={onChange} onClose={menu.close} />
    </>
  );
}
