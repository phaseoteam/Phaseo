import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useCSSVariable } from "uniwind";
import { formatUsageNumber, formatUsagePercent, formatUsageUsd, formatUsageUsdAxis } from "@phaseo/app-kit/format";
import { BarChart, ShareBar, TooltipRow, TooltipTitle } from "@/components/charts";
import { Logo } from "@/components/Logo";
import { ErrorState, Header, LoadingState, ReadableWidth, Screen, Section, Segmented, Text } from "@/components/ui";
import { useCatalogueIndex } from "@/features/models/state";
import { useLayout } from "@/hooks/useLayout";
import { getUsageOverview } from "@/lib/api/account";
import { modelName } from "@/lib/catalogue";
import { formatDateParts, formatShortDate } from "@/lib/format";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { byModel, change, totals, usageBuckets, usageRange, type UsageBucket, type UsagePeriod } from "./usage";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const hour = (start: number) => `${String(new Date(start).getHours()).padStart(2, "0")}:00`;
/** A bucket's name, as the website's usage charts give it: "13 Oct", or "18 Oct, 14" for hours. */
const bucketName = (bucket: UsageBucket, hourly: boolean) => formatDateParts(bucket.start, hourly ? { hour: "2-digit", day: "numeric", month: "short" } : { day: "numeric", month: "short" });
/** Spend from nanodollars, as the website's usage dashboard shows it: "$12.50", "$1,234". */
const spend = (nanos: number) => formatUsageUsd(nanos / 1_000_000_000);

export function UsageScreen({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const { split } = useLayout();
  const { workspace } = useWorkspace();
  const { index } = useCatalogueIndex();
  // The website's usage charts draw in chart-4, the accent itself.
  const barColour = String(useCSSVariable("--color-chart-4") ?? "#0069a8");
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
  const currentCells = overview.data?.current.cells;
  const buckets = useMemo(() => usageBuckets(currentCells ?? [], range), [currentCells, range]);
  const values = useMemo(() => buckets.map((bucket) => ({ key: String(bucket.start), value: bucket.costNanos / 1_000_000_000 })), [buckets]);
  const hourly = range.bucket === "hour";
  const busiest = buckets.reduce<UsageBucket | null>((best, bucket) => (!best || bucket.costNanos > best.costNanos ? bucket : best), null);
  const models = byModel(cells);
  const names = new Map(overview.data?.modelMetadataEntries ?? []);
  const describe = (bucket: UsageBucket) => `${bucketName(bucket, hourly)}: ${spend(bucket.costNanos)}, ${formatUsageNumber(bucket.requests)} requests, ${formatUsageNumber(bucket.tokens)} tokens`;

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
                <Text variant="display">{spend(current.costNanos)}</Text>
                <Text variant="muted">{change(current.costNanos, previous.costNanos)}</Text>
              </View>
              <BarChart
                className="mx-4 mt-4"
                height={190}
                colour={barColour}
                values={values}
                yFormat={formatUsageUsdAxis}
                xLabel={(slot) => (hourly ? hour(buckets[slot]!.start) : formatShortDate(buckets[slot]!.start))}
                labelEvery={hourly ? 6 : period === "7d" ? 2 : 7}
                accessibilityLabel={`Spend per ${hourly ? "hour" : "day"}, ${spend(current.costNanos)} in total${busiest?.costNanos ? `, highest ${spend(busiest.costNanos)} on ${bucketName(busiest, hourly)}` : ""}`}
                describe={(slot) => describe(buckets[slot]!)}
                tooltip={(slot) => {
                  const bucket = buckets[slot]!;
                  return (
                    <>
                      <TooltipTitle>{bucketName(bucket, hourly)}{bucket.start + (hourly ? 3_600_000 : 86_400_000) > now ? " · so far" : ""}</TooltipTitle>
                      <TooltipRow colour={barColour} label="Spend" value={spend(bucket.costNanos)} />
                      <TooltipRow label="Requests" value={formatUsageNumber(bucket.requests)} />
                      <TooltipRow label="Tokens" value={formatUsageNumber(bucket.tokens)} />
                    </>
                  );
                }}
              />
              <Text variant="caption" className="px-4 pt-1.5">{`Press and hold the chart, then drag, to see each ${hourly ? "hour" : "day"}.`}</Text>
              <View className="mt-4 flex-row border-y border-border">
                <Stat label="Requests" value={formatUsageNumber(current.requests)} note={change(current.requests, previous.requests)} />
                <Stat label="Tokens" value={formatUsageNumber(current.tokens)} note={change(current.tokens, previous.tokens)} />
                <Stat label="Success" value={current.requests ? formatUsagePercent(current.successfulRequests / current.requests) : "—"} last />
              </View>
              <Section title="By model">
                {models.length === 0 ? <Text variant="muted" className="px-4 py-3">No requests in this period.</Text> : models.slice(0, 12).map((model) => {
                  const card = index.get(model.modelId);
                  const label = card ? modelName(card) : names.get(model.modelId)?.name ?? model.modelId;
                  const share = current.costNanos ? model.costNanos / current.costNanos : 0;
                  return (
                    <View key={model.modelId} className="flex-row items-center gap-3 border-b border-border px-4 py-3">
                      <Logo id={card?.organisation_id ?? model.modelId.split("/")[0]} size={28} />
                      <View className="flex-1">
                        <View className="flex-row items-baseline justify-between gap-2">
                          <Text variant="body" numberOfLines={1} className="flex-1 font-semibold" onPress={() => router.push(`/models/${model.modelId}`)}>{label}</Text>
                          <Text variant="small" className="font-semibold">{spend(model.costNanos)}</Text>
                        </View>
                        <Text variant="caption">{formatUsageNumber(model.requests)} requests · {formatUsageNumber(model.tokens)} tokens</Text>
                        <ShareBar fraction={share} label={`${label}: ${formatUsagePercent(share)} of spend`} />
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
