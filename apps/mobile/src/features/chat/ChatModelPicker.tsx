import { LegendList } from "@legendapp/list/react-native";
import { useRouter } from "expo-router";
import { Check, Search, Sparkles, Star, X } from "lucide-react-native";
import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Badge, Button, Chip, ChipRow, EmptyState, ErrorState, Header, Icon, SearchField, SkeletonRows, Text, toast, useToneColor } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatPrice, formatTokens } from "@/lib/format";
import { useAppearance } from "@/providers/AppearanceProvider";
import { toggleFavouriteModel, useFavourites } from "./favourites";
import { isNewModel, isSelectable, normaliseFavouriteId, pickerSections, type ChatModelOption, type PickerFilters, type PickerSection } from "./modelOptions";
import { useChatModelOptions } from "./models";
import { chatModelStore, MAX_CHAT_MODELS, setModelsFor, useChat } from "./state";

type Item = { type: "header"; key: string; section: PickerSection } | { type: "model"; key: string; option: ChatModelOption; section: PickerSection["kind"] };

const STAR = { light: "#d97706", dark: "#fbbf24" };

/** Lab, context and price, the facts the website's picker rows and hover cards show. */
function facts(option: ChatModelOption) {
  const parts = [option.orgName];
  if (option.contextWindow) parts.push(`${formatTokens(option.contextWindow)} context`);
  const price = (value: number) => (value === 0 ? "$0" : formatPrice(value));
  if (!option.free && option.inputPrice != null && option.outputPrice != null) parts.push(`${price(option.inputPrice)} in · ${price(option.outputPrice)} out`);
  return parts.join(" · ");
}

const PickerRow = memo(function PickerRow({ option, selected, favourite, isNew, onToggle, onStar }: { option: ChatModelOption; selected: boolean; favourite: boolean; isNew: boolean; onToggle(option: ChatModelOption): void; onStar(option: ChatModelOption): void }) {
  const { resolved } = useAppearance();
  const muted = useToneColor("muted");
  const soon = !isSelectable(option);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`${option.label}, ${option.orgName}`}
      accessibilityState={{ checked: selected, disabled: soon }}
      onPress={() => onToggle(option)}
      className={cn("flex-row items-center gap-3 pl-4 pr-2 active:bg-accent", selected && "bg-accent")}
    >
      <View className={cn(soon && "opacity-60")}>
        <Logo id={option.orgId} label={option.orgName} size={32} />
        {selected ? (
          <View className="absolute -right-1 -top-1 h-4 w-4 items-center justify-center rounded-[4px] bg-primary">
            <Icon icon={Check} tone="primary-foreground" size={11} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <View className={cn("min-h-[60px] flex-1 justify-center py-2", soon && "opacity-60")}>
        <View className="flex-row items-center gap-1.5">
          <Text variant="body" numberOfLines={1} className={cn("shrink", selected ? "font-bold" : "font-semibold")}>{option.label}</Text>
          {option.free ? <Badge label="Free" tone="success" /> : null}
          {isNew && !soon ? <Badge label="New" tone="primary" /> : null}
          {option.status === "deprecated" ? <Badge label="Deprecated" tone="warning" /> : null}
          {soon ? <Badge label="Coming soon" /> : null}
        </View>
        <Text variant="caption" numberOfLines={1} className="mt-0.5">{facts(option)}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={favourite ? `Remove ${option.label} from favourites` : `Add ${option.label} to favourites`}
        hitSlop={6}
        onPress={() => onStar(option)}
        className="h-10 w-10 items-center justify-center rounded-md active:bg-accent"
      >
        <Star size={18} strokeWidth={1.8} color={favourite ? STAR[resolved] : muted} fill={favourite ? STAR[resolved] : "none"} />
      </Pressable>
    </Pressable>
  );
});

function SectionHeader({ section }: { section: PickerSection }) {
  const { resolved } = useAppearance();
  return (
    <View className="flex-row items-center gap-1.5 px-4 pb-1 pt-4">
      {section.kind === "favourites" ? <Star size={14} color={STAR[resolved]} fill={STAR[resolved]} /> : null}
      <Text variant="label" className={section.kind === "coming-soon" ? "text-muted-foreground" : undefined}>{section.title}</Text>
    </View>
  );
}

/**
 * Picks the models that answer, like the website's RoomModelSelector: ranked search, Free and New
 * filters, favourites first, then everything by release month (newest first), then coming soon.
 * Several models can answer at once, up to MAX_CHAT_MODELS. With `chatId` it changes that chat's
 * models from the next message; otherwise the new chat's.
 */
export function ChatModelPicker({ chatId }: { chatId: string | null }) {
  const router = useRouter();
  const { options, byId, isLoading, error, refetch } = useChatModelOptions();
  const favourites = useFavourites(options);
  const draft = chatModelStore.use();
  const { chat } = useChat(chatId);
  const selected = useMemo(() => (chatId ? chat?.models ?? [] : draft), [chatId, chat?.models, draft]);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [filters, setFilters] = useState<PickerFilters>({ free: false, new: false });
  const [nowMs] = useState(() => Date.now());
  const favouriteSet = useMemo(() => new Set(favourites), [favourites]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const section of pickerSections({ options, query: deferred, favourites, filters, nowMs })) {
      out.push({ type: "header", key: `h:${section.key}`, section });
      for (const option of section.items) out.push({ type: "model", key: `${section.key}:${option.modelId}`, option, section: section.kind });
    }
    return out;
  }, [options, deferred, favourites, filters, nowMs]);

  const toggle = useCallback((option: ChatModelOption) => {
    if (!isSelectable(option)) return void toast(`${option.label} isn't on Phaseo yet.`);
    if (selected.includes(option.modelId)) {
      if (selected.length === 1) return void toast("A chat needs at least one model.");
      setModelsFor(chatId, selected.filter((id) => id !== option.modelId));
    } else {
      if (selected.length >= MAX_CHAT_MODELS) return void toast(`Up to ${MAX_CHAT_MODELS} models can answer at once. Remove one first.`);
      setModelsFor(chatId, [...selected, option.modelId]);
    }
  }, [chatId, selected]);
  const star = useCallback((option: ChatModelOption) => toggleFavouriteModel(favourites, option.modelId), [favourites]);

  const renderItem = useCallback(({ item }: { item: Item }) => item.type === "header"
    ? <SectionHeader section={item.section} />
    : <PickerRow option={item.option} selected={selected.includes(item.option.modelId)} favourite={favouriteSet.has(normaliseFavouriteId(item.option.modelId))} isNew={isNewModel(item.option.releaseDate, nowMs)} onToggle={toggle} onStar={star} />,
  [selected, favouriteSet, nowMs, toggle, star]);

  return (
    <View className="flex-1">
      <Header
        title="Select models"
        subtitle={`${selected.length} of ${MAX_CHAT_MODELS} selected${chatId ? " · from your next message" : selected.length > 1 ? " · they answer side by side" : ""}`}
        right={<Button label="Done" size="sm" variant="ghost" onPress={() => router.back()} />}
      />
      {selected.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="grow-0" contentContainerClassName="gap-1.5 px-4 pb-2">
          {selected.map((id) => {
            const option = byId.get(id);
            const label = option?.label ?? id.split("/").at(-1) ?? id;
            return (
              <View key={id} className="h-8 flex-row items-center gap-1.5 rounded-md border border-border pl-2">
                <Logo id={option?.orgId ?? id.split("/")[0]} label={option?.orgName} size={16} bare />
                <Text variant="small" numberOfLines={1} className="max-w-[160px] font-medium">{label}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} hitSlop={6} disabled={selected.length === 1} onPress={() => setModelsFor(chatId, selected.filter((entry) => entry !== id))} className="h-8 w-7 items-center justify-center rounded-md active:bg-accent disabled:opacity-30">
                  <Icon icon={X} tone="muted" size={14} />
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      ) : null}
      <View className="px-4 pb-2"><SearchField value={query} onChangeText={setQuery} placeholder="Search models, labs or providers" /></View>
      <ChipRow className="pb-2">
        <Chip label="Free" icon={Sparkles} selected={filters.free} onPress={() => setFilters((current) => ({ ...current, free: !current.free }))} />
        <Chip label="New" selected={filters.new} onPress={() => setFilters((current) => ({ ...current, new: !current.new }))} />
      </ChipRow>
      {isLoading ? <SkeletonRows /> : error && !options.length ? <ErrorState error={error} onRetry={refetch} /> : (
        // The list scrolls under nothing: without clipping, rows drew behind the filters above it.
        <View className="flex-1 overflow-hidden">
        <LegendList
          data={items}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          renderItem={renderItem}
          extraData={selected}
          estimatedItemSize={60}
          recycleItems
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={<EmptyState icon={Search} title="No models found" body={filters.free || filters.new ? "Try without the filters." : "Search looks through model names, labs and providers."} />}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
        </View>
      )}
    </View>
  );
}
