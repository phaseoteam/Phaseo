import { LegendList } from "@legendapp/list/react-native";
import { usePathname, useRouter } from "expo-router";
import { Bot, SlidersHorizontal, X } from "lucide-react-native";
import { useCallback, useDeferredValue, useMemo } from "react";
import { RefreshControl, View } from "react-native";
import { useOpenDetail } from "@/components/shell/SplitStack";
import { Button, Chip, ChipRow, EmptyState, ErrorState, Header, IconButton, Screen, SearchField, SkeletonRows, Text } from "@/components/ui";
import type { ModelCard } from "@/lib/api/models";
import { activeFilterCount, DEFAULT_FILTERS, filterModels, type CatalogueSort } from "@/lib/catalogue";
import { compareStore, filtersStore, toggleCompare, updateFilters, useCatalogue } from "./state";
import { ModelRow } from "./ModelRow";

export const SORT_LABELS: Record<CatalogueSort, string> = { newest: "Newest", popular: "Most used", price: "Lowest price", context: "Largest context", name: "Name" };

export function modelHref(id: string) {
  return `/models/${id}` as const;
}

/** The searchable, filterable catalogue. Used as the Models tab on phones and as the list pane on tablets. */
export function ModelBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const openDetail = useOpenDetail("/models");
  const catalogue = useCatalogue();
  const filters = filtersStore.use();
  const comparing = compareStore.use();
  const query = useDeferredValue(filters.query);
  const models = useMemo(() => filterModels(catalogue.data?.models ?? [], { ...filters, query }), [catalogue.data, filters, query]);
  const selectedId = pathname.startsWith("/models/") ? decodeURIComponent(pathname.slice("/models/".length)) : null;
  const filterCount = activeFilterCount(filters);

  const renderItem = useCallback(({ item }: { item: ModelCard }) => (
    <ModelRow
      model={item}
      selected={item.model_id === selectedId}
      comparing={comparing.includes(item.model_id)}
      onPress={() => comparing.length ? toggleCompare(item.model_id) : openDetail(modelHref(item.model_id))}
      onLongPress={() => toggleCompare(item.model_id)}
    />
  ), [selectedId, comparing, openDetail]);

  return (
    <Screen>
      <Header large title="Models" subtitle={catalogue.data ? `${models.length.toLocaleString()} of ${catalogue.data.models.length.toLocaleString()}` : null} right={<IconButton icon={SlidersHorizontal} label="Filters" onPress={() => router.push("/filters/models")} />} />
      <View className="px-4 pb-2">
        <SearchField value={filters.query} onChangeText={(value) => updateFilters({ query: value })} placeholder="Search models, labs or IDs" />
      </View>
      <ChipRow className="pb-2">
        <Chip label={SORT_LABELS[filters.sort]} dropdown onPress={() => router.push("/filters/sort")} />
        <Chip label="On Phaseo" selected={filters.availability === "phaseo"} onPress={() => updateFilters({ availability: filters.availability === "phaseo" ? "all" : "phaseo" })} />
        <Chip label="Free" selected={filters.availability === "free"} onPress={() => updateFilters({ availability: filters.availability === "free" ? "all" : "free" })} />
        <Chip label={filters.organisations.length ? `Labs · ${filters.organisations.length}` : "Labs"} selected={filters.organisations.length > 0} dropdown onPress={() => router.push("/filters/organisations")} />
        <Chip label={filters.inputModalities.length + filters.outputModalities.length ? `Modalities · ${filters.inputModalities.length + filters.outputModalities.length}` : "Modalities"} selected={filters.inputModalities.length + filters.outputModalities.length > 0} dropdown onPress={() => router.push("/filters/models")} />
        {filterCount ? <Chip label="Clear" icon={X} onPress={() => filtersStore.set({ ...DEFAULT_FILTERS, query: filters.query, sort: filters.sort })} /> : null}
      </ChipRow>
      {catalogue.isLoading ? (
        <SkeletonRows />
      ) : catalogue.isError && !catalogue.data ? (
        <ErrorState error={catalogue.error} onRetry={() => void catalogue.refetch()} />
      ) : (
        <LegendList
          data={models}
          keyExtractor={(item) => item.model_id}
          renderItem={renderItem}
          extraData={[selectedId, comparing]}
          estimatedItemSize={63}
          recycleItems
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={catalogue.isRefetching} onRefresh={() => void catalogue.refetch()} />}
          ListEmptyComponent={<EmptyState icon={Bot} title="No models match" body="Try fewer filters or a shorter search." action={filterCount ? "Clear filters" : undefined} onAction={() => filtersStore.set({ ...DEFAULT_FILTERS })} />}
          contentContainerStyle={{ paddingBottom: comparing.length ? 96 : 24 }}
        />
      )}
      {comparing.length ? <CompareTray count={comparing.length} /> : null}
    </Screen>
  );
}

function CompareTray({ count }: { count: number }) {
  const router = useRouter();
  return (
    <View className="absolute bottom-3 left-3 right-3 flex-row items-center gap-2 rounded-xl border border-border bg-popover p-2 pl-4">
      <Text variant="label" className="flex-1">{count === 1 ? "1 model selected" : `${count} models selected`}</Text>
      <Button label="Clear" variant="ghost" size="sm" onPress={() => compareStore.set([])} />
      <Button label="Compare" size="sm" disabled={count < 2} onPress={() => router.push("/compare")} />
    </View>
  );
}
