import type { AttemptRates, SuccessPoint } from "@/lib/api/models";

/**
 * Provider uptime per attempt, as the website's model page shows it (ModelProviderHealthChart, attemptFunnel and
 * the provider card). Three rates make a funnel: Reachable (Phaseo got a response from the provider), Accepted
 * (of the calls that reached it, the provider took them rather than turning them away for load) and Completed (of
 * the calls it accepted, they finished without a provider error). Customer- and Phaseo-caused failures count in
 * none. Pages show percentages only: the counts behind them reveal a model's traffic volume.
 */
export const PROVIDER_HEALTH_METRICS = ["reachability", "capacity", "callErrors"] as const;
export type ProviderHealthMetric = (typeof PROVIDER_HEALTH_METRICS)[number];

/** The website's copy (Catalogue.modelDetail.uptime, en-GB). The app is English-only. */
export const UPTIME_COPY = {
  providerHealthTitle: "Provider health",
  labels: { reachability: "Reachable", capacity: "Accepted", callErrors: "Completed" } satisfies Record<ProviderHealthMetric, string>,
  help: {
    reachability: "How often Phaseo got a response from the provider. Connection failures, timeouts before the response started and gateway errors (502, 503, 504) count against it.",
    capacity: "Of the calls that reached the provider, how often it took them instead of turning them away because it was at capacity. Rate limits on Phaseo's own key and overloaded responses count against it.",
    callErrors: "Of the calls the provider accepted, how often they finished without a provider error. Server errors, streams that broke part-way and empty or invalid output count against it.",
  } satisfies Record<ProviderHealthMetric, string>,
  noFailures: "No failures",
  noFailuresThisHour: "No failures this hour",
  reachabilityFailureShare: (percent: string) => `${percent} of attempts couldn't reach the provider`,
  capacityFailureShare: (percent: string) => `${percent} of attempts that reached the provider were turned away because it was at capacity`,
  capacityUnmeasured: "No attempts reached the provider",
  callErrorsFailureShare: (percent: string) => `${percent} of accepted attempts failed after the provider accepted them`,
  callErrorsUnmeasured: "No attempts were accepted",
  attemptHourlyAverage: "Last 24 hours · hourly average, per provider attempt",
  attemptBasis: "Last 3 days, per provider attempt. Errors caused by the request or by Phaseo are not counted.",
} as const;

/** The website's line colours (hsl 142 76% 36%, hsl 32 95% 44%, hsl 221 83% 53%) and dashes. */
export const PROVIDER_HEALTH_STYLE: Record<ProviderHealthMetric, { colour: string; dash?: string }> = {
  reachability: { colour: "#16a249" },
  capacity: { colour: "#db7706", dash: "6 3" },
  callErrors: { colour: "#2463eb", dash: "2 3" },
};

export type FunnelRates = { reachabilityPct?: number | null; capacityPct?: number | null; callErrorPct?: number | null };

/**
 * What to say about one step's failures, from the rates alone: `none` (nothing failed, or nothing was tried),
 * `failed` (this share, in percent, of the attempts that reached the step failed it) or `unmeasured` (no attempt
 * got as far as this step).
 */
export type FailureShare = { kind: "none" } | { kind: "failed"; pct: number } | { kind: "unmeasured" };

const isRate = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

function failureShare(ratePct: number | null | undefined, reachedStep: boolean): FailureShare {
  if (!isRate(ratePct)) return reachedStep ? { kind: "unmeasured" } : { kind: "none" };
  const failedPct = Math.min(100, Math.max(0, 100 - ratePct));
  return failedPct > 1e-9 ? { kind: "failed", pct: failedPct } : { kind: "none" };
}

/** A null Reachable rate means no eligible attempts (so no failures); a null later rate after some means none reached it. */
export function attemptFailureShares(rates: FunnelRates): Record<ProviderHealthMetric, FailureShare> {
  const hadAttempts = isRate(rates.reachabilityPct);
  return {
    reachability: failureShare(rates.reachabilityPct, false),
    capacity: failureShare(rates.capacityPct, hadAttempts),
    callErrors: failureShare(rates.callErrorPct, hadAttempts),
  };
}

/** One decimal place; a share that would round to 0.0% reads "<0.1%", so a small failure never looks like none. */
export function formatFailureShare(pct: number) {
  return pct < 0.05 ? "<0.1%" : `${pct.toFixed(1)}%`;
}

export const formatRate = (value: number | null | undefined) => (isRate(value) ? `${value.toFixed(1)}%` : "—");

/** A step's failure share in words. `noFailures` is "No failures" for a period, "No failures this hour" for an hour. */
export function failureShareText(metric: ProviderHealthMetric, share: FailureShare, noFailures: string = UPTIME_COPY.noFailures) {
  if (share.kind === "none") return noFailures;
  if (share.kind === "unmeasured") return metric === "capacity" ? UPTIME_COPY.capacityUnmeasured : UPTIME_COPY.callErrorsUnmeasured;
  const percent = formatFailureShare(share.pct);
  if (metric === "reachability") return UPTIME_COPY.reachabilityFailureShare(percent);
  if (metric === "capacity") return UPTIME_COPY.capacityFailureShare(percent);
  return UPTIME_COPY.callErrorsFailureShare(percent);
}

const toHour = (value: string | Date) => {
  const date = new Date(value);
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
};

const finite = (value: number | null | undefined) => (isRate(value) ? value : null);

export type ProviderHealthHour = {
  bucket: string;
  /** The rates as published for the hour (null when there was nothing to rate). */
  rates: { reachabilityPct: number | null; capacityPct: number | null; callErrorPct: number | null };
} & Record<ProviderHealthMetric, number | null>;

/**
 * The last 24 UTC hours of the three rates. An hour with no eligible attempts (no Reachable rate) shows 100%, so an
 * empty series, or one without attempt rates, reads 100% throughout; a later step nothing reached stays empty.
 */
export function providerHealthHours(series: SuccessPoint[], now = new Date()): ProviderHealthHour[] {
  const byHour = new Map(series.map((point) => [toHour(point.bucket), point]));
  const current = new Date(toHour(now));
  return Array.from({ length: 24 }, (_, index) => {
    const hour = new Date(current);
    hour.setUTCHours(current.getUTCHours() - (23 - index));
    const bucket = hour.toISOString();
    const point = byHour.get(bucket);
    const rates = { reachabilityPct: finite(point?.reachabilityPct), capacityPct: finite(point?.capacityPct), callErrorPct: finite(point?.callErrorPct) };
    const hadAttempts = rates.reachabilityPct != null;
    const shown = (value: number | null) => (value != null ? value : hadAttempts ? null : 100);
    return { bucket, rates, reachability: shown(rates.reachabilityPct), capacity: shown(rates.capacityPct), callErrors: shown(rates.callErrorPct) };
  });
}

const average = (values: (number | null)[]) => {
  const valid = values.filter((value): value is number => value != null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
};

/** Hourly averages over the 24 hours shown, as the website's headline figures. */
export function summarizeProviderHealth(hours: ProviderHealthHour[]): Record<ProviderHealthMetric, number | null> {
  return {
    reachability: average(hours.map((hour) => hour.reachability)),
    capacity: average(hours.map((hour) => hour.capacity)),
    callErrors: average(hours.map((hour) => hour.callErrors)),
  };
}

/**
 * The 24-hour failure share of each step: from web-api's `attemptHealth24h` (rated from all the attempts in those
 * hours) when present, since an average of hourly rates understates failures when traffic is uneven. Without them
 * (no attempts in the window) it falls back to the hourly averages, which then read 100% and "No failures".
 */
export function summaryFailureShares(summary: Record<ProviderHealthMetric, number | null>, totals?: AttemptRates | null) {
  if (totals) return attemptFailureShares(totals);
  return attemptFailureShares({ reachabilityPct: summary.reachability, capacityPct: summary.capacity, callErrorPct: summary.callErrors });
}

/** The website's uptime colour bands: above 99% green, 95 to 99% amber, below 95% red. */
export function uptimeTone(value: number | null | undefined): "success" | "warning" | "destructive" | null {
  if (!isRate(value)) return null;
  if (value > 99) return "success";
  if (value >= 95) return "warning";
  return "destructive";
}

/** How many UTC days before today a day starts (0 for today). */
export function utcDayOffset(start: string, now = new Date()) {
  const day = Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Number.isFinite(day) ? Math.round((today - day) / 86_400_000) : null;
}

/** "Today", "1 day ago", "2 days ago", as the website's provider card labels its daily bars. */
export const utcDayLabel = (offset: number) => (offset === 0 ? "Today" : `${offset} ${offset === 1 ? "day" : "days"} ago`);
