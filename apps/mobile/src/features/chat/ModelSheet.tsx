import { LegendList } from "@legendapp/list/react-native";
import { Check, ChevronDown, ChevronUp, CircleAlert, Search, Star } from "lucide-react-native";
import { useCallback, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, EmptyState, ErrorState, Icon, SearchField, Sheet, SkeletonRows, Text, useToneColor } from "@/components/ui";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import { useAppearance } from "@/providers/AppearanceProvider";
import { STAR_COLOURS } from "./favourites";
import type { EffortRow, SheetRow } from "./modelSheetRows";

/** How a sheet row shows its model. `favourite` is set only where the sheet can star models. */
export type SheetModel = { id: string; label: string; detail?: string | null; orgId?: string | null; orgName?: string | null; badge?: ReactNode; disabled?: boolean; favourite?: boolean };

/**
 * Picks one model and its effort, for Phaseo chats and new computer threads. It opens tall and stays open while you
 * pick, until dismissed. Fixed at the top: the title, the chosen model with its effort folded into one row (open it
 * for the levels, each marked Default or ticked), search and filters. Below them the rows scroll: favourites and
 * recent first, then a capped list with Show more.
 */
export function ModelSheet<T>({ open, onClose, title = "Model", query, onQuery, controls, rows, describe, selected, selectedId, onPick, onShowMore, onToggleFavourite, effort, error, onRetry, footer }: {
  open: boolean;
  onClose(): void;
  title?: string;
  query: string;
  onQuery(value: string): void;
  /** Filters under the search field. */
  controls?: ReactNode;
  /** Null while the models load. */
  rows: SheetRow<T>[] | null;
  describe(item: T): SheetModel;
  /** The chosen model, shown above the search whether or not it's in the rows below. */
  selected?: SheetModel | null;
  selectedId: string | null;
  onPick(item: T): void;
  /** Called with the row's key. */
  onShowMore(key: string): void;
  /** Stars and unstars a row's model; without it rows have no star. */
  onToggleFavourite?(item: T): void;
  effort?: { model: string; rows: EffortRow[]; onPick(id: string | null): void } | null;
  error?: unknown;
  onRetry?(): void;
  footer?: ReactNode;
}) {
  const renderItem = useCallback(({ item }: { item: SheetRow<T> }) => {
    if (item.type === "heading") return <Text accessibilityRole="header" variant="label" className="px-4 pb-1 pt-5 text-muted-foreground">{item.title}</Text>;
    if (item.type === "note") {
      return (
        <View className="mx-2 flex-row items-center gap-2 rounded-md px-2 py-2.5">
          <Icon icon={CircleAlert} tone="muted" size={16} />
          <Text variant="caption" className="flex-1">{item.text}</Text>
        </View>
      );
    }
    if (item.type === "more") {
      return (
        <Pressable accessibilityRole="button" accessibilityLabel={item.label ?? `Show ${item.hidden} more models`} onPress={() => onShowMore(item.key)} className="mx-2 mt-1 h-12 flex-row items-center gap-2 rounded-md px-2 active:bg-accent">
          <Icon icon={ChevronDown} tone="muted" size={16} />
          <Text variant="body" className="font-medium">{item.label ?? `Show ${item.hidden.toLocaleString()} more`}</Text>
        </Pressable>
      );
    }
    const model = describe(item.item);
    return <ModelRow model={model} selected={model.id === selectedId} onPress={() => onPick(item.item)} onStar={onToggleFavourite ? () => onToggleFavourite(item.item) : undefined} />;
  }, [describe, selectedId, onPick, onShowMore, onToggleFavourite]);

  return (
    <Sheet open={open} onClose={onClose} size="tall" className="h-[92%] max-h-[92%]">
      <View className="flex-1">
        <View className="flex-row items-center pb-1 pl-4 pr-2 pt-3">
          <Text variant="title" className="flex-1">{title}</Text>
          <Button label="Done" size="sm" variant="ghost" onPress={onClose} />
        </View>
        {selected ? <SelectedModel model={selected} effort={effort?.rows.length ? effort : null} /> : null}
        <View className="px-4 pb-3 pt-3"><SearchField value={query} onChangeText={onQuery} placeholder="Search models" /></View>
        {controls ? <View className="pb-3">{controls}</View> : null}
        <View className="h-px bg-border" />
        {rows == null ? (error ? <ErrorState error={error} onRetry={onRetry} /> : <SkeletonRows count={6} />) : (
          <View className="flex-1 overflow-hidden">
            <LegendList
              data={rows}
              keyExtractor={(row) => row.key}
              getItemType={(row) => row.type}
              renderItem={renderItem}
              extraData={selectedId}
              estimatedItemSize={60}
              recycleItems
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              ListEmptyComponent={<EmptyState icon={Search} title="No models found" body={query.trim() ? "Try other words." : undefined} />}
              contentContainerStyle={{ paddingBottom: 16 }}
            />
          </View>
        )}
        {footer}
      </View>
    </Sheet>
  );
}

/**
 * The chosen model, and its effort folded into the same row: "Effort · High" opens the levels in place, so the list
 * keeps the sheet's height until you want them. A model without levels shows just its name.
 */
function SelectedModel({ model, effort }: { model: SheetModel; effort: { model: string; rows: EffortRow[]; onPick(id: string | null): void } | null }) {
  const [expanded, setExpanded] = useState(false);
  const current = effort?.rows.find((row) => row.selected)?.label ?? null;
  const content = (
    <>
      {model.orgId || model.orgName ? <Logo id={model.orgId} label={model.orgName ?? model.label} size={28} /> : null}
      <View className="flex-1">
        <Text variant="body" numberOfLines={1} className="font-semibold">{model.label}</Text>
        <Text variant="caption" numberOfLines={1} className="mt-0.5">{current ? `Effort · ${current}` : "Chosen model"}</Text>
      </View>
      {effort ? <Icon icon={expanded ? ChevronUp : ChevronDown} tone="muted" size={18} /> : null}
    </>
  );
  const box = "mx-2 min-h-[56px] flex-row items-center gap-3 rounded-md px-2 py-1.5";
  return (
    <View className="pt-1">
      {effort ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${model.label}, effort ${current}`}
          accessibilityHint={expanded ? "Hides the effort levels" : "Shows the effort levels"}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          className={cn(box, "active:bg-accent")}
        >
          {content}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={`Chosen model, ${model.label}`} className={box}>{content}</View>
      )}
      {effort && expanded ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={`Effort for ${effort.model}`} className="pb-1 pl-11">
          {effort.rows.map((row) => <EffortOption key={row.id ?? "default"} row={row} onPick={effort.onPick} />)}
        </View>
      ) : null}
    </View>
  );
}

function ModelRow({ model, selected, onPress, onStar }: { model: SheetModel; selected: boolean; onPress(): void; onStar?: () => void }) {
  const { resolved } = useAppearance();
  const muted = useToneColor("muted");
  const star = STAR_COLOURS[resolved];
  return (
    <View className={cn("mx-2 flex-row items-center rounded-md", selected && "bg-accent")}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected, disabled: model.disabled }}
        accessibilityLabel={[model.label, model.orgName, model.detail].filter(Boolean).join(", ")}
        onPress={onPress}
        className={cn("min-h-[60px] flex-1 flex-row items-center gap-3 rounded-md py-2 pl-2 active:bg-accent", !onStar && "pr-2")}
      >
        {model.orgId || model.orgName ? <View className={cn(model.disabled && "opacity-60")}><Logo id={model.orgId} label={model.orgName ?? model.label} size={32} /></View> : null}
        <View className={cn("flex-1", model.disabled && "opacity-60")}>
          <View className="flex-row items-center gap-1.5">
            <Text variant="body" numberOfLines={1} className={cn("shrink", selected ? "font-bold" : "font-medium")}>{model.label}</Text>
            {model.badge}
          </View>
          {model.detail ? <Text variant="caption" numberOfLines={1} className="mt-0.5">{model.detail}</Text> : null}
        </View>
        {selected ? <Icon icon={Check} tone="foreground" size={18} /> : null}
      </Pressable>
      {onStar ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={model.favourite ? `Remove ${model.label} from favourites` : `Add ${model.label} to favourites`}
          onPress={() => { haptic("selection"); onStar(); }}
          className="size-11 items-center justify-center rounded-md active:bg-accent"
        >
          <Star size={18} strokeWidth={1.8} color={model.favourite ? star : muted} fill={model.favourite ? star : "none"} />
        </Pressable>
      ) : null}
    </View>
  );
}

function EffortOption({ row, onPick }: { row: EffortRow; onPick(id: string | null): void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: row.selected }}
      accessibilityLabel={row.isDefault ? `${row.label}, default` : row.label}
      onPress={() => {
        if (!row.selected) haptic("selection");
        onPick(row.id);
      }}
      className="mr-2 h-11 flex-row items-center gap-2 rounded-md px-2 active:bg-accent"
    >
      <Text variant="body" numberOfLines={1} className={cn("flex-1", row.selected && "font-semibold")}>{row.label}</Text>
      {row.isDefault && row.label !== "Default" ? <Text variant="caption">Default</Text> : null}
      {row.selected ? <Icon icon={Check} tone="foreground" size={18} /> : <View className="w-[18px]" />}
    </Pressable>
  );
}
