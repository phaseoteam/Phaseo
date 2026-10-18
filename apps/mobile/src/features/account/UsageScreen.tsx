import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { BarChart, ShareBar } from "@/components/charts";
import { Logo } from "@/components/Logo";
import { ErrorState, Header, LoadingState, ReadableWidth, Screen, Section, Segmented, Text } from "@/components/ui";
import { useCatalogueIndex } from "@/features/models/state";
import { useLayout } from "@/hooks/useLayout";
import { getUsageOverview } from "@/lib/api/account";
import { modelName } from "@/lib/catalogue";
import { formatCompact, formatNumber, formatPercent, formatShortDate, formatUsd, nanosToUsd } from "@/lib/format";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { byModel, change, series, totals, usageRange, type UsagePeriod } from "./usage";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function UsageScreen({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const { split } = useLayout();
  const { workspace } = useWorkspace();
  const { index } = useCatalogueIndex();
  const [period, setPeriod] = useState<UsagePeriod>("7d");
  // "Now" is fixed while the screen is open (so the query key is stable) and moves on refresh.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60_000) * 60_000);
  const range = useMemo(() => usageRange(period, new Date(now)), [period, now]);
  const overview = useQuery({
    queryKey: ["account", workspaceId, "usage", period, now],
    queryFn: () => getUsageOverview(workspaceId, range, timeZone),
    staleTime: 60_000,
  });

  // A few hundred pre-summed cells at most; folding them each render is cheap.
  const cells = overview.data?.current.cells ?? [];
  const current = totals(cells);
  const previous = totals(overview.data?.previous.cells ?? []);
  const spend = series(cells, range);
  const models = byModel(cells);
  const names = new Map(overview.data?.modelMetadataEntries ?? []);

  return (
    <Screen>
      <Header back={!split} title="Usage" subtitle={workspace?.name} />
      <ScrollView contentContainerClassName="pb-16" refreshControl={<RefreshControl refreshing={overview.isFetching && !overview.isLoading} onRefresh={() => setNow(Math.floor(Date.now() / 60_000) * 60_000)} />}>
        <ReadableWidth>
          <View className="px-4 pb-2">
            <Segmented<UsagePeriod> value={period} onChange={setPeriod} options={[{ value: "24h", label: "24 hours" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }]} />
          </View>
          {overview.isLoading ? <LoadingState /> : overview.isError ? <ErrorState error={overview.error} onRetry={() => void overview.refetch()} /> : (
            <>
              <View className="px-4 pt-3">
                <Text variant="caption">Spend</Text>
                <Text variant="display">{formatUsd(nanosToUsd(current.costNanos))}</Text>
                <Text variant="muted">{change(current.costNanos, previous.costNanos) ?? "No spend in the previous period"}</Text>
              </View>
              <BarChart className="mt-4" values={spend} labels={[formatShortDate(range.from), period === "24h" ? "Now" : "Today"]} />
              <View className="mt-4 flex-row border-y border-border">
                <Stat label="Requests" value={formatNumber(current.requests)} note={change(current.requests, previous.requests)} />
                <Stat label="Tokens" value={formatCompact(current.tokens)} note={change(current.tokens, previous.tokens)} />
                <Stat label="Success" value={current.requests ? formatPercent((current.successfulRequests / current.requests) * 100) : "—"} last />
              </View>
              <Section title="By model">
                {models.length === 0 ? <Text variant="muted" className="px-4 py-3">No requests in this period.</Text> : models.slice(0, 12).map((model) => {
                  const card = index.get(model.modelId);
                  const label = card ? modelName(card) : names.get(model.modelId)?.name ?? model.modelId;
                  return (
                    <View key={model.modelId} className="flex-row items-center gap-3 border-b border-border px-4 py-3">
                      <Logo id={card?.organisation_id ?? model.modelId.split("/")[0]} size={28} />
                      <View className="flex-1">
                        <View className="flex-row items-baseline justify-between gap-2">
                          <Text variant="body" numberOfLines={1} className="flex-1 font-semibold" onPress={() => router.push(`/models/${model.modelId}`)}>{label}</Text>
                          <Text variant="small" className="font-semibold">{formatUsd(nanosToUsd(model.costNanos))}</Text>
                        </View>
                        <Text variant="caption">{formatNumber(model.requests)} requests · {formatCompact(model.tokens)} tokens</Text>
                        <ShareBar fraction={current.costNanos ? model.costNanos / current.costNanos : 0} />
                      </View>
                    </View>
                  );
                })}
              </Section>
            </>
          )}
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, note, last }: { label: string; value: string; note?: string | null; last?: boolean }) {
  return (
    <View className={last ? "flex-1 px-4 py-3" : "flex-1 border-r border-border px-4 py-3"}>
      <Text variant="caption">{label}</Text>
      <Text variant="heading">{value}</Text>
      {note ? <Text variant="caption">{note}</Text> : null}
    </View>
  );
}
