"use client";

import { Check, ChevronDown, CircleHelp, CircleSlash2 } from "lucide-react";
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

function formatNumber(value: unknown, digits = 4): string {
	const parsed = number(value);
	if (parsed === null) return "—";
	if (Math.abs(parsed) >= 1000) return parsed.toLocaleString(undefined, { maximumFractionDigits: 1 });
	return parsed.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function label(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function providerLabel(providerId: string, providerNames?: Map<string, string>): string {
	return resolveProviderDisplayName({ providerId, providerName: providerNames?.get(providerId) ?? label(providerId) });
}

const METRIC_DESCRIPTIONS: Record<string, string> = {
	seed: "Makes the random parts of this routing decision repeatable.",
	priority: "The routing preset used for this request.",
	candidatePool: "Providers left after filtering.",
	partialTrace: "This older request has scores, but it does not have the full routing record.",
	formula: "The formula used to score this provider.",
	baseScore: "The score before weights and multipliers.",
	finalScore: "The score used to rank this provider.",
	baseWeight: "The provider's configured weight. Higher values raise its score.",
	base_weight: "The provider's configured weight. Higher values raise its score.",
	priceScore: "Compares this provider's price with the others. Higher is cheaper.",
	price_score: "Compares this provider's price with the others. Higher is cheaper.",
	successRate: "The recent success rate after ignoring user errors, rate limits, and geographic blocks. It feeds the reliability sample but is not scored again.",
	success_rate: "The recent success rate after ignoring user errors, rate limits, and geographic blocks. It feeds the reliability sample but is not scored again.",
	latencyScore: "Compares recent response time. Higher is faster.",
	latency_score: "Compares recent response time. Higher is faster.",
	tailLatencyScore: "Compares the provider's slowest recent responses. Higher is better.",
	tail_latency_score: "Compares the provider's slowest recent responses. Higher is better.",
	throughputScore: "Compares recent output speed in tokens per second. Higher is faster.",
	throughput_score: "Compares recent output speed in tokens per second. Higher is faster.",
	tokenAffinity: "How closely the provider's token limit fits this request.",
	token_affinity: "How closely the provider's token limit fits this request.",
	reliabilitySample: "A sampled estimate based on the success rate and how much recent data exists. This value affects routing.",
	reliability_sample: "A sampled estimate based on the success rate and how much recent data exists. This value affects routing.",
	reliability: "How much the reliability estimate adds to the score.",
	success: "How much recent success adds to the score.",
	latency: "How much response time adds to the score.",
	tailLatency: "How much slow response time adds to the score.",
	throughput: "How much output speed adds to the score.",
	price: "How much price adds to the score.",
	reliabilityObservations: "How much recent data supports the reliability estimate.",
	reliability_observations: "How much recent data supports the reliability estimate.",
	rolloutMultiplier: "Limits traffic to alpha and beta providers. Active providers get 1.",
	rollout_multiplier: "Limits traffic to alpha and beta providers. Active providers get 1.",
	routingMultiplier: "Lowers the score when the provider, model, or capability is deranked.",
	routing_multiplier: "Lowers the score when the provider, model, or capability is deranked.",
	cacheBoostMultiplier: "Raises the score when reusing this provider may preserve cache hits.",
	cache_boost_multiplier: "Raises the score when reusing this provider may preserve cache hits.",
	latencyPreferenceMultiplier: "Lowers the score if the provider misses the preferred response time.",
	latency_preference_multiplier: "Lowers the score if the provider misses the preferred response time.",
	throughputPreferenceMultiplier: "Lowers the score if the provider misses the preferred output speed.",
	throughput_preference_multiplier: "Lowers the score if the provider misses the preferred output speed.",
	recentOutageMultiplier: "Moves a provider to the back when it has a recent outage.",
	wSucc: "How much recent success affects the score.",
	wP50: "How much typical response time affects the score.",
	wTail: "How much slow response time affects the score.",
	wTPS: "How much output speed affects the score.",
	wPrice: "How much price affects the score.",
	noise: "A small random value that lets other providers get traffic.",
	L0: "The response time used as the midpoint of the latency score.",
	stage: "The filter that removed this provider.",
	reason: "Why the provider was removed.",
	providerStatus: "The provider's routing status when this request was handled.",
	modelStatus: "The model's routing status when this request was handled.",
	capabilityStatus: "The capability's routing status when this request was handled.",
};

function MetricInfo({ metric }: { metric: string }) {
	const description = METRIC_DESCRIPTIONS[metric] ?? "A value recorded during routing.";
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button type="button" aria-label={`About ${label(metric)}`} onClick={(event) => event.stopPropagation()} className="inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/60 hover:text-muted-foreground">
					<CircleHelp className="size-3" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="top" className="max-w-72 text-left">{description}</TooltipContent>
		</Tooltip>
	);
}

function MetricGrid({ values }: { values: Record<string, unknown> }) {
	return (
		<div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
			{Object.entries(values).map(([key, value]) => (
				<div key={key} className="flex min-w-0 items-center justify-between gap-3">
					<span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
						<span className="truncate">{label(key)}</span>
						<MetricInfo metric={key} />
					</span>
					<code className="shrink-0 text-[11px] font-medium tabular-nums text-foreground">
						{typeof value === "number" ? formatNumber(value, 6) : String(value ?? "—")}
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
	const splitFactors = (values: Record<string, unknown>) => ({
		active: Object.fromEntries(Object.entries(values).filter(([key]) => activeFactorKeys.has(key))),
		context: Object.fromEntries(Object.entries(values).filter(([key]) => !activeFactorKeys.has(key))),
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
	const width = maxScore > 0 ? Math.max(1, Math.min(100, (score / maxScore) * 100)) : 0;

	return (
		<details className="group border-t border-border/60 first:border-t-0" open={decision.selected}>
			<summary className="list-none cursor-pointer py-2.5 marker:hidden">
				<div className="flex items-center gap-3">
					<div className="w-5 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
						{decision.rank ?? "—"}
					</div>
					<Logo id={providerId} width={18} height={18} className="shrink-0" />
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 items-center gap-2">
							<span className="truncate text-sm font-semibold">{providerLabel(providerId, providerNames)}</span>
							{decision.selected ? (
								<span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
									<Check className="size-3" /> Selected
								</span>
							) : decision.attempted ? (
								<span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">Attempted</span>
							) : isExcluded ? (
								<span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
									<CircleSlash2 className="size-3" /> Excluded
								</span>
							) : null}
							{derankLevel > 0 ? (
								<span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
									Deranked L{derankLevel}
								</span>
							) : null}
						</div>
						<div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
							<div className={cn("h-full rounded-full", decision.selected ? "bg-emerald-500" : "bg-sky-500/70")} style={{ width: `${width}%` }} />
						</div>
					</div>
					<div className="text-right">
						<div className="font-mono text-sm font-semibold tabular-nums">{parsedScore === null ? "—" : formatNumber(score, 6)}</div>
						<div className="text-[10px] text-muted-foreground">Score</div>
					</div>
					<ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
				</div>
			</summary>
			<div className="space-y-4 pb-3 pl-10 pt-1">
				{isExcluded ? (
					<TraceGroup
						title="Exclusion Reason"
						values={{
							stage: label(decision.exclusion_stage ?? "routing gate"),
							reason: label(decision.exclusion_reason ?? "excluded"),
						}}
					/>
				) : null}
				{Object.keys(routingStatuses).length > 0 ? <TraceGroup title="Routing Status" values={routingStatuses} /> : null}
				{Object.keys(calculation).length > 0 ? <TraceGroup title="Calculation" values={calculation} /> : null}
				{Object.keys(contributions).length > 0 && (calculation.formula === "weighted_additive" || calculation.formula === "balanced_weighted_additive") ? <TraceGroup title="Weighted Contributions" values={contributions} /> : null}
				{Object.keys(normalizedFactors.active).length > 0 ? <TraceGroup title="Score Factors" values={normalizedFactors.active} /> : null}
				{Object.keys(trace).length > 0 && Object.keys(recordedContext).length > 0 ? <TraceGroup title="Recorded Context" values={recordedContext} /> : null}
				{Object.keys(inputs).length > 0 ? <TraceGroup title="Recorded Inputs" values={inputs} /> : null}
				{Object.keys(weights).length > 0 ? <TraceGroup title="Weights" values={weights} /> : null}
				{Object.keys(trace).length === 0 && Object.keys(legacyFactors.active).length > 0 ? <TraceGroup title="Score Factors" values={legacyFactors.active} /> : null}
				{Object.keys(trace).length === 0 && Object.keys(legacyFactors.context).length > 0 ? <TraceGroup title="Recorded Context" values={legacyFactors.context} /> : null}
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
	const ranked = (decisions ?? []).filter((decision) => decision.decision === "ranked");
	const excluded = (decisions ?? []).filter((decision) => decision.decision === "excluded");
	if (!trace && ranked.length === 0 && excluded.length === 0) return null;

	const maxScore = Math.max(0, ...ranked.map((decision) => number(decision.score) ?? 0));
	const selected = ranked.find((decision) => decision.selected) ?? ranked[0];
	const algorithm = trace?.algorithm_version ? String(trace.algorithm_version) : "Partial trace";
	const mode = trace ? String(trace.routing_mode ?? "balanced") : "balanced";

	return (
		<details className="group mt-3 border-t border-border/70 pt-1">
			<summary className="list-none cursor-pointer py-2 marker:hidden">
				<div className="flex items-center justify-between gap-4">
					<div className="min-w-0">
						<div className="text-xs font-medium text-foreground">Routing observability</div>
						<div className="mt-0.5 truncate text-[11px] text-muted-foreground">
							{selected ? `${providerLabel(selected.provider_slug ?? "unknown", providerNames)} selected from ${ranked.length} scored candidate${ranked.length === 1 ? "" : "s"}${excluded.length > 0 ? ` · ${excluded.length} excluded` : ""}` : "No candidate was selected"}
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
						<span className="flex items-center gap-1 font-mono">
							{algorithm}
							{!trace?.algorithm_version ? <MetricInfo metric="partialTrace" /> : null}
						</span>
						<span>·</span>
						<span>{label(mode)}</span>
						<ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
					</div>
				</div>
			</summary>

			<div className="border-t border-border/60 py-3">
				{trace ? (
					<MetricGrid values={{ seed: formatNumber(trace.random_seed, 0), priority: String(trace.priority ?? "default"), candidatePool: formatNumber(trace.final_candidate_count, 0) }} />
				) : null}
				{trace?.selection_method ? (
					<div className="mt-2 text-[11px] text-muted-foreground">
						Selection method <code className="text-foreground">{label(String(trace.selection_method))}</code>
					</div>
				) : null}
			</div>

			<div className="mt-2 border-y border-border/60">
				{ranked.map((decision) => <CandidateCard key={`${decision.decision_order}-${decision.provider_slug}`} decision={decision} maxScore={maxScore} providerNames={providerNames} routingMode={mode} />)}
				{excluded.map((decision) => <CandidateCard key={`${decision.decision_order}-${decision.provider_slug}`} decision={decision} maxScore={maxScore} providerNames={providerNames} routingMode={mode} />)}
			</div>
		</details>
	);
}
