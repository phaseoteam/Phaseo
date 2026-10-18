import type { ModelPerformance, ProviderTrendPoint, SuccessPoint } from "@/lib/api/models";

export type RangeDays = 1 | 3 | 7;
export const RANGE_DAYS: RangeDays[] = [1, 3, 7];

export type TrendMetric = "throughput" | "latency" | "endToEnd" | "cachedInput";

/** The website's four performance cards (ModelPerformanceCards METRICS). */
export const TREND_METRICS: { metric: TrendMetric; label: string; valueKey: "avgThroughput" | "avgLatencyMs" | "avgEndToEndMs" | "cachedInputPct"; unit: "tps" | "ms" | "pct" }[] = [
  { metric: "throughput", label: "Throughput", valueKey: "avgThroughput", unit: "tps" },
  { metric: "latency", label: "Latency", valueKey: "avgLatencyMs", unit: "ms" },
  { metric: "endToEnd", label: "E2E latency", valueKey: "avgEndToEndMs", unit: "ms" },
  { metric: "cachedInput", label: "Cached input", valueKey: "cachedInputPct", unit: "pct" },
];

export const PERCENTILES = [1, 5, 10, 25, 50, 75, 90, 95, 99] as const;
export const formatPercentile = (value: number) => `P${String(value).padStart(2, "0")}`;

const pointTime = (point: { bucket?: string; day?: string }) => Date.parse(point.bucket ?? point.day ?? "");

export function hasPerformanceHistory(metrics: ModelPerformance | null | undefined) {
  if (!metrics) return false;
  return metrics.summary.totalRequests > 0
    || metrics.hourly.some((point) => point.requests > 0)
    || metrics.providerHourly7d.some((point) => point.requests > 0)
    || metrics.providerDaily7d.some((point) => point.requests > 0)
    || metrics.providerPercentileDaily7d.some((point) => point.requests > 0);
}

/** Points inside the last `days` before the newest observation. */
export function filterRange<T extends { bucket?: string; day?: string }>(points: T[], days: RangeDays, latest: number): T[] {
  if (!Number.isFinite(latest)) return points;
  const cutoff = latest - days * 86_400_000;
  return points.filter((point) => {
    const time = pointTime(point);
    return Number.isFinite(time) && time >= cutoff && time <= latest;
  });
}

const HOURLY_MAX_SPAN_MS = 3 * 86_400_000;

/** Hourly provider points when they span three days or less, else daily (selectProviderTrendData). */
export function selectProviderTrend(hourly: ProviderTrendPoint[], daily: ProviderTrendPoint[]) {
  const observed = hourly.filter((point) => point.requests > 0).map(pointTime).filter(Number.isFinite);
  const span = observed.length > 1 ? Math.max(...observed) - Math.min(...observed) : 0;
  if (hourly.length > 0 && span <= HOURLY_MAX_SPAN_MS) return { data: hourly, resolution: "hour" as const };
  if (daily.length > 0) return { data: daily, resolution: "day" as const };
  return { data: hourly, resolution: "hour" as const };
}

const usable = (metric: TrendMetric, value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value) && (metric === "cachedInput" ? value >= 0 : value > 0);

export type TrendSeries = { provider: string; name: string; colour: string | null; requests: number; points: { time: number; value: number }[]; average: number | null };

/** One line per provider (or percentile band), busiest first, capped like the website's cards. */
export function trendSeries(data: ProviderTrendPoint[], metric: TrendMetric, maxSeries = 3): TrendSeries[] {
  const key = TREND_METRICS.find((entry) => entry.metric === metric)!.valueKey;
  const byProvider = new Map<string, TrendSeries>();
  for (const point of data) {
    const value = point[key];
    if (point.requests <= 0 || !usable(metric, value)) continue;
    const time = pointTime(point);
    if (!Number.isFinite(time)) continue;
    const series = byProvider.get(point.provider) ?? { provider: point.provider, name: point.providerName || point.provider, colour: point.providerColor ?? null, requests: 0, points: [], average: null };
    series.requests += point.requests;
    series.points.push({ time, value });
    byProvider.set(point.provider, series);
  }
  return [...byProvider.values()]
    .sort((a, b) => b.requests - a.requests)
    .slice(0, maxSeries)
    .map((series) => ({
      ...series,
      points: series.points.sort((a, b) => a.time - b.time),
      average: series.points.length ? series.points.reduce((sum, point) => sum + point.value, 0) / series.points.length : null,
    }));
}

const PERCENTILE_COLOURS: Record<number, string> = { 1: "#22b8cf", 5: "#339af0", 10: "#4c6ef5", 25: "#5c7cfa", 50: "#7950f2", 75: "#9c36b5", 90: "#ae3ec9", 95: "#c2255c", 99: "#e03131" };

/** For a single provider the website draws P10/P50/P90 bands instead of one provider line. */
export function singleProviderPercentileSeries(providerCount: number, points: ProviderTrendPoint[]): ProviderTrendPoint[] | null {
  if (providerCount !== 1 || !points.length) return null;
  const series = points
    .filter((point) => point.percentile != null && (PERCENTILES as readonly number[]).includes(point.percentile) && point.requests > 0)
    .map((point) => ({ ...point, provider: `percentile-${point.percentile}`, providerName: formatPercentile(point.percentile!), providerColor: PERCENTILE_COLOURS[point.percentile!] ?? null }));
  return series.length ? series : null;
}

export function cardData(percentileSeries: ProviderTrendPoint[] | null, trend: ProviderTrendPoint[]) {
  return percentileSeries ? percentileSeries.filter((point) => ["percentile-10", "percentile-50", "percentile-90"].includes(point.provider)) : trend;
}

/** Everything the Performance section draws for a range, from one metrics payload. */
export function performanceView(metrics: ModelPerformance, days: RangeDays) {
  const all = [...metrics.hourly, ...metrics.providerHourly7d, ...metrics.providerDaily7d, ...metrics.providerPercentileDaily7d];
  const latest = Math.max(...all.map(pointTime).filter(Number.isFinite));
  const hourly = filterRange(metrics.providerHourly7d, days, latest);
  const daily = filterRange(metrics.providerDaily7d, days, latest);
  const percentiles = filterRange(metrics.providerPercentileDaily7d, days, latest);
  const { data, resolution } = selectProviderTrend(days <= 3 ? hourly : [], daily);
  const providerCount = new Set(data.filter((point) => point.requests > 0).map((point) => point.provider)).size;
  const percentileSeries = singleProviderPercentileSeries(providerCount, percentiles);
  return { data: cardData(percentileSeries, data), resolution: percentileSeries ? ("day" as const) : resolution, providerCount, usesPercentiles: Boolean(percentileSeries) };
}

// Model uptime (ModelSuccessChart)

const toHour = (value: string | Date) => {
  const date = new Date(value);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
};

const displayedUptime = (value: number | null | undefined, requests: number) => (value != null && Number.isFinite(value) ? value : requests === 0 ? 100 : null);

/** The last 24 UTC hours. Hours without requests count as 100%, as on the website. */
export function uptimeHours(series: SuccessPoint[], now = new Date()) {
  const byHour = new Map(series.map((point) => [toHour(point.bucket), point]));
  const current = new Date(toHour(now));
  return Array.from({ length: 24 }, (_, index) => {
    const hour = new Date(current);
    hour.setUTCHours(current.getUTCHours() - (23 - index));
    const bucket = hour.toISOString();
    const point = byHour.get(bucket);
    const requests = point?.requests ?? 0;
    return {
      bucket,
      overall: displayedUptime(point?.overallSuccessPct, requests),
      worst: point ? displayedUptime(point.worstProviderSuccessPct, requests) : null,
      requests,
      worstRequests: point?.worstProviderRequests ?? 0,
    };
  });
}

export function averageUptime(values: (number | null | undefined)[]) {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

/** "Without Phaseo routing" shows when some hour had more than one provider to compare. */
export function showsLeastStableProvider(series: SuccessPoint[]) {
  return series.some((point) => point.providerCount > 1 && point.worstProviderSuccessPct != null);
}
