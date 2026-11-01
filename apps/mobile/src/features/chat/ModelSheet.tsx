import { LegendList } from "@legendapp/list/react-native";
import { Check, ChevronDown, Search } from "lucide-react-native";
import { useCallback, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, EmptyState, ErrorState, Icon, SearchField, Sheet, SkeletonRows, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { haptic } from "@/lib/haptics";
import type { EffortRow, SheetRow } from "./modelSheetRows";

/** How a sheet row shows its model. */
export type SheetModel = { id: string; label: string; detail?: string | null; orgId?: string | null; orgName?: string | null; badge?: ReactNode; disabled?: boolean };

/**
 * The composer's model control: the model and its effort in one button ("Claude Opus 5.5 · High"). Without `onPress`
 * it only shows them, for a computer thread whose model can't change from the phone.
 */
export function ModelControl({ label, logos, onPress, disabledReason }: { label: string; logos?: ReactNode; onPress?(): void; disabledReason?: string }) {
  const content = (
    <>
      {logos}
      <Text variant="small" numberOfLines={1} className={cn("shrink font-semibold", !onPress && "text-muted-foreground")}>{label}</Text>
      {onPress ? <Icon icon={ChevronDown} tone="muted" size={14} /> : null}
    </>
  );
  const className = "h-9 max-w-[72%] flex-row items-center gap-2 rounded-md pl-1.5 pr-2";
  if (!onPress) return <View accessible accessibilityLabel={`Model: ${label}${disabledReason ? `. ${disabledReason}` : ""}`} className={className}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Model: ${label}`} accessibilityHint="Choose the model and its effort" onPress={onPress} className={cn(className, "active:bg-accent")}>{content}</Pressable>;
}

/**
 * Picks one model and its effort, for Phaseo chats and new computer threads. It opens at its full height and stays
 * open while you pick, until dismissed: search, the rows (favourites and recent first, then a capped list with Show
 * more), and the selected model's effort levels, each marked Default or checked on the right.
 */
export function ModelSheet<T>({ open, onClose, title = "Model", query, onQuery, controls, rows, describe, selectedId, onPick, onShowMore, effort, error, onRetry, footer }: {
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
  selectedId: string | null;
  onPick(item: T): void;
  onShowMore(): void;
  effort?: { model: string; rows: EffortRow[]; onPick(id: string | null): void } | null;
  error?: unknown;
  onRetry?(): void;
  footer?: ReactNode;
}) {
  const renderItem = useCallback(({ item }: { item: SheetRow<T> }) => {
    if (item.type === "heading") return <Text variant="caption" className="px-4 pb-1 pt-3 font-semibold text-muted-foreground">{item.title}</Text>;
    if (item.type === "more") {
      return (
        <Pressable accessibilityRole="button" accessibilityLabel={`Show ${item.hidden} more models`} onPress={onShowMore} className="mx-2 h-11 justify-center rounded-md px-2 active:bg-accent">
          <Text variant="small" className="font-medium text-muted-foreground">{`Show more (${item.hidden})`}</Text>
        </Pressable>
      );
    }
    const model = describe(item.item);
    return <ModelRow model={model} selected={model.id === selectedId} onPress={() => onPick(item.item)} />;
  }, [describe, selectedId, onPick, onShowMore]);

  return (
    <Sheet open={open} onClose={onClose} size="tall" className="h-[85%]">
      <View className="flex-1">
        <View className="flex-row items-center px-4 pb-2 pt-3">
          <Text variant="heading" className="flex-1">{title}</Text>
          <Button label="Done" size="sm" variant="ghost" onPress={onClose} />
        </View>
        {effort?.rows.length ? (
          <View accessibilityRole="radiogroup" accessibilityLabel={`Effort for ${effort.model}`} className="border-b border-border pb-2">
            <Text variant="caption" numberOfLines={1} className="px-4 pb-1 font-semibold text-muted-foreground">{`Effort · ${effort.model}`}</Text>
            {effort.rows.map((row) => <EffortOption key={row.id ?? "default"} row={row} onPick={effort.onPick} />)}
          </View>
        ) : null}
        <View className="px-4 pb-2 pt-2"><SearchField value={query} onChangeText={onQuery} placeholder="Search models" /></View>
        {controls}
        {rows == null ? (error ? <ErrorState error={error} onRetry={onRetry} /> : <SkeletonRows count={6} />) : (
          <View className="flex-1 overflow-hidden">
            <LegendList
              data={rows}
              keyExtractor={(row) => row.key}
              getItemType={(row) => row.type}
              renderItem={renderItem}
              extraData={selectedId}
              estimatedItemSize={52}
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

function ModelRow({ model, selected, onPress }: { model: SheetModel; selected: boolean; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: model.disabled }}
      accessibilityLabel={[model.label, model.orgName].filter(Boolean).join(", ")}
      onPress={onPress}
      className={cn("mx-2 min-h-[52px] flex-row items-center gap-3 rounded-md px-2 py-1.5 active:bg-accent", selected && "bg-accent")}
    >
      {model.orgId || model.orgName ? <View className={cn(model.disabled && "opacity-60")}><Logo id={model.orgId} label={model.orgName ?? model.label} size={26} /></View> : null}
      <View className={cn("flex-1", model.disabled && "opacity-60")}>
        <View className="flex-row items-center gap-1.5">
          <Text variant="body" numberOfLines={1} className={cn("shrink", selected ? "font-bold" : "font-medium")}>{model.label}</Text>
          {model.badge}
        </View>
        {model.detail ? <Text variant="caption" numberOfLines={1} className="mt-0.5">{model.detail}</Text> : null}
      </View>
      {selected ? <Icon icon={Check} tone="foreground" size={16} /> : null}
    </Pressable>
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
      className="mx-2 h-10 flex-row items-center gap-2 rounded-md px-2 active:bg-accent"
    >
      <Text variant="body" numberOfLines={1} className={cn("flex-1", row.selected && "font-semibold")}>{row.label}</Text>
      {row.selected ? <Icon icon={Check} tone="foreground" size={16} /> : row.isDefault ? <Text variant="caption">Default</Text> : null}
    </Pressable>
  );
}
