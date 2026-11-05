import { useQuery } from "@tanstack/react-query";
import { Activity, BarChart3, CalendarDays, Globe2, Info } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { useCSSVariable } from "uniwind";
import { Pressable, View } from "react-native";
import { LegendItem, LineChart } from "@/components/charts";
import { Button, Icon, OptionSheet, Text, useMenu, useToneColor, type ViewRef } from "@/components/ui";
import { getModelPerformance, getModelPerformanceColos, type ModelPerformance } from "@/lib/api/models";
import { formatSeconds, formatShortDate, formatSpeed } from "@/lib/format";
import { EmptyBox, PageSection } from "./parts";
import { averageUptime, formatPercentile, hasPerformanceHistory, PERCENTILES, performanceView, RANGE_DAYS, showsLeastStableProvider, TREND_METRICS, trendSeries, uptimeHours, type RangeDays, type TrendMetric } from "./performance";
import type { SectionId } from "./sections";
import {
  attemptFailureShares, failureShareText, formatRate, hasProviderAttemptHealth, PROVIDER_HEALTH_METRICS, PROVIDER_HEALTH_STYLE, providerHealthHours, requestFailureText, summarizeProviderHealth,
  summaryFailureShares, UPTIME_COPY, type ProviderHealthMetric,
} from "./uptime";

/** The website's wording for a location view below its privacy minimum (#3498). */
const FILTERED_TELEMETRY_HINT = "A location's charts appear only once it has enough requests that no single customer's traffic can be picked out. Choose All locations to see every request.";

/**
 * Providers without a brand colour use the chart tokens, as the website's trend charts do, strongest
 * first: the steps mixed towards the background are faint on dark palettes.
 */
const CHART_TOKENS = ["--color-chart-4", "--color-chart-5", "--color-chart-3", "--color-chart-2", "--color-chart-1"];

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
  if (metric === "throughput") return formatSpeed(value);
  if (metric === "cachedInput") return `${value.toFixed(1)}%`;
  return formatSeconds(value);
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
  const rangeMenu = useMenu();
  const percentileMenu = useMenu();
  const locationMenu = useMenu();
  const rangeRef = useRef<ViewRef>(null);
  const percentileRef = useRef<ViewRef>(null);
  const locationRef = useRef<ViewRef>(null);
  const metrics = usePerformance(modelId, { range, colo, percentile });
  const colos = useQuery({ queryKey: ["model-page", modelId, "colos"], queryFn: () => getModelPerformanceColos(modelId), staleTime: 15 * 60_000 });
  const data = metrics.data;
  // The website leaves the section out until it has metrics (it stays out when the request fails).
  if (metrics.isLoading || data === undefined || (data === null && !colo)) return null;
  const view = data ? performanceView(data, range) : null;
  const telemetry = hasPerformanceHistory(data);
  // Request counts only filter the list; they're never shown (they reveal traffic volume).
  const locations = (colos.data ?? []).filter((entry) => entry.requests == null || entry.requests > 0);
  return (
    <PageSection
      id="performance"
      first={first}
      onLayoutSection={onLayoutSection}
      title="Performance"
      description="Hourly latency and throughput from the past seven days."
      action={
        <View className="flex-row gap-2">
          <View ref={rangeRef} collapsable={false} className="flex-1"><Button label={`${range}D`} icon={CalendarDays} variant="outline" size="sm" onPress={() => void rangeMenu.show(rangeRef)} /></View>
          {view && view.providerCount > 1 ? <View ref={percentileRef} collapsable={false} className="flex-1"><Button label={formatPercentile(percentile)} icon={BarChart3} variant="outline" size="sm" onPress={() => void percentileMenu.show(percentileRef)} /></View> : null}
          <View ref={locationRef} collapsable={false} className="flex-1"><Button label={colo ?? "All locations"} icon={Globe2} variant="outline" size="sm" loading={metrics.isFetching && metrics.isPlaceholderData} onPress={() => void locationMenu.show(locationRef)} /></View>
        </View>
      }
    >
      {telemetry && view ? (
        <View className="gap-4">
          {TREND_METRICS.map((definition) => (
            <TrendCard key={definition.metric} metric={definition.metric} label={definition.label} view={view} />
          ))}
          {/* All-traffic views publish at any volume; a location's hours need enough requests to publish. */}
          {colo && !data?.hourly.some((point) => point.requests > 0) ? <Text variant="caption">{FILTERED_TELEMETRY_HINT}</Text> : null}
        </View>
      ) : colo ? (
        <EmptyBox icon={Activity} title={`Not enough traffic in ${colo} to publish`} body={FILTERED_TELEMETRY_HINT} />
      ) : (
        <EmptyBox icon={Activity} title="No requests in the past 7 days" body="Charts will appear after this model serves requests through Phaseo." />
      )}
      <OptionSheet open={rangeMenu.open} anchor={rangeMenu.anchor} title="Time range" value={String(range)} options={RANGE_DAYS.map((days) => ({ value: String(days), label: `${days} ${days === 1 ? "day" : "days"}` }))} onChange={(value) => setRange(Number(value) as RangeDays)} onClose={rangeMenu.close} />
      <OptionSheet open={percentileMenu.open} anchor={percentileMenu.anchor} title="Select performance percentile" value={String(percentile)} options={PERCENTILES.map((value) => ({ value: String(value), label: formatPercentile(value) }))} onChange={(value) => setPercentile(Number(value))} onClose={percentileMenu.close} />
      <OptionSheet
        open={locationMenu.open}
        anchor={locationMenu.anchor}
        title="API execution location"
        value={colo ?? "all"}
        options={[{ value: "all", label: "All locations" }, ...locations.map((entry) => ({ value: entry.colo, label: entry.colo }))]}
        onChange={(value) => setColo(value === "all" ? null : value)}
        onClose={locationMenu.close}
      />
    </PageSection>
  );
}

function TrendCard({ metric, label, view }: { metric: TrendMetric; label: string; view: ReturnType<typeof performanceView> }) {
  const [inspected, setInspected] = useState<number | null>(null);
  const series = useMemo(() => trendSeries(view.data, metric, 3), [view.data, metric]);
  const chart = useCSSVariable(CHART_TOKENS).map((value) => String(value ?? "#3b82f6"));
  return (
    <View className="rounded-md border border-border px-4 py-4">
      <Text variant="label">{label}</Text>
      {series.length ? (
        <>
          <LineChart
            className="mt-2"
            height={148}
            showYAxis={false}
            series={series.map((entry, index) => ({ key: entry.provider, label: entry.name, colour: entry.colour ?? chart[index] ?? "#3b82f6", points: entry.points.map((point) => ({ x: point.time, y: point.value })) }))}
            valueFormat={(value) => formatValue(metric, value)}
            tooltipTitle={timeLabel(view.resolution)}
            accessibilityLabel={`${label} by provider, ${series.length} ${series.length === 1 ? "provider" : "providers"}`}
            onInspect={setInspected}
          />
          <View className="mt-2 gap-1.5">
            {series.map((entry, index) => {
              const value = inspected != null ? entry.points.find((point) => point.time === inspected)?.value ?? null : entry.average;
              return <LegendItem key={entry.provider} colour={entry.colour ?? chart[index] ?? "#3b82f6"} label={entry.name} value={formatValue(metric, value)} />;
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

/**
 * "Model uptime". Per provider attempt (Reachable, Accepted, Completed) when the data API publishes those rates, as
 * the website's ModelSuccessChart does; otherwise the older request-level uptime line. Percentages only.
 */
export function UptimeSection({ modelId, onLayoutSection, first }: { modelId: string; onLayoutSection: (id: SectionId, y: number) => void; first?: boolean }) {
  const metrics = usePerformance(modelId);
  const data = metrics.data ?? null;
  return (
    <PageSection id="uptime" first={first} onLayoutSection={onLayoutSection} title="Model uptime" description="Uptime trend for this model over the last 24 hours.">
      {data && hasProviderAttemptHealth(data.successSeries) ? <ProviderHealthCard metrics={data} /> : <UptimeCard metrics={data} />}
    </PageSection>
  );
}

/** The uptime buckets are UTC hours (uptimeHours), so their labels are too, as on the website. */
const utcHour = (time: number) => `${String(new Date(time).getUTCHours()).padStart(2, "0")}:00`;

/**
 * Reachable, Accepted and Completed over the last 24 hours: each step's hourly average with the share that failed
 * it, then a line per step. Press and hold the chart to read an hour; a label opens what the step measures.
 */
function ProviderHealthCard({ metrics }: { metrics: ModelPerformance }) {
  const [inspected, setInspected] = useState<number | null>(null);
  const [help, setHelp] = useState<ProviderHealthMetric | null>(null);
  const hours = useMemo(() => providerHealthHours(metrics.successSeries), [metrics.successSeries]);
  const summary = useMemo(() => summarizeProviderHealth(hours), [hours]);
  const summaryShares = useMemo(() => summaryFailureShares(summary, metrics.attemptHealth24h), [summary, metrics.attemptHealth24h]);
  const shown = inspected != null ? hours.find((hour) => Date.parse(hour.bucket) === inspected) : null;
  const shares = shown ? attemptFailureShares(shown.rates) : summaryShares;
  const label = UPTIME_COPY.labels;
  return (
    <View className="rounded-md border border-border px-4 py-4">
      <View className="gap-2">
        {PROVIDER_HEALTH_METRICS.map((metric) => (
          <Pressable
            key={metric}
            accessibilityRole="button"
            accessibilityState={{ expanded: help === metric }}
            accessibilityHint={`Explains what ${label[metric]} measures`}
            onPress={() => setHelp(help === metric ? null : metric)}
          >
            <View className="flex-row items-center gap-2">
              <LegendItem colour={PROVIDER_HEALTH_STYLE[metric].colour} dash={PROVIDER_HEALTH_STYLE[metric].dash} label="" />
              <Text variant="label">{label[metric]}</Text>
              <Icon icon={Info} tone="muted" size={14} />
              <View className="flex-1" />
              <Text className="text-[20px] font-bold leading-[26px] tracking-tight">{formatRate(shown ? shown[metric] : summary[metric])}</Text>
            </View>
            <Text variant="caption">{failureShareText(metric, shares[metric], shown ? UPTIME_COPY.noFailuresThisHour : UPTIME_COPY.noFailures)}</Text>
            {help === metric ? <Text variant="caption" className="mt-1 text-foreground">{UPTIME_COPY.help[metric]}</Text> : null}
          </Pressable>
        ))}
      </View>
      <Text variant="caption" className="mt-2">{shown ? `${utcHour(Date.parse(shown.bucket))} UTC` : UPTIME_COPY.attemptHourlyAverage}</Text>
      <LineChart
        className="mt-3"
        height={110}
        yMax={100}
        showYAxis={false}
        xTicks={4}
        xFormat={utcHour}
        tooltipTitle={(time) => `${formatShortDate(time)}, ${utcHour(time)} UTC`}
        valueFormat={formatRate}
        accessibilityLabel={`Hourly provider health over the last 24 hours. ${PROVIDER_HEALTH_METRICS.map((metric) => `${label[metric]}: ${formatRate(summary[metric])}`).join(". ")}.`}
        series={PROVIDER_HEALTH_METRICS.map((metric) => ({
          key: metric,
          label: label[metric],
          colour: PROVIDER_HEALTH_STYLE[metric].colour,
          dash: PROVIDER_HEALTH_STYLE[metric].dash,
          points: hours.map((hour) => ({ x: Date.parse(hour.bucket), y: hour[metric] })),
        }))}
        onInspect={setInspected}
      />
    </View>
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
      <Text className="text-[24px] font-bold leading-[30px] tracking-tight" style={{ color: success }}>{format(shown ? shown.overall : average)}</Text>
      <Text variant="caption" className="mt-0.5">{shown ? [`${utcHour(Date.parse(shown.bucket))} UTC`, requestFailureText(shown.overall)].filter(Boolean).join(" · ") : UPTIME_COPY.hourlyAverage}</Text>
      <LineChart
        className="mt-3"
        height={110}
        yMax={100}
        showYAxis={false}
        xTicks={4}
        xFormat={utcHour}
        tooltipTitle={(time) => `${formatShortDate(time)}, ${utcHour(time)} UTC`}
        valueFormat={format}
        accessibilityLabel={`Uptime per hour over the last 24 hours, ${format(average)} on average`}
        series={[
          { key: "overall", label: "Phaseo routing", colour: "#16a249", points: hours.map((hour) => ({ x: Date.parse(hour.bucket), y: hour.overall })) },
          ...(leastStable ? [{ key: "worst", label: "Without Phaseo Routing", colour: "#e92063", points: hours.map((hour) => ({ x: Date.parse(hour.bucket), y: hour.worst })) }] : []),
        ]}
        onInspect={setInspected}
      />
      <View className="mt-3 flex-row flex-wrap justify-center gap-x-4 gap-y-1">
        <LegendItem colour="#16a249" label="Phaseo routing" value={format(average)} />
        {leastStable ? <LegendItem colour="#e92063" label="Without Phaseo Routing" value={format(without)} /> : null}
      </View>
    </View>
  );
}
