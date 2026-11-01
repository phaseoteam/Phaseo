import { LegendList } from "@legendapp/list/react-native";
import { usePathname, useRouter } from "expo-router";
import { ArrowDownAZ, ArrowUpDown, Bot, Building2, CircleCheck, CircleDollarSign, Clock, Flame, Gift, Maximize2, Shapes, SlidersHorizontal, X, type LucideIcon } from "lucide-react-native";
import { useCallback, useDeferredValue, useMemo, useRef } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Logo } from "@/components/Logo";
import { useOpenDetail } from "@/components/shell/SplitStack";
import { Button, Chip, ChipRow, EmptyState, ErrorState, Header, IconButton, OptionSheet, Screen, SearchField, SkeletonRows, Text, useMenu, type ViewRef } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import type { ModelCard } from "@/lib/api/models";
import { activeFilterCount, DEFAULT_FILTERS, filterModels, type CatalogueSort } from "@/lib/catalogue";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/providers/AuthProvider";
import { ModelsSummary } from "./ModelsSummary";
import { compareStore, filtersStore, toggleCompare, updateFilters, useCatalogue, useLabIds } from "./state";
import { ModelRow } from "./ModelRow";

export const SORT_LABELS: Record<CatalogueSort, string> = { newest: "Newest", popular: "Most used", price: "Lowest price", context: "Largest context", name: "Name" };
export const SORT_ICONS: Record<CatalogueSort, LucideIcon> = { newest: Clock, popular: Flame, price: CircleDollarSign, context: Maximize2, name: ArrowDownAZ };

export function modelHref(id: string) {
  return `/models/${id}` as const;
}

/** Up to three of the chosen labs' logos, overlapping, for the Labs chip. */
function SelectedLabLogos({ names }: { names: string[] }) {
  const labIds = useLabIds();
  if (!names.length) return null;
  return (
    <View className="flex-row">
      {names.slice(0, 3).map((name, index) => (
        <View key={name} style={{ marginLeft: index ? -6 : 0 }}>
          <Logo id={labIds.get(name) ?? name} label={name} size={18} />
        </View>
      ))}
    </View>
  );
}

/** The searchable, filterable catalogue, below the summary on phones; the list pane on tablets. */
export function ModelBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const openDetail = useOpenDetail("/models");
  const { split } = useLayout();
  // On tablets sort is a dropdown under its chip; phones keep the bottom sheet route.
  const sortMenu = useMenu();
  const sortRef = useRef<ViewRef>(null);
  const catalogue = useCatalogue();
  const filters = filtersStore.use();
  const comparing = compareStore.use();
  const query = useDeferredValue(filters.query);
  const models = useMemo(() => filterModels(catalogue.data?.models ?? [], { ...filters, query }), [catalogue.data, filters, query]);
  const selectedId = pathname.startsWith("/models/") ? decodeURIComponent(pathname.slice("/models/".length)) : null;
  const filterCount = activeFilterCount(filters);
  const signedIn = Boolean(useAuth().session);
  const insets = useSafeAreaInsets();
  // Phones show the summary above the whole catalogue; a search or filter goes straight to the matches.
  const summary = !split && !query && !filterCount;

  const renderItem = useCallback(({ item }: { item: ModelCard }) => (
    <ModelRow
      model={item}
      selected={item.model_id === selectedId}
      comparing={comparing.includes(item.model_id)}
      onPress={() => {
        if (!comparing.length) return openDetail(modelHref(item.model_id));
        haptic("selection");
        toggleCompare(item.model_id);
      }}
      onLongPress={() => {
        haptic("longPress");
        toggleCompare(item.model_id);
      }}
    />
  ), [selectedId, comparing, openDetail]);

  return (
    <Screen>
      {/* Signed out, Models is where the app opens, with nothing to go back to. */}
      <Header large back={!split && signedIn} title="Models" subtitle={catalogue.data ? `${models.length.toLocaleString()} of ${catalogue.data.models.length.toLocaleString()}` : null} right={<IconButton icon={SlidersHorizontal} label="Filters" onPress={() => router.push("/filters/models")} />} />
      <View className="px-4 pb-2">
        <SearchField value={filters.query} onChangeText={(value) => updateFilters({ query: value })} placeholder="Search models, labs or IDs" />
      </View>
      <ChipRow className="pb-2">
        <View ref={sortRef} collapsable={false}>
          <Chip label={SORT_LABELS[filters.sort]} icon={ArrowUpDown} dropdown onPress={() => (split ? void sortMenu.show(sortRef) : router.push("/filters/sort"))} />
        </View>
        <Chip label="On Phaseo" icon={CircleCheck} selected={filters.availability === "phaseo"} onPress={() => updateFilters({ availability: filters.availability === "phaseo" ? "all" : "phaseo" })} />
        <Chip label="Free" icon={Gift} selected={filters.availability === "free"} onPress={() => updateFilters({ availability: filters.availability === "free" ? "all" : "free" })} />
        <Chip
          label={filters.organisations.length ? `Labs · ${filters.organisations.length}` : "Labs"}
          icon={filters.organisations.length ? undefined : Building2}
          leading={<SelectedLabLogos names={filters.organisations} />}
          selected={filters.organisations.length > 0}
          dropdown
          onPress={() => router.push("/filters/organisations")}
        />
        <Chip label={filters.inputModalities.length + filters.outputModalities.length ? `Modalities · ${filters.inputModalities.length + filters.outputModalities.length}` : "Modalities"} icon={Shapes} selected={filters.inputModalities.length + filters.outputModalities.length > 0} dropdown onPress={() => router.push("/filters/models")} />
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
          ListHeaderComponent={summary ? <><ModelsSummary /><Text variant="heading" className="px-4 pb-1 pt-6">All models</Text></> : null}
          ListEmptyComponent={<EmptyState icon={Bot} title="No models match" body="Try fewer filters or a shorter search." action={filterCount ? "Clear filters" : undefined} onAction={() => filtersStore.set({ ...DEFAULT_FILTERS })} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + (comparing.length ? 96 : 24) }}
        />
      )}
      {comparing.length ? <CompareTray count={comparing.length} /> : null}
      <OptionSheet
        open={sortMenu.open}
        anchor={sortMenu.anchor}
        title="Sort by"
        value={filters.sort}
        options={(Object.keys(SORT_LABELS) as CatalogueSort[]).map((value) => ({ value, label: SORT_LABELS[value], icon: SORT_ICONS[value] }))}
        onChange={(sort) => updateFilters({ sort })}
        onClose={sortMenu.close}
      />
    </Screen>
  );
}

function CompareTray({ count }: { count: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ bottom: insets.bottom + 12 }} className="absolute left-3 right-3 flex-row items-center gap-2 rounded-md border border-border bg-popover p-2 pl-4">
      <Text variant="label" className="flex-1">{count === 1 ? "1 model selected" : `${count} models selected`}</Text>
      <Button label="Clear" variant="ghost" size="sm" onPress={() => compareStore.set([])} />
      <Button label="Compare" size="sm" disabled={count < 2} onPress={() => router.push("/compare")} />
    </View>
  );
}
