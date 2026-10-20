import { Check } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { Icon, Text } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { cn } from "@/lib/cn";

const GAP = 8;

/** Tiles per row for a grid's width: three on phones, more where there's room (six on wide panes). */
export function columnsFor(width: number, minTile: number, max: number) {
  return Math.max(1, Math.min(max, Math.floor((width + GAP) / (minTile + GAP))));
}

/** A wrapping grid that sizes its tiles to fill each row evenly. */
export function TileGrid<T>({ items, minTile, max, label, render }: { items: readonly T[]; minTile: number; max: number; label: string; render(item: T, width: number): ReactNode }) {
  const layout = useLayout();
  // On phones the grid spans the screen less its margins, so tiles can show in the first frame; layout corrects it.
  const [width, setWidth] = useState(() => (layout.split ? 0 : layout.width - 32));
  const columns = columnsFor(width, minTile, max);
  // Whole pixels, so rounding never pushes the last tile onto a new row.
  const tile = width > 0 ? Math.floor((width - GAP * (columns - 1)) / columns) : 0;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} className="mx-4 flex-row flex-wrap" style={{ gap: GAP }}>
      {tile > 0 ? items.map((item) => render(item, tile)) : null}
    </View>
  );
}

/** A selectable tile: a swatch, a name and, when chosen, a small check (rounded-md, no pills). */
export function SwatchTile({ name, selected, onPress, width, children, accessibilityLabel }: { name: string; selected: boolean; onPress(): void; width: number; children: ReactNode; accessibilityLabel?: string }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel ?? name}
      onPress={onPress}
      className={cn("rounded-md border p-2 active:bg-accent", selected ? "border-primary" : "border-border")}
      style={{ width }}
    >
      {children}
      <Text variant="small" numberOfLines={1} className={cn("mt-2", selected && "font-semibold")}>{name}</Text>
      {selected ? <SelectedMark /> : null}
    </Pressable>
  );
}

/** The website's check badge, as a small rounded square in the accent with readable text colour. */
export function SelectedMark() {
  return (
    <View pointerEvents="none" className="absolute right-1 top-1 h-4 w-4 items-center justify-center rounded-[4px] bg-primary">
      <Icon icon={Check} tone="primary-foreground" size={11} strokeWidth={3} />
    </View>
  );
}
