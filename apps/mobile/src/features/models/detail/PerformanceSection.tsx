import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, CalendarDays, Globe2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { LegendItem, LineChart } from "@/components/charts";
import { Button, OptionSheet, Text, useToneColor } from "@/components/ui";
import { getModelPerformance, getModelPerformanceColos, type ModelPerformance } from "@/lib/api/models";
import { formatMs, formatShortDate } from "@/lib/format";
import { EmptyBox, PageSection } from "./parts";
import { averageUptime, formatPercentile, hasPerformanceHistory, PERCENTILES, performanceView, RANGE_DAYS, showsLeastStableProvider, TREND_METRICS, trendSeries, uptimeHours, type RangeDays, type TrendMetric } from "./performance";
import type { SectionId } from "./sections";

const FALLBACK = ["#3b82f6", "#f97316", "#10b981"];

/** Shared by Performance and Uptime: the website requests percentile 50 over three days by default. */
export function usePerformance(modelId: string, options: { range?: RangeDays; colo?: string | null; percentile?: number } = {}, enabled = true) {
  const range = options.range ?? 3;
  const colo = options.colo ?? null;
  const percentile = options.percentile ?? 50;
  return useQuery({
    queryKey: ["model-page", modelId, "performance", range, colo ?? "all", percentile],
    queryFn: () => getModelPerformance(modelId, { range, colo, percentile }),
    enabled,
    staleTime: 15 * 60_000,
    placeholderData: (previous) => previous,
  });
}

function formatValue(metric: TrendMetric, value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (metric === "throughput") return `${value >= 100 ? Math.round(value) : Number(value.toFixed(1))} tok/s`;
  if (metric === "cachedInput") return `${value.toFixed(1)}%`;
  return formatMs(value);
}

const timeLabel = (resolution: "hour" | "day") => (time: number) => {
  const date = new Date(time);
  return resolution === "day" ? formatShortDate(date) : `${formatShortDate(date)} ${String(date.getUTCHours()).padStart(2, "0")}:00`;
};

/** "Hourly latency and throughput from the past seven days": range and location filters, then a chart per metric. */
export function PerformanceSection({ modelId, onLayoutSection, first }: { modelId: string; onLayoutSection: (id: SectionId, y: number) => void; first?: boolean }) {
  const [range, setRange] = useState<RangeDays>(3);
  const [colo, setColo] = useState<string | null>(null);
  const [percentile, setPercentile] = useState(50);
  const [sheet, setSheet] = useState<"range" | "location" | "percentile" | null>(null);
  const metrics = usePerformance(modelId, { range, colo, percentile });
  const colos = useQuery({ queryKey: ["model-page", modelId, "colos"], queryFn: () => getModelPerformanceColos(modelId), staleTime: 15 * 60_000 });
  const data = metrics.data;
  // The website leaves the section out until it has metrics (it stays out when the request fails).
  if (metrics.isLoading || data === undefined || (data === null && !colo)) return null;
  const view = data ? performanceView(data, range) : null;
  const telemetry = hasPerformanceHistory(data);
  const locations = (colos.data ?? []).filter((entry) => entry.requests > 0);
  return (
    <PageSection
      id="performance"
      first={first}
      onLayoutSection={onLayoutSection}
      title="Performance"
      description="Hourly latency and throughput from the past seven days."
      action={
        <View className="flex-row gap-2">
          <Button label={`${range}D`} icon={CalendarDays} variant="outline" size="sm" className="flex-1" onPress={() => setSheet("range")} />
          {view && view.providerCount > 1 ? <Button label={formatPercentile(percentile)} icon={BarChart3} variant="outline" size="sm" className="flex-1" onPress={() => setSheet("percentile")} /> : null}
          <Button label={colo ?? "All locations"} icon={Globe2} variant="outline" size="sm" className="flex-1" loading={metrics.isFetching && metrics.isPlaceholderData} onPress={() => setSheet("location")} />
        </View>
      }
    >
      {telemetry && view ? (
        <View className="gap-4">
          {TREND_METRICS.map((definition) => (
            <TrendCard key={definition.metric} metric={definition.metric} label={definition.label} view={view} />
          ))}
          {!data?.hourly.some((point) => point.requests > 0) ? <Text variant="caption">Hourly charts appear once enough requests are recorded; low-volume periods are hidden.</Text> : null}
        </View>
      ) : (
        <EmptyBox icon={Activity} title="No gateway telemetry in the past 7 days" body="Hourly charts will appear when this model processes gateway traffic in the selected location." />
      )}
      <OptionSheet open={sheet === "range"} title="Time range" value={String(range)} options={RANGE_DAYS.map((days) => ({ value: String(days), label: `${days} ${days === 1 ? "day" : "days"}` }))} onChange={(value) => setRange(Number(value) as RangeDays)} onClose={() => setSheet(null)} />
      <OptionSheet open={sheet === "percentile"} title="Select performance percentile" value={String(percentile)} options={PERCENTILES.map((value) => ({ value: String(value), label: formatPercentile(value) }))} onChange={(value) => setPercentile(Number(value))} onClose={() => setSheet(null)} />
      <OptionSheet
        open={sheet === "location"}
        title="API execution location"
        value={colo ?? "all"}
        options={[{ value: "all", label: "All locations" }, ...locations.map((entry) => ({ value: entry.colo, label: entry.colo, description: `${entry.requests.toLocaleString("en-GB")} requests` }))]}
        onChange={(value) => setColo(value === "all" ? null : value)}
        onClose={() => setSheet(null)}
      />
    </PageSection>
  );
}

function TrendCard({ metric, label, view }: { metric: TrendMetric; label: string; view: ReturnType<typeof performanceView> }) {
  const [inspected, setInspected] = useState<number | null>(null);
  const series = useMemo(() => trendSeries(view.data, metric, 3), [view.data, metric]);
  return (
    <View className="rounded-md border border-border px-4 py-4">
      <View className="flex-row items-center justify-between">
        <Text variant="label">{label}</Text>
        {inspected != null ? <Text variant="caption">{timeLabel(view.resolution)(inspected)}</Text> : null}
      </View>
      {series.length ? (
        <>
          <LineChart
            className="mt-2"
            height={148}
            showYAxis={false}
            series={series.map((entry, index) => ({ key: entry.provider, colour: entry.colour ?? FALLBACK[index] ?? "#3b82f6", points: entry.points.map((point) => ({ x: point.time, y: point.value })) }))}
            onInspect={setInspected}
          />
          <View className="mt-2 gap-1.5">
            {series.map((entry, index) => {
              const value = inspected != null ? entry.points.find((point) => point.time === inspected)?.value ?? null : entry.average;
              return <LegendItem key={entry.provider} colour={entry.colour ?? FALLBACK[index] ?? "#3b82f6"} label={entry.name} value={formatValue(metric, value)} />;
            })}
          </View>
        </>
      ) : (
        <View className="mt-3 items-center justify-center rounded-md border border-dashed border-border px-4 py-8">
          <Text variant="caption" className="text-center">This metric was not recorded for requests in this period.</Text>
        </View>
      )}
    </View>
  );
}

/** "Model uptime": the 24-hour average, an hourly line and the Phaseo routing figure. */
export function UptimeSection({ modelId, onLayoutSection, first }: { modelId: string; onLayoutSection: (id: SectionId, y: number) => void; first?: boolean }) {
  const metrics = usePerformance(modelId);
  return (
    <PageSection id="uptime" first={first} onLayoutSection={onLayoutSection} title="Model uptime" description="Uptime trend for this model over the last 24 hours.">
      <UptimeCard metrics={metrics.data ?? null} />
    </PageSection>
  );
}

function UptimeCard({ metrics }: { metrics: ModelPerformance | null }) {
  const success = useToneColor("success");
  const [inspected, setInspected] = useState<number | null>(null);
  const series = useMemo(() => metrics?.successSeries ?? [], [metrics]);
  const hours = useMemo(() => uptimeHours(series), [series]);
  const leastStable = showsLeastStableProvider(series);
  const average = averageUptime(hours.map((hour) => hour.overall));
  const without = averageUptime(hours.filter((hour) => hour.worstRequests > 0 && hour.worst != null).map((hour) => hour.worst));
  const format = (value: number | null) => (value == null ? "—" : `${value.toFixed(1)}%`);
  const shown = inspected != null ? hours.find((hour) => Date.parse(hour.bucket) === inspected) : null;
  return (
    <View className="rounded-md border border-border px-4 py-4">
      <Text className="text-[34px] font-bold leading-10 tracking-tight" style={{ color: success }}>{format(shown ? shown.overall : average)}</Text>
      <Text variant="caption" className="mt-0.5">{shown ? `${String(new Date(shown.bucket).getHours()).padStart(2, "0")}:00 · ${shown.requests.toLocaleString("en-GB")} requests` : "Last 24 hours · hourly average"}</Text>
      <LineChart
        className="mt-3"
        height={110}
        yMax={100}
        showYAxis={false}
        xTicks={4}
        xFormat={(time) => `${String(new Date(time).getHours()).padStart(2, "0")}:00`}
        series={[
          { key: "overall", colour: "#16a34a", points: hours.map((hour) => ({ x: Date.parse(hour.bucket), y: hour.overall })) },
          ...(leastStable ? [{ key: "worst", colour: "#e11d48", points: hours.map((hour) => ({ x: Date.parse(hour.bucket), y: hour.worst })) }] : []),
        ]}
        onInspect={setInspected}
      />
      <View className="mt-3 flex-row flex-wrap justify-center gap-x-4 gap-y-1">
        <LegendItem colour="#16a34a" label="Phaseo routing" value={format(average)} />
        {leastStable ? <LegendItem colour="#e11d48" label="Without Phaseo Routing" value={format(without)} /> : null}
      </View>
    </View>
  );
}
