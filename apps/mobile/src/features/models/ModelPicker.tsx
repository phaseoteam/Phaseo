import { LegendList } from "@legendapp/list/react-native";
import { useDeferredValue, useMemo, useState } from "react";
import { View } from "react-native";
import { Chip, ChipRow, SearchField, SkeletonRows } from "@/components/ui";
import type { ModelCard } from "@/lib/api/models";
import { DEFAULT_FILTERS, filterModels, isChatModel, type Availability } from "@/lib/catalogue";
import { ModelRow } from "./ModelRow";
import { useCatalogue } from "./state";

/**
 * Searchable model list for sheets (compare, chat). `onlyChat` keeps to models
 * Phaseo can run for text chat.
 */
export function ModelPicker({ selected, onSelect, onlyChat, initialAvailability = "all" }: { selected: string[]; onSelect(model: ModelCard): void; onlyChat?: boolean; initialAvailability?: Availability }) {
  const catalogue = useCatalogue();
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState<Availability>(onlyChat ? "phaseo" : initialAvailability);
  const deferred = useDeferredValue(query);
  const models = useMemo(() => {
    const base = onlyChat ? (catalogue.data?.models ?? []).filter(isChatModel) : catalogue.data?.models ?? [];
    return filterModels(base, { ...DEFAULT_FILTERS, query: deferred, availability: onlyChat && availability === "all" ? "phaseo" : availability, sort: deferred ? "newest" : "popular" });
  }, [catalogue.data, deferred, availability, onlyChat]);

  return (
    <View className="flex-1">
      <View className="px-4 pb-2"><SearchField value={query} onChangeText={setQuery} placeholder="Search models" autoFocus={false} /></View>
      <ChipRow className="pb-2">
        {!onlyChat ? <Chip label="On Phaseo" selected={availability === "phaseo"} onPress={() => setAvailability(availability === "phaseo" ? "all" : "phaseo")} /> : null}
        <Chip label="Free" selected={availability === "free"} onPress={() => setAvailability(availability === "free" ? (onlyChat ? "phaseo" : "all") : "free")} />
      </ChipRow>
      {catalogue.isLoading ? <SkeletonRows /> : (
        <LegendList
          data={models}
          keyExtractor={(item) => item.model_id}
          extraData={selected}
          estimatedItemSize={63}
          recycleItems
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => <ModelRow model={item} comparing={selected.includes(item.model_id)} onPress={() => onSelect(item)} />}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </View>
  );
}
