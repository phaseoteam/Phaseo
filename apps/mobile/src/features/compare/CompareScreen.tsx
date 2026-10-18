import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Columns3, Plus, X } from "lucide-react-native";
import { useEffect, useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, EmptyState, Header, Icon, Screen, Text } from "@/components/ui";
import { compareStore, toggleCompare, useCatalogueIndex } from "@/features/models/state";
import { getComparison, getComparisonUsage, MAX_COMPARE, type ComparedModel } from "@/lib/api/compare";
import type { ModelCard } from "@/lib/api/models";
import { contextWindow, modelName, organisationName } from "@/lib/catalogue";
import { cn } from "@/lib/cn";
import { formatCompact, formatDate, formatPrice, formatTokens, modalityLabel } from "@/lib/format";

type Column = { id: string; card?: ModelCard; detail?: ComparedModel; tokens30d?: number | null };
type Better = "high" | "low" | null;
type RowSpec = { label: string; value(column: Column): string; numeric?(column: Column): number | null; better?: Better };

const ROWS: RowSpec[] = [
  { label: "Lab", value: (c) => (c.card ? organisationName(c.card) : c.detail?.provider?.name ?? "—") },
  { label: "Released", value: (c) => formatDate(c.detail?.release_date ?? c.card?.primary_date) },
  { label: "Context window", value: (c) => formatTokens(c.card ? contextWindow(c.card) : c.detail?.input_context_length), numeric: (c) => (c.card ? contextWindow(c.card) : null), better: "high" },
  { label: "Input price", value: (c) => formatPrice(c.card?.lowest_input_price), numeric: (c) => c.card?.lowest_input_price ?? null, better: "low" },
  { label: "Output price", value: (c) => formatPrice(c.card?.lowest_output_price), numeric: (c) => c.card?.lowest_output_price ?? null, better: "low" },
  { label: "Accepts", value: (c) => (c.card?.gateway_input_modalities.length ? c.card.gateway_input_modalities : c.detail?.input_types ?? []).map(modalityLabel).join(", ") || "—" },
  { label: "Produces", value: (c) => (c.card?.gateway_output_modalities.length ? c.card.gateway_output_modalities : c.detail?.output_types ?? []).map(modalityLabel).join(", ") || "—" },
  { label: "Providers on Phaseo", value: (c) => String(c.card?.gateway_active_provider_count ?? 0), numeric: (c) => c.card?.gateway_active_provider_count ?? null, better: "high" },
  { label: "Tokens, last 30 days", value: (c) => formatCompact(c.tokens30d), numeric: (c) => c.tokens30d ?? null, better: "high" },
  { label: "Licence", value: (c) => c.detail?.license ?? "—" },
  { label: "Knowledge cutoff", value: (c) => (c.detail?.knowledge_cutoff ? formatDate(c.detail.knowledge_cutoff) : "—") },
];

function bestIndex(columns: Column[], row: RowSpec) {
  if (!row.numeric || !row.better || columns.length < 2) return -1;
  const values = columns.map(row.numeric);
  const present = values.filter((value): value is number => value != null && value > 0);
  if (present.length < 2) return -1;
  const target = row.better === "high" ? Math.max(...present) : Math.min(...present);
  return values.filter((value) => value === target).length === 1 ? values.indexOf(target) : -1;
}

/** Benchmarks at least two of the compared models report, with each model's best score. */
function sharedBenchmarks(columns: Column[]) {
  const byBenchmark = new Map<string, { name: string; ascending: boolean; scores: (number | null)[] }>();
  columns.forEach((column, index) => {
    for (const result of column.detail?.benchmark_results ?? []) {
      const score = Number(result.score);
      if (!Number.isFinite(score)) continue;
      const entry = byBenchmark.get(result.benchmark_id) ?? { name: result.benchmark?.name ?? result.benchmark_id, ascending: Boolean(result.benchmark?.ascending_order), scores: columns.map(() => null) };
      const current = entry.scores[index];
      entry.scores[index] = current == null ? score : entry.ascending ? Math.min(current, score) : Math.max(current, score);
      byBenchmark.set(result.benchmark_id, entry);
    }
  });
  return [...byBenchmark.values()].filter((entry) => entry.scores.filter((score) => score != null).length >= 2).slice(0, 12);
}

export function CompareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ids?: string }>();
  const ids = compareStore.use();
  const { index, isLoading } = useCatalogueIndex();

  // A shared link (phaseo://compare?ids=a,b) replaces the current selection.
  useEffect(() => {
    if (params.ids) compareStore.set(params.ids.split(",").filter(Boolean).slice(0, MAX_COMPARE));
  }, [params.ids]);

  const key = ids.join(",");
  const details = useQuery({ queryKey: ["public", "compare", key], queryFn: () => getComparison(ids), enabled: ids.length > 0 });
  const usage = useQuery({ queryKey: ["public", "compare-usage", key], queryFn: () => getComparisonUsage(ids), enabled: ids.length > 0 });

  const columns = useMemo<Column[]>(() => ids.map((id) => ({
    id,
    card: index.get(id),
    detail: details.data?.find((model) => model.id === id),
    tokens30d: usage.data?.[id]?.tokens30d ?? null,
  })), [ids, index, details.data, usage.data]);
  const benchmarks = useMemo(() => sharedBenchmarks(columns), [columns]);

  if (!ids.length) {
    return (
      <Screen>
        <Header large title="Compare" />
        <EmptyState className="flex-1" icon={Columns3} title="Pick models to compare" body={`Compare up to ${MAX_COMPARE} models side by side: price, context, modalities, providers and benchmarks.`} action="Choose models" onAction={() => router.push("/sheets/compare")} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header large title="Compare" right={ids.length < MAX_COMPARE ? <Button label="Add" icon={Plus} variant="ghost" size="sm" onPress={() => router.push("/sheets/compare")} /> : null} />
      <ScrollView contentContainerClassName="pb-16">
        <View className="flex-row gap-2 px-4 pb-3">
          {columns.map((column) => (
            <View key={column.id} className="flex-1 items-start gap-1.5">
              <View className="w-full flex-row items-start justify-between">
                <Logo id={column.card?.organisation_id ?? column.id.split("/")[0]} label={column.card ? organisationName(column.card) : undefined} colour={column.card?.organisation_colour} size={28} />
                <Pressable accessibilityLabel={`Remove ${column.card ? modelName(column.card) : column.id}`} hitSlop={10} onPress={() => toggleCompare(column.id)}>
                  <Icon icon={X} tone="muted" size={16} />
                </Pressable>
              </View>
              <Pressable onPress={() => router.push(`/models/${column.id}`)}>
                <Text variant="label" numberOfLines={3}>{column.card ? modelName(column.card) : column.detail?.name ?? column.id}</Text>
              </Pressable>
            </View>
          ))}
        </View>
        {isLoading ? null : ROWS.map((row) => {
          const values = columns.map(row.value);
          // A row nobody has data for (e.g. knowledge cutoff) says nothing; leave it out.
          if (values.every((value) => value === "—")) return null;
          return <CompareRow key={row.label} label={row.label} values={values} best={bestIndex(columns, row)} />;
        })}
        {benchmarks.length ? (
          <>
            <Text variant="heading" className="px-4 pb-1 pt-6">Benchmarks</Text>
            {benchmarks.map((benchmark) => {
              const present = benchmark.scores.filter((score): score is number => score != null);
              const target = benchmark.ascending ? Math.min(...present) : Math.max(...present);
              return <CompareRow key={benchmark.name} label={benchmark.name} values={benchmark.scores.map((score) => (score == null ? "—" : Number(score.toFixed(2)).toString()))} best={benchmark.scores.indexOf(target)} />;
            })}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function CompareRow({ label, values, best }: { label: string; values: string[]; best: number }) {
  return (
    <View className="border-b border-border px-4 py-2.5">
      <Text variant="caption" className="mb-1">{label}</Text>
      <View className="flex-row gap-2">
        {values.map((value, index) => (
          <Text key={index} variant="small" className={cn("flex-1", index === best ? "font-bold text-success" : "font-semibold")}>{value}</Text>
        ))}
      </View>
    </View>
  );
}
