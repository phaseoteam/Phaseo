"use client";

import { Check, ChevronDown, CircleHelp, CircleSlash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Logo } from "@/components/Logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { resolveProviderDisplayName } from "@/lib/providers/providerOffers";

type RoutingDecision = {
	decision_order?: number;
	provider_slug?: string;
	provider_api_model_id?: string | null;
	decision?: "ranked" | "excluded";
	rank?: number | null;
	score?: number | string | null;
	selected?: boolean;
	attempted?: boolean;
	breaker?: string | null;
	provider_status?: string | null;
	provider_routing_status?: string | null;
	model_routing_status?: string | null;
	capability_status?: string | null;
	exclusion_stage?: string | null;
	exclusion_reason?: string | null;
	score_factors?: Record<string, unknown>;
	score_trace?: Record<string, unknown>;
};

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: {};
}

function number(value: unknown): number | null {
	const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
	return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: unknown, digits = 4, locale?: string): string {
	const parsed = number(value);
	if (parsed === null) return "—";
	if (Math.abs(parsed) >= 1000) return parsed.toLocaleString(locale, { maximumFractionDigits: 1 });
	return parsed.toLocaleString(locale, { maximumFractionDigits: digits });
}

function label(value: string): string {
	const names: Record<string, string> = {
		priceScore: "Price", price_score: "Price",
		reliabilitySample: "Reliability", reliability_sample: "Reliability",
		latencyScore: "Response speed", latency_score: "Response speed",
		tailLatencyScore: "Slow responses", tail_latency_score: "Slow responses",
		throughputScore: "Output speed", throughput_score: "Output speed",
		tokenAffinity: "Token fit", token_affinity: "Token fit",
	};
	if (names[value]) return names[value];
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function providerLabel(providerId: string, providerNames?: Map<string, string>): string {
	return resolveProviderDisplayName({ providerId, providerName: providerNames?.get(providerId) ?? label(providerId) });
}

const ROUTING_TRACE_METRICS = [
	"seed", "priority", "candidate_pool", "partial_trace", "formula", "base_score", "final_score",
	"base_weight", "price_score", "success_rate", "latency_score", "tail_latency_score",
	"throughput_score", "token_affinity", "reliability_sample", "reliability", "success", "latency",
	"tail_latency", "throughput", "price", "reliability_observations", "rollout_multiplier",
	"routing_multiplier", "cache_boost_multiplier", "latency_preference_multiplier",
	"throughput_preference_multiplier", "recent_outage_multiplier", "w_succ", "w_p50", "w_tail",
	"w_tps", "w_price", "noise", "l0", "stage", "reason", "provider_status", "model_status",
	"capability_status",
] as const;

function routingMetricKey(metric: string): string {
	return metric.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/-/g, "_").toLowerCase();
}

function isKnownRoutingMetric(metric: string): boolean {
	return ROUTING_TRACE_METRICS.includes(routingMetricKey(metric) as (typeof ROUTING_TRACE_METRICS)[number]);
}

function MetricInfo({ metric }: { metric: string }) {
	const t = useTranslations("SettingsUI");
	const metricKey = routingMetricKey(metric);
	const metricLabel = isKnownRoutingMetric(metric)
		? t(`routingTrace.metricLabels.${metricKey}` as never)
		: metric;
	const description = isKnownRoutingMetric(metric)
		? t(`routingTrace.metricDescriptions.${metricKey}` as never)
		: t("routingTrace.unknownMetricDescription" as never);
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button type="button" aria-label={`${t("strings.About" as never)} ${metricLabel}`} onClick={(event) => event.stopPropagation()} className="inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/60 hover:text-muted-foreground">
					<CircleHelp className="size-3" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="top" className="max-w-72 text-left">{description}</TooltipContent>
		</Tooltip>
	);
}

function MetricGrid({ values }: { values: Record<string, unknown> }) {
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	return (
		<div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
			{Object.entries(values).map(([key, value]) => (
				<div key={key} className="flex min-w-0 items-center justify-between gap-3">
					<span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
						<span className="truncate">
							{isKnownRoutingMetric(key)
								? t(`routingTrace.metricLabels.${routingMetricKey(key)}` as never)
								: key}
						</span>
						<MetricInfo metric={key} />
					</span>
					<code title={String(value ?? "")} className="min-w-0 break-words text-right text-xs font-medium tabular-nums text-foreground">
						{typeof value === "number" ? formatNumber(value, 3, locale) : String(value ?? "—")}
					</code>
				</div>
			))}
		</div>
	);
}

function CandidateCard({
	decision,
	maxScore,
	providerNames,
	routingMode,
}: {
	decision: RoutingDecision;
	maxScore: number;
	providerNames?: Map<string, string>;
	routingMode: string;
}) {
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const providerId = decision.provider_slug ?? "unknown";
	const parsedScore = number(decision.score);
	const score = parsedScore ?? 0;
	const isExcluded = decision.decision === "excluded";
	const trace = record(decision.score_trace);
	const legacyScoreFactors = Object.fromEntries(
		Object.entries(record(decision.score_factors)).filter(
			([key]) => key !== "load_penalty" && key !== "loadPenalty",
		),
	);
	const inputs = record(trace.inputs);
	const normalized = record(trace.normalized);
	const weights = Object.fromEntries(
		Object.entries(record(trace.weights)).filter(
			([key]) => key !== "wLoad" && key !== "w_load",
		),
	);
	const contributions = Object.fromEntries(
		Object.entries(record(trace.contributions)).filter(([key]) => key !== "load"),
	);
	const calculation = record(trace.calculation);
	const formula = String(calculation.formula ?? "");
	const usesLegacyBalancedFormula = formula === "balanced_multiplicative" || (!formula && routingMode === "balanced");
	const usesWeightedBalancedFormula = formula === "balanced_weighted_additive";
	const activeFactorKeys = new Set(usesLegacyBalancedFormula
		? ["priceScore", "price_score", "reliabilitySample", "reliability_sample", "tokenAffinity", "token_affinity", "baseWeight", "base_weight", "rolloutMultiplier", "rollout_multiplier", "routingMultiplier", "routing_multiplier", "cacheBoostMultiplier", "cache_boost_multiplier", "latencyPreferenceMultiplier", "latency_preference_multiplier", "throughputPreferenceMultiplier", "throughput_preference_multiplier"]
		: usesWeightedBalancedFormula
			? ["latencyScore", "latency_score", "tailLatencyScore", "tail_latency_score", "throughputScore", "throughput_score", "priceScore", "price_score", "reliabilitySample", "reliability_sample", "tokenAffinity", "token_affinity", "baseWeight", "base_weight", "rolloutMultiplier", "rollout_multiplier", "routingMultiplier", "routing_multiplier", "cacheBoostMultiplier", "cache_boost_multiplier", "latencyPreferenceMultiplier", "latency_preference_multiplier", "throughputPreferenceMultiplier", "throughput_preference_multiplier"]
		: ["successRate", "success_rate", "latencyScore", "latency_score", "tailLatencyScore", "tail_latency_score", "throughputScore", "throughput_score", "priceScore", "price_score", "tokenAffinity", "token_affinity", "baseWeight", "base_weight", "rolloutMultiplier", "rollout_multiplier", "routingMultiplier", "routing_multiplier", "cacheBoostMultiplier", "cache_boost_multiplier", "latencyPreferenceMultiplier", "latency_preference_multiplier", "throughputPreferenceMultiplier", "throughput_preference_multiplier"]);
	const isPrimaryFactor = (key: string) => activeFactorKeys.has(key) && !/weight|multiplier/i.test(key);
	const splitFactors = (values: Record<string, unknown>) => ({
		active: Object.fromEntries(Object.entries(values).filter(([key]) => isPrimaryFactor(key))),
		context: Object.fromEntries(Object.entries(values).filter(([key]) => !isPrimaryFactor(key))),
	});
	const legacyFactors = splitFactors(legacyScoreFactors);
	const normalizedFactors = splitFactors(normalized);
	const recordedContext = { ...legacyFactors.context, ...normalizedFactors.context };
	const routingStatuses = Object.fromEntries([
		["providerStatus", decision.provider_routing_status],
		["modelStatus", decision.model_routing_status],
		["capabilityStatus", decision.capability_status],
	].filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].startsWith("deranked")));
	const derankLevel = Math.max(0, ...Object.values(routingStatuses).map((status) => Number(status.match(/\d+/)?.[0] ?? 0)));
	const width = !isExcluded && score > 0 && maxScore > 0 ? Math.max(1, Math.min(100, (score / maxScore) * 100)) : 0;

	return (
		<details className="group/candidate border-t border-border/60 first:border-t-0" open={decision.selected}>
			<summary className="list-none cursor-pointer py-2.5 marker:hidden">
				<div className="flex items-center gap-3">
					<div className="w-5 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
						{decision.rank ?? "—"}
					</div>
					<Logo id={providerId} width={18} height={18} className="shrink-0" />
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 flex-wrap items-center gap-1.5">
							<span title={providerLabel(providerId, providerNames)} className="max-w-full truncate text-sm font-semibold">{providerLabel(providerId, providerNames)}</span>
							{decision.selected ? (
								<span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
										<Check className="size-3" /> {t("strings.Selected" as never)}
								</span>
							) : decision.attempted ? (
								<span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">{t("strings.Attempted" as never)}</span>
							) : isExcluded ? (
								<span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
										<CircleSlash2 className="size-3" /> {t("strings.Excluded" as never)}
								</span>
							) : null}
							{derankLevel > 0 ? (
								<span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
					{t("strings.Deranked" as never)} L{derankLevel}
								</span>
							) : null}
						</div>
						<div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
							<div className={cn("h-full rounded-full", decision.selected ? "bg-emerald-500" : "bg-sky-500/70")} style={{ width: `${width}%` }} />
						</div>
					</div>
					<div className="text-right">
						<div title={parsedScore === null ? undefined : String(parsedScore)} className="font-mono text-sm font-semibold tabular-nums">{parsedScore === null ? "—" : formatNumber(score, 3, locale)}</div>
						<div className="text-[10px] text-muted-foreground">{t("strings.Score" as never)}</div>
					</div>
					<ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/candidate:rotate-180" />
				</div>
			</summary>
			<div className="space-y-4 pb-3 pl-10 pt-1">
				{isExcluded ? (
					<TraceGroup
						title={t("strings.Exclusion Reason")}
						values={{
							stage: decision.exclusion_stage ?? "routing_gate",
							reason: decision.exclusion_reason ?? "excluded",
						}}
					/>
				) : null}
				{Object.keys(routingStatuses).length > 0 ? <TraceGroup title={t("strings.Routing Status")} values={routingStatuses} /> : null}
				{Object.keys(normalizedFactors.active).length > 0 ? <TraceGroup title={t("usageGaps.scoreBreakdown")} values={normalizedFactors.active} /> : null}
				{Object.keys(trace).length === 0 && Object.keys(legacyFactors.active).length > 0 ? <TraceGroup title={t("usageGaps.scoreBreakdown")} values={legacyFactors.active} /> : null}
				{Object.keys(calculation).length + Object.keys(inputs).length + Object.keys(weights).length + Object.keys(recordedContext).length + Object.keys(contributions).length > 0 ? (
					<details className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
						<summary className="cursor-pointer text-xs text-muted-foreground">{t("usageGaps.copyTechnicalDetails")}</summary>
						<div className="mt-3 space-y-4">
							{Object.keys(calculation).length > 0 ? <TraceGroup title={t("strings.Calculation")} values={calculation} /> : null}
							{Object.keys(contributions).length > 0 ? <TraceGroup title={t("usageGaps.contributions")} values={contributions} /> : null}
							{Object.keys(inputs).length > 0 ? <TraceGroup title={t("usageGaps.recordedInputs")} values={inputs} /> : null}
							{Object.keys(weights).length > 0 ? <TraceGroup title={t("strings.Weights")} values={weights} /> : null}
							{Object.keys(recordedContext).length > 0 ? <TraceGroup title={t("usageGaps.recordedContext")} values={recordedContext} /> : null}
						</div>
					</details>
				) : null}
			</div>
		</details>
	);
}

function TraceGroup({ title, values }: { title: string; values: Record<string, unknown> }) {
	return (
		<div>
			<div className="mb-1.5 text-[10px] font-semibold text-muted-foreground">{title}</div>
			<MetricGrid values={values} />
		</div>
	);
}

export function RoutingTracePanel({
	trace,
	decisions,
	providerNames,
}: {
	trace?: Record<string, unknown> | null;
	decisions?: RoutingDecision[] | null;
	providerNames?: Map<string, string>;
}) {
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const translateWithValues = t as unknown as (
		key: string,
		values: Record<string, string | number>,
	) => string;
	const ranked = (decisions ?? []).filter((decision) => decision.decision === "ranked");
	const excluded = (decisions ?? []).filter((decision) => decision.decision === "excluded");
	if (!trace && ranked.length === 0 && excluded.length === 0) return null;

	const maxScore = Math.max(0, ...ranked.map((decision) => number(decision.score) ?? 0));
	const selected = ranked.find((decision) => decision.selected);
	const algorithm = trace?.algorithm_version ? String(trace.algorithm_version) : t("routingTrace.partialTrace" as never);
	const mode = trace ? String(trace.routing_mode ?? "balanced") : "balanced";
	const summary = selected
		? `${translateWithValues("routingTrace.selectedFromCandidates", { provider: providerLabel(selected.provider_slug ?? "unknown", providerNames), count: ranked.length })}${excluded.length > 0 ? ` · ${translateWithValues("routingTrace.excludedCount", { count: excluded.length })}` : ""}`
		: t("routingTrace.noCandidateSelected" as never);

	return (
		<details className="group/routing mt-4 rounded-lg border border-border/70 px-3 py-1">
			<summary className="list-none cursor-pointer py-2 marker:hidden">
				<div className="flex items-center justify-between gap-4">
					<div className="min-w-0">
						<div className="text-sm font-medium text-foreground">{t("strings.Routing observability" as never)}</div>
						<div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
							{summary}
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
						<span className="rounded-md bg-muted px-2 py-1">{({ balanced: t("usageGaps.copyBalanced"), price: t("usageGaps.copyPrice"), latency: t("usageGaps.copyLatency"), throughput: t("usageGaps.copyThroughput") } as Record<string, string>)[mode] ?? mode}</span>
						<ChevronDown className="size-3.5 transition-transform group-open/routing:rotate-180" />
					</div>
				</div>
			</summary>

			<details className="border-t border-border/60 py-2 text-xs text-muted-foreground">
				<summary className="cursor-pointer">{t("usageGaps.metadata")}</summary>
				<div className="my-3 flex items-center gap-1">{algorithm}{!trace?.algorithm_version ? <MetricInfo metric="partialTrace" /> : null}</div>
				{trace ? (
					<MetricGrid values={{ seed: formatNumber(trace.random_seed, 0, locale), priority: String(trace.priority ?? "default"), candidatePool: formatNumber(trace.final_candidate_count, 0, locale) }} />
				) : null}
				{trace?.selection_method ? (
					<div className="mt-2 text-[11px] text-muted-foreground">
						{t("strings.Selection method" as never)} <code className="text-foreground">{String(trace.selection_method)}</code>
					</div>
				) : null}
			</details>

			<div className="mt-2 border-y border-border/60">
				{ranked.map((decision) => <CandidateCard key={`${decision.decision_order}-${decision.provider_slug}`} decision={decision} maxScore={maxScore} providerNames={providerNames} routingMode={mode} />)}
				{excluded.map((decision) => <CandidateCard key={`${decision.decision_order}-${decision.provider_slug}`} decision={decision} maxScore={maxScore} providerNames={providerNames} routingMode={mode} />)}
			</div>
		</details>
	);
}
