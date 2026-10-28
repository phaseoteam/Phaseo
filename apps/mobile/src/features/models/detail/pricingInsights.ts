import type { EffectivePricingRow, PricingHistoryRule, ProviderPricing } from "@/lib/api/models";
import { basePricePerMillion } from "../pricing";
import { normalizeGatewayStatusValue } from "../../../../../web/src/components/(data)/model/pricing/providerGatewayStatus";
import { normalizePlan, providerLogoId, providerOfferName, providerPlans } from "./providers";
import { providerSeriesColour } from "./tiers";

export { tierDashArray } from "./tiers";

const DAY_MS = 86_400_000;
const INPUT_METERS = ["input_text_tokens", "input_tokens"] as const;
const OUTPUT_METERS = ["output_text_tokens", "output_tokens"] as const;

const dayNoon = (day: string) => Date.parse(`${day}T12:00:00.000Z`);
const planKey = (providerId: string, plan: string) => `${providerId}\u0000${normalizePlan(plan)}`;

/** The 30-day window ends on the latest day with observed usage (the website's summaryCutoffMs). */
export function summaryCutoffMs(rows: Pick<EffectivePricingRow, "dayBucket">[]) {
  const latest = Math.max(...rows.map((row) => dayNoon(row.dayBucket)).filter(Number.isFinite));
  return Number.isFinite(latest) ? latest - 29 * DAY_MS : Number.NEGATIVE_INFINITY;
}

type DayUsage = { dayBucket: string; inputTokens: number; outputTokens: number; inputCostNanos: number; outputCostNanos: number };

export type ObservedUsage = {
  inputTokens30d: number;
  outputTokens30d: number;
  cachedReadTokens30d: number;
  totalTokens30d: number;
  usageByDay: Map<string, DayUsage>;
};

/** Observed usage and cost per provider and tier. Zero-token rows are skipped: they are not usage. */
export function observedUsageByProviderPlan(rows: EffectivePricingRow[], cutoffMs: number) {
  const map = new Map<string, ObservedUsage>();
  for (const row of rows) {
    if (!(row.inputTokens > 0 || row.outputTokens > 0)) continue;
    const key = planKey(row.providerId, row.pricingPlan);
    const usage = map.get(key) ?? { inputTokens30d: 0, outputTokens30d: 0, cachedReadTokens30d: 0, totalTokens30d: 0, usageByDay: new Map<string, DayUsage>() };
    if (dayNoon(row.dayBucket) >= cutoffMs) {
      usage.inputTokens30d += row.inputTokens;
      usage.outputTokens30d += row.outputTokens;
      usage.cachedReadTokens30d += Math.min(row.cachedReadTokens, row.inputTokens);
      usage.totalTokens30d += row.inputTokens + row.outputTokens;
    }
    const day = usage.usageByDay.get(row.dayBucket);
    usage.usageByDay.set(row.dayBucket, {
      dayBucket: row.dayBucket,
      inputTokens: (day?.inputTokens ?? 0) + row.inputTokens,
      outputTokens: (day?.outputTokens ?? 0) + row.outputTokens,
      inputCostNanos: (day?.inputCostNanos ?? 0) + row.inputCostNanos,
      outputCostNanos: (day?.outputCostNanos ?? 0) + row.outputCostNanos,
    });
    map.set(key, usage);
  }
  return map;
}

/** Cost per million tokens actually paid, weighted by tokens, from `sinceMs` on (calculateObservedEffectivePriceSummary). */
export function effectivePriceSummary(usageByDay: Map<string, DayUsage>, sinceMs?: number, untilMs?: number) {
  let inputCost = 0;
  let inputTokens = 0;
  let outputCost = 0;
  let outputTokens = 0;
  for (const point of usageByDay.values()) {
    const time = dayNoon(point.dayBucket);
    if (!Number.isFinite(time) || (sinceMs !== undefined && time < sinceMs) || (untilMs !== undefined && time > untilMs)) continue;
    if (point.inputTokens > 0) { inputTokens += point.inputTokens; inputCost += point.inputCostNanos; }
    if (point.outputTokens > 0) { outputTokens += point.outputTokens; outputCost += point.outputCostNanos; }
  }
  return {
    input: inputTokens > 0 ? (inputCost / 1e9 / inputTokens) * 1e6 : null,
    output: outputTokens > 0 ? (outputCost / 1e9 / outputTokens) * 1e6 : null,
    pricedInputTokens: inputTokens,
    pricedOutputTokens: outputTokens,
  };
}

export type EffectiveRow = {
  seriesKey: string;
  providerId: string;
  providerName: string;
  logoId: string;
  colour: string;
  plan: string;
  plans: string[];
  isExternal: boolean;
  input: number | null;
  output: number | null;
  listedInput: number | null;
  listedOutput: number | null;
  tokenSharePct: number | null;
  cacheHitRatePct: number | null;
  tokens30d: number;
};

/**
 * One row per provider and tier: the effective (paid) price over the last 30 days next to the list price,
 * plus each tier's share of observed tokens. External catalogue listings are kept but sorted last.
 */
export function effectiveRows(providers: ProviderPricing[], observed: Map<string, ObservedUsage>, cutoffMs: number, nowMs = Date.now()): EffectiveRow[] {
  const totalTokens = [...observed.values()].reduce((sum, usage) => sum + usage.totalTokens30d, 0);
  const rows = providers.flatMap((provider, index) => {
    const providerId = provider.provider.api_provider_id ?? "";
    const plans = providerPlans(provider);
    const colour = provider.provider.colour?.trim() || providerSeriesColour(index);
    return (plans.length ? plans : ["standard"]).map((plan): EffectiveRow => {
      const usage = observed.get(planKey(providerId, plan));
      const prices = usage ? effectivePriceSummary(usage.usageByDay, cutoffMs) : null;
      const used = usage && usage.totalTokens30d > 0 ? usage : null;
      return {
        seriesKey: planKey(providerId, plan),
        providerId,
        providerName: providerOfferName(provider.provider),
        logoId: providerLogoId(provider.provider),
        colour,
        plan,
        plans,
        isExternal: normalizeGatewayStatusValue(provider.provider.status) === "external",
        input: prices?.input ?? null,
        output: prices?.output ?? null,
        listedInput: basePricePerMillion(provider, [...INPUT_METERS], plan, nowMs),
        listedOutput: basePricePerMillion(provider, [...OUTPUT_METERS], plan, nowMs),
        tokenSharePct: used && totalTokens > 0 ? Math.min(100, (used.totalTokens30d / totalTokens) * 100) : null,
        cacheHitRatePct: used && used.inputTokens30d > 0 ? Math.min(100, (used.cachedReadTokens30d / used.inputTokens30d) * 100) : null,
        tokens30d: usage?.totalTokens30d ?? 0,
      };
    });
  });
  return [...rows.filter((row) => !row.isExternal), ...rows.filter((row) => row.isExternal)];
}

/**
 * The model's weighted price over 30 days: each provider's default-tier effective price weighted by the
 * tokens it priced (the website's effectiveSummary).
 */
export function weightedEffectivePrice(rows: EffectiveRow[], observed: Map<string, ObservedUsage>, cutoffMs: number) {
  let inputCost = 0;
  let inputTokens = 0;
  let outputCost = 0;
  let outputTokens = 0;
  for (const row of rows) {
    if (row.plan !== defaultRowPlan(row)) continue;
    const usage = observed.get(row.seriesKey);
    if (!usage) continue;
    const summary = effectivePriceSummary(usage.usageByDay, cutoffMs);
    if (summary.input != null) { inputCost += summary.input * (summary.pricedInputTokens / 1e6); inputTokens += summary.pricedInputTokens; }
    if (summary.output != null) { outputCost += summary.output * (summary.pricedOutputTokens / 1e6); outputTokens += summary.pricedOutputTokens; }
  }
  return {
    input: inputTokens > 0 ? inputCost / (inputTokens / 1e6) : null,
    output: outputTokens > 0 ? outputCost / (outputTokens / 1e6) : null,
  };
}

/** The tier a provider's summary uses: standard when priced, else its first tier. */
export function defaultRowPlan(row: Pick<EffectiveRow, "plans">) {
  return row.plans.includes("standard") ? "standard" : row.plans[0] ?? "standard";
}

// Price history

export type PricingRange = "7d" | "30d" | "90d" | "1y" | "all";
export type PricingView = "effective" | "listed";

/** Short, as stock charts label them, so all five fit a phone's width; screen readers get the full names. */
export const RANGE_OPTIONS: { value: PricingRange; label: string; accessibilityLabel: string }[] = [
  { value: "7d", label: "1W", accessibilityLabel: "1 week" },
  { value: "30d", label: "1M", accessibilityLabel: "1 month" },
  { value: "90d", label: "3M", accessibilityLabel: "3 months" },
  { value: "1y", label: "1Y", accessibilityLabel: "1 year" },
  { value: "all", label: "All", accessibilityLabel: "All time" },
];

const RANGE_DAYS: Record<Exclude<PricingRange, "all">, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };

const timeOf = (value: string | null | undefined, fallback: number) => {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : fallback;
};

/** Chart x positions: the range ends plus every price change and usage day inside it (getPricingHistoryTimestamps). */
export function historyTimestamps({ range, rules, usageDays, nowMs }: { range: PricingRange; rules: PricingHistoryRule[]; usageDays: string[]; nowMs: number }) {
  const boundaries = rules.flatMap((rule) => [rule.effectiveFrom, rule.effectiveTo].map((value) => timeOf(value, Number.NaN)).filter(Number.isFinite));
  const usage = usageDays.map(dayNoon).filter(Number.isFinite);
  const earliest = Math.min(...boundaries, ...usage);
  const start = range === "all"
    ? Number.isFinite(earliest) ? Math.max(earliest, nowMs - 3650 * DAY_MS) : nowMs - 365 * DAY_MS
    : nowMs - RANGE_DAYS[range] * DAY_MS;
  const end = nowMs;
  const times = new Set<number>([start, end]);
  for (const time of [...boundaries, ...usage]) if (time >= start && time <= end) times.add(time);
  return [...times].sort((a, b) => a - b);
}

const isActiveAt = (rule: PricingHistoryRule, time: number) => time >= timeOf(rule.effectiveFrom, Number.NEGATIVE_INFINITY) && time < timeOf(rule.effectiveTo, Number.POSITIVE_INFINITY);

/** The rule in force for a meter at a time: fewest conditions (not long-context), highest priority, newest. */
export function chooseRule(rules: PricingHistoryRule[], meters: readonly string[], time: number) {
  return rules
    .filter((rule) => meters.includes(rule.meter) && isActiveAt(rule, time))
    .sort((a, b) => meters.indexOf(a.meter) - meters.indexOf(b.meter) || a.match.length - b.match.length || b.priority - a.priority || timeOf(b.effectiveFrom, Number.NEGATIVE_INFINITY) - timeOf(a.effectiveFrom, Number.NEGATIVE_INFINITY))[0] ?? null;
}

/** Per-unit prices for non-token meters (seconds, requests) shown per minute or per unit, as the website does. */
export function normaliseHistoryPrice(pricePer1MUnits: number, unit: string) {
  const value = unit.trim().toLowerCase();
  if (["token", "byte", "character", "pixel"].includes(value)) return pricePer1MUnits;
  if (value === "second") return (pricePer1MUnits / 1e6) * 60;
  if (value === "minute") return pricePer1MUnits / 1e6;
  if (value === "hour") return pricePer1MUnits / 60e6;
  return pricePer1MUnits / 1e6;
}

const UNIT_LABELS: Record<string, string> = {
  token: "USD per million tokens", byte: "USD per million bytes", character: "USD per million characters", pixel: "USD per million pixels",
  second: "USD per minute", minute: "USD per minute", hour: "USD per minute", call: "USD per request", request: "USD per request",
};

/** What the chart's numbers are, from the meter's unit as normaliseHistoryPrice converts it (formatPricingHistoryUnitLabel on the web). */
export function historyUnitLabel(rules: PricingHistoryRule[], meter: string) {
  const unit = rules.find((rule) => rule.meter === meter)?.unit.trim().toLowerCase();
  if (!unit) return "USD per million tokens";
  return UNIT_LABELS[unit] ?? `USD per ${unit}`;
}

function listPriceAt(rules: PricingHistoryRule[], meter: string, time: number, preferred: number | null) {
  const selected = chooseRule(rules, [meter], time);
  if (!selected) return null;
  // Same-meter rules can overlap (tiers with conditions); prefer the one matching today's list price.
  const ambiguous = preferred == null ? [] : rules.filter((rule) => rule.meter === selected.meter && isActiveAt(rule, time));
  const rule = ambiguous.length < 2 ? selected : chooseRule(ambiguous.filter((candidate) => Math.abs(candidate.pricePer1MUnits - preferred!) < 1e-9), [meter], time) ?? selected;
  return normaliseHistoryPrice(rule.pricePer1MUnits, rule.unit);
}

type Prefix = { time: number; inputTokens: number; outputTokens: number; inputCost: number; outputCost: number };

function prefixSums(usage: ObservedUsage | undefined): Prefix[] {
  let inputTokens = 0;
  let outputTokens = 0;
  let inputCost = 0;
  let outputCost = 0;
  return [...(usage?.usageByDay.values() ?? [])]
    .map((point) => ({ point, time: dayNoon(point.dayBucket) }))
    .filter(({ time }) => Number.isFinite(time))
    .sort((a, b) => a.time - b.time)
    .map(({ point, time }) => {
      if (point.inputTokens > 0) { inputTokens += point.inputTokens; inputCost += point.inputCostNanos; }
      if (point.outputTokens > 0) { outputTokens += point.outputTokens; outputCost += point.outputCostNanos; }
      return { time, inputTokens, outputTokens, inputCost, outputCost };
    });
}

/** Rolling effective price over [since, until] from cumulative sums. */
export function effectivePriceBetween(points: Prefix[], sinceMs: number, untilMs: number, input: boolean) {
  const upper = (value: number) => {
    let low = 0;
    let high = points.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (points[middle]!.time <= value) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const end = points[upper(untilMs) - 1];
  if (!end) return null;
  const before = points[upper(sinceMs - 1) - 1];
  const tokens = input ? end.inputTokens - (before?.inputTokens ?? 0) : end.outputTokens - (before?.outputTokens ?? 0);
  const cost = input ? end.inputCost - (before?.inputCost ?? 0) : end.outputCost - (before?.outputCost ?? 0);
  return tokens > 0 ? (cost / 1e9 / tokens) * 1e6 : null;
}

export const isEffectiveMeter = (meter: string) => (INPUT_METERS as readonly string[]).includes(meter) || (OUTPUT_METERS as readonly string[]).includes(meter);

/** Meters with price history for the listed series, input and output first; USD-denominated rules are left out. */
export function meterOptions(rules: PricingHistoryRule[], rows: Pick<EffectiveRow, "seriesKey">[]) {
  const keys = new Set(rows.map((row) => row.seriesKey));
  const meters = new Set<string>();
  for (const rule of rules) {
    if (!keys.has(planKey(rule.providerId, rule.pricingPlan)) || rule.unit.trim().toLowerCase() === "usd") continue;
    meters.add(rule.meter);
  }
  const preferred = ["input_text_tokens", "input_tokens", "output_text_tokens", "output_tokens", "cached_read_text_tokens", "cached_write_text_tokens"];
  const rank = (meter: string) => (preferred.indexOf(meter) < 0 ? 999 : preferred.indexOf(meter));
  return [...meters].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export type HistoryPoint = { time: number; values: Record<string, number | null> };

/**
 * Price history per provider tier (buildPricingHistoryState). "Effective" is a 30-day rolling paid price for
 * input and output meters; "listed" is the list price in force at each change.
 */
export function buildPriceHistory({ rows, rules, observed, view, meter, range, nowMs }: {
  rows: EffectiveRow[];
  rules: PricingHistoryRule[];
  observed: Map<string, ObservedUsage>;
  view: PricingView;
  meter: string;
  range: PricingRange;
  nowMs: number;
}) {
  const rulesBySeries = new Map<string, PricingHistoryRule[]>(rows.map((row) => [row.seriesKey, []]));
  for (const rule of rules) rulesBySeries.get(planKey(rule.providerId, rule.pricingPlan))?.push(rule);
  const usageDays = [...observed.values()].flatMap((usage) => [...usage.usageByDay.keys()]);
  const times = historyTimestamps({ range, rules, usageDays, nowMs });
  const input = (INPUT_METERS as readonly string[]).includes(meter);
  const output = (OUTPUT_METERS as readonly string[]).includes(meter);
  const prefixes = new Map(rows.map((row) => [row.seriesKey, prefixSums(observed.get(row.seriesKey))]));
  const points: HistoryPoint[] = times.map((time) => {
    const values: Record<string, number | null> = {};
    for (const row of rows) {
      values[row.seriesKey] = view === "effective" && (input || output)
        ? effectivePriceBetween(prefixes.get(row.seriesKey) ?? [], time - 29 * DAY_MS - 12 * 3_600_000, time + 12 * 3_600_000, input)
        : listPriceAt(rulesBySeries.get(row.seriesKey) ?? [], meter, time, input ? row.listedInput : output ? row.listedOutput : null);
    }
    return { time, values };
  });
  const keys = rows.map((row) => row.seriesKey);
  return { points, keys, hasData: points.some((point) => keys.some((key) => typeof point.values[key] === "number" && Number.isFinite(point.values[key]))) };
}

/** Standard tiers (or a provider's only tier) start visible; the rest are toggled on from the table. */
export const isSeriesVisibleByDefault = (row: Pick<EffectiveRow, "plan" | "plans">) => row.plan === "standard" || (!row.plans.includes("standard") && row.plan === row.plans[0]);
