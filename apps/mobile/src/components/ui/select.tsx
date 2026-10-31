import { Check, ChevronDown, type LucideIcon } from "lucide-react-native";
import { useCallback, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from "react";
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLayout } from "@/hooks/useLayout";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { Icon } from "./icon";
import { placeDropdown, type Anchor } from "./overlay";
import type { MenuAction } from "./overlayStore";
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
 * Where a menu draws: a dropdown at `anchor` on tablets (under or above its trigger, see placeDropdown),
 * a bottom panel on phones. `children` gets whether the compact dropdown rows apply.
 */
function MenuSurface({ open, onClose, anchor, title, children }: { open: boolean; onClose(): void; anchor?: Anchor | null; title?: string; children(compact: boolean): ReactNode }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const { split } = useLayout();
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
            {title ? <Text variant="caption" numberOfLines={1} className="px-4 pb-1 pt-1.5">{title}</Text> : null}
            <ScrollView>{children(true)}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }
  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable className="max-h-[75%] rounded-t-md border-t border-border bg-popover" style={{ paddingBottom: insets.bottom + 8 }} onPress={() => undefined}>
          {title ? <Text variant="label" numberOfLines={1} className="px-4 pb-1 pt-4">{title}</Text> : null}
          <ScrollView contentContainerClassName="py-1">{children(false)}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * A short list of choices. Phones show it in a bottom panel; tablets show a dropdown under the button
 * that opened it (pass `anchor`), like the website's selects. Closes on pick, outside tap or Back.
 */
export function OptionSheet<T extends string>({ open, title, value, options, onChange, onClose, anchor }: { open: boolean; title?: string; value?: T | null; options: SelectOption<T>[]; onChange(value: T): void; onClose(): void; anchor?: Anchor | null }) {
  const pick = (next: T) => {
    if (next !== value) haptic("selection");
    onChange(next);
    onClose();
  };
  return (
    <MenuSurface open={open} onClose={onClose} anchor={anchor} title={title}>
      {(compact) => <OptionList value={value} options={options} onPick={pick} compact={compact} />}
    </MenuSurface>
  );
}

/**
 * Commands for something (a chat, a message, the composer's + button), like the website's dropdown
 * menus: anchored to the trigger or touch point on tablets, a bottom panel on phones. The menu closes
 * before the action runs, so an action can open another dialog.
 */
export function ActionMenu({ open, title, actions, onClose, anchor }: { open: boolean; title?: string; actions: MenuAction[]; onClose(): void; anchor?: Anchor | null }) {
  return (
    <MenuSurface open={open} onClose={onClose} anchor={anchor} title={title}>
      {(compact) => actions.map((action) => (
        <Pressable
          key={action.key}
          accessibilityRole="menuitem"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: action.disabled }}
          disabled={action.disabled}
          onPress={() => { onClose(); action.onPress(); }}
          className={cn("flex-row items-center gap-3 active:bg-accent disabled:opacity-45", compact ? "mx-1 min-h-10 rounded-[4px] px-3 py-2" : "min-h-12 px-4 py-2.5")}
        >
          {action.leading ?? (action.icon ? <Icon icon={action.icon} tone={action.destructive ? "destructive" : "muted"} size={compact ? 16 : 19} /> : null)}
          <View className="flex-1">
            <Text variant={compact ? "small" : "body"} numberOfLines={1} className={cn(action.destructive ? "text-destructive" : "text-foreground", !compact && "font-medium")}>{action.label}</Text>
            {action.description ? <Text variant="caption" numberOfLines={2} className="mt-0.5">{action.description}</Text> : null}
          </View>
        </Pressable>
      ))}
    </MenuSurface>
  );
}

/** A zero-size anchor at a touch point, for menus opened by a long press. */
export function pointAnchor(event: { nativeEvent: { pageX: number; pageY: number } }): Anchor {
  return { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, width: 0, height: 0 };
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
