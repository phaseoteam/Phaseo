import { Stack, useLocalSearchParams } from "expo-router";
import { Check, CircleCheck, Gift, History } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, Header, Icon, Row, RouteSheet, SearchField, Section, Switch, Text } from "@/components/ui";
import { SORT_ICONS, SORT_LABELS } from "@/features/models/ModelBrowser";
import { filtersStore, toggleValue, updateFilters, useCatalogue, useLabIds } from "@/features/models/state";
import { DEFAULT_FILTERS, type CatalogueSort } from "@/lib/catalogue";
import { modalityLabel } from "@/lib/format";
import { modalityIcon } from "@/lib/modalityIcon";


/** The Models filters (sort, labs and modalities): bottom sheets on phones, dialogs on tablets. */
export default function FilterSheet() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  return (
    <RouteSheet size={kind === "sort" ? "fit" : "tall"}>
      <Stack.Screen options={{ title: kind === "sort" ? "Sort" : kind === "organisations" ? "Labs" : "Filters" }} />
      {kind === "sort" ? <SortSheet /> : kind === "organisations" ? <OrganisationSheet /> : <ModelFilterSheet />}
    </RouteSheet>
  );
}

function Check_({ on }: { on: boolean }) {
  return on ? <Icon icon={Check} tone="primary" size={18} /> : null;
}

function SortSheet() {
  const sort = filtersStore.use((filters) => filters.sort);
  return (
    <ScrollView contentContainerClassName="pb-8">
      <Header title="Sort by" />
      {(Object.keys(SORT_LABELS) as CatalogueSort[]).map((value, index, list) => (
        <Row key={value} icon={SORT_ICONS[value]} title={SORT_LABELS[value]} trailing={<Check_ on={sort === value} />} chevron={false} onPress={() => updateFilters({ sort: value })} last={index === list.length - 1} />
      ))}
    </ScrollView>
  );
}

function OrganisationSheet() {
  const catalogue = useCatalogue();
  const selected = filtersStore.use((filters) => filters.organisations);
  const labIds = useLabIds();
  const [query, setQuery] = useState("");
  const options = useMemo(() => {
    const list = catalogue.data?.facets.creatorOptions ?? [];
    const search = query.trim().toLocaleLowerCase();
    return list.filter((option) => !search || option.value.toLocaleLowerCase().includes(search));
  }, [catalogue.data, query]);
  return (
    <View className="flex-1">
      <Header title="Labs" right={selected.length ? <Button label="Clear" variant="ghost" size="sm" onPress={() => updateFilters({ organisations: [] })} /> : null} />
      <View className="px-4 pb-2"><SearchField value={query} onChangeText={setQuery} placeholder="Search labs" /></View>
      <ScrollView contentContainerClassName="pb-8" keyboardShouldPersistTaps="handled">
        {options.map((option, index) => (
          <Row
            key={option.value}
            leading={<Logo id={labIds.get(option.value) ?? option.value} label={option.value} size={28} />}
            title={option.value}
            value={option.count.toLocaleString()}
            trailing={<Check_ on={selected.includes(option.value)} />}
            chevron={false}
            onPress={() => updateFilters({ organisations: toggleValue(selected, option.value) })}
            last={index === options.length - 1}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function ModelFilterSheet() {
  const catalogue = useCatalogue();
  const filters = filtersStore.use();
  const inputs = catalogue.data?.facets.inputModalityOptions ?? [];
  const outputs = catalogue.data?.facets.outputModalityOptions ?? [];
  return (
    <ScrollView contentContainerClassName="pb-10">
      <Header title="Filters" right={<Button label="Reset" variant="ghost" size="sm" onPress={() => filtersStore.set({ ...DEFAULT_FILTERS, query: filters.query })} />} />
      <Section title="Accepts" className="mt-2">
        {inputs.map((option, index) => (
          <Row key={option.value} icon={modalityIcon(option.value)} title={modalityLabel(option.value)} value={option.count.toLocaleString()} trailing={<Check_ on={filters.inputModalities.includes(option.value)} />} chevron={false} onPress={() => updateFilters({ inputModalities: toggleValue(filters.inputModalities, option.value) })} last={index === inputs.length - 1} />
        ))}
      </Section>
      <Section title="Produces">
        {outputs.map((option, index) => (
          <Row key={option.value} icon={modalityIcon(option.value)} title={modalityLabel(option.value)} value={option.count.toLocaleString()} trailing={<Check_ on={filters.outputModalities.includes(option.value)} />} chevron={false} onPress={() => updateFilters({ outputModalities: toggleValue(filters.outputModalities, option.value) })} last={index === outputs.length - 1} />
        ))}
      </Section>
      <Section title="Availability">
        <Row icon={CircleCheck} title="Only models on Phaseo" chevron={false} trailing={<Switch value={filters.availability === "phaseo"} accessibilityLabel="Only models on Phaseo" onValueChange={(on) => updateFilters({ availability: on ? "phaseo" : "all" })} />} />
        <Row icon={Gift} title="Only free models" chevron={false} trailing={<Switch value={filters.availability === "free"} accessibilityLabel="Only free models" onValueChange={(on) => updateFilters({ availability: on ? "free" : "all" })} />} />
        <Row icon={History} title="Show retired models" chevron={false} last trailing={<Switch value={filters.includeRetired} accessibilityLabel="Show retired models" onValueChange={(on) => updateFilters({ includeRetired: on })} />} />
      </Section>
      <Text variant="caption" className="px-4 pt-4">Filters apply instantly. Swipe down to close.</Text>
    </ScrollView>
  );
}
