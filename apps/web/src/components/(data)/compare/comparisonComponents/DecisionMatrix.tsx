/* eslint-disable max-lines */
"use client";

import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ExtendedModel, Price } from "@/data/types";
import {
	getLowerIsBetter,
	normalizeBenchmarkScoreValue,
	parseBenchmarkScore,
	resolveBenchmarkIsPercentage,
} from "@/lib/benchmarks/scoreFormat";
import { cn } from "@/lib/utils";
import { ExternalLink, Info, MessageSquare, Plus } from "lucide-react";
import { ProviderLogo } from "../ProviderLogo";
import type { CompareGatewayUsageByModel } from "../types";
import {
	ColumnGrid,
	CompareSection,
	MetricRow,
	MiniBars,
	TypeBadges,
} from "./ProviderComparisonPrimitives";

type DecisionMatrixProps = {
	selectedModels: ExtendedModel[];
	usageByModel: CompareGatewayUsageByModel;
};

type ProviderOption = {
	id: string;
	name: string;
	prices: Price[];
};

type CompareProviderPricingGroup = {
	provider: {
		api_provider_id: string;
		api_provider_name?: string | null;
		link?: string | null;
	};
	pricing_rules?: Array<{
		meter?: string | null;
		price_per_unit?: number | string | null;
		unit_size?: number | string | null;
		unit?: string | null;
		note?: string | null;
		pricing_plan?: string | null;
		currency?: string | null;
	}> | null;
};

type CompareExtendedModel = ExtendedModel & {
	compare_provider_pricing?: CompareProviderPricingGroup[] | null;
};

type PricePoint = {
	valuePerMillion: number | null;
	providerName: string | null;
	price: Price | null;
};

type PriceBundle = {
	input: PricePoint;
	output: PricePoint;
	cached: PricePoint;
};

type BenchmarkSummary = {
	wins: number;
	coverage: number;
	sharedCount: number;
};

type CapabilityChip = {
	label: string;
	active: boolean;
};

const DEFAULT_PROMPT =
	"Summarize the tradeoffs between these models for a coding-heavy support workflow.";
const BEST_TONE =
	"border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300";

function formatMonthYear(value: string | null | undefined): string {
	if (!value) return "-";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return "-";
	return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatInteger(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatCompact(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return Intl.NumberFormat("en-US", {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}

function formatUsd(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	const maximumFractionDigits = value > 0 && value < 0.01 ? 4 : 2;
	return `$${value.toLocaleString("en-US", {
		minimumFractionDigits: Math.min(2, maximumFractionDigits),
		maximumFractionDigits,
	})}`;
}

function formatRequestCost(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	if (value > 0 && value < 0.01) {
		return `$${value.toLocaleString("en-US", {
			minimumFractionDigits: 4,
			maximumFractionDigits: 4,
		})}`;
	}
	return `$${value.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function formatLatency(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	if (value >= 1000) {
		return `${(value / 1000).toLocaleString("en-US", {
			maximumFractionDigits: 2,
		})} s`;
	}
	return `${Math.round(value).toLocaleString("en-US")} ms`;
}

function formatThroughput(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} tok/s`;
}

function formatDuration(valueMs: number | null | undefined): string {
	if (valueMs == null || !Number.isFinite(valueMs)) return "-";
	if (valueMs < 1000) return `${Math.round(valueMs)} ms`;
	return `${(valueMs / 1000).toLocaleString("en-US", {
		maximumFractionDigits: 1,
	})} s`;
}

function estimateTokensFromText(value: string): number {
	const normalized = value.trim();
	if (!normalized) return 0;
	return Math.max(1, Math.ceil(normalized.length / 4));
}

function normalizePricePerMillion(
	pricePerUnit: number | null | undefined,
	unitSize: number | null | undefined
): number | null {
	if (pricePerUnit == null || !Number.isFinite(pricePerUnit)) return null;
	const normalizedUnitSize =
		unitSize != null && Number.isFinite(unitSize) && unitSize > 0 ? unitSize : 1;
	return (pricePerUnit * 1_000_000) / normalizedUnitSize;
}

function getProviderId(price: Price): string | null {
	if (price.api_provider_id) return price.api_provider_id;
	if (typeof price.api_provider === "string") return price.api_provider;
	return price.api_provider?.api_provider_id ?? null;
}

function getProviderName(price: Price): string | null {
	if (typeof price.api_provider === "object") {
		return price.api_provider.api_provider_name ?? getProviderId(price);
	}
	return getProviderId(price);
}

function getModelPrices(model: ExtendedModel): Price[] {
	const directPrices = model.prices ?? [];
	if (directPrices.length) return directPrices;

	const providerPricing =
		(model as CompareExtendedModel).compare_provider_pricing ?? [];
	const convertedPrices: Price[] = [];

	for (const group of providerPricing) {
		for (const rule of group.pricing_rules ?? []) {
			const pricePerUnit = Number(rule.price_per_unit);
			if (!Number.isFinite(pricePerUnit)) continue;

			const meter = String(rule.meter ?? "").trim().toLowerCase();
			const isCached = meter.includes("cached");
			const isOutput = meter.includes("output");
			const unitSize = Number(rule.unit_size ?? 1);
			const normalizedUnitSize =
				Number.isFinite(unitSize) && unitSize > 0 ? unitSize : 1;

			convertedPrices.push({
				api_provider_id: group.provider.api_provider_id,
				api_provider: {
					api_provider_id: group.provider.api_provider_id,
					api_provider_name:
						group.provider.api_provider_name ?? group.provider.api_provider_id,
					description: null,
					link: group.provider.link ?? null,
				},
				input_token_price: !isCached && !isOutput ? pricePerUnit : null,
				cached_input_token_price: isCached ? pricePerUnit : null,
				output_token_price: isOutput ? pricePerUnit : null,
				throughput: null,
				latency: null,
				source_link: group.provider.link ?? null,
				other_info: rule.note ?? null,
				meter: rule.meter ?? null,
				pricing_plan: rule.pricing_plan ?? null,
				unit_size: normalizedUnitSize,
				currency: rule.currency ?? "USD",
			});
		}
	}

	return convertedPrices;
}

function getProviderOptions(model: ExtendedModel): ProviderOption[] {
	const byProvider = new Map<string, ProviderOption>();

	for (const price of getModelPrices(model)) {
		if (price.meter === "summary") continue;
		const id = getProviderId(price);
		if (!id) continue;
		const existing = byProvider.get(id);
		if (existing) {
			existing.prices.push(price);
			continue;
		}
		byProvider.set(id, {
			id,
			name: getProviderName(price) ?? id,
			prices: [price],
		});
	}

	for (const group of (model as CompareExtendedModel).compare_provider_pricing ?? []) {
		if (!byProvider.has(group.provider.api_provider_id)) {
			byProvider.set(group.provider.api_provider_id, {
				id: group.provider.api_provider_id,
				name:
					group.provider.api_provider_name ?? group.provider.api_provider_id,
				prices: [],
			});
		}
	}

	return Array.from(byProvider.values()).sort((a, b) =>
		a.name.localeCompare(b.name)
	);
}

function isMeterMatch(
	price: Price,
	kind: "input" | "output" | "cached"
): boolean {
	const meter = String(price.meter ?? "").trim().toLowerCase();
	if (!meter) return true;
	if (kind === "cached") return meter.includes("cached");
	if (kind === "input") {
		return (
			meter.includes("input") &&
			!meter.includes("cached") &&
			!meter.includes("output")
		);
	}
	return meter.includes("output");
}

function getPricePoint(
	model: ExtendedModel,
	providerId: string | null | undefined,
	kind: "input" | "output" | "cached"
): PricePoint {
	let best: PricePoint = { valuePerMillion: null, providerName: null, price: null };

	for (const price of getModelPrices(model)) {
		if (price.meter === "summary") continue;
		if (providerId && getProviderId(price) !== providerId) continue;
		if (!isMeterMatch(price, kind)) continue;

		const rawValue =
			kind === "cached"
				? price.cached_input_token_price
				: kind === "input"
					? price.input_token_price
					: price.output_token_price;

		const valuePerMillion = normalizePricePerMillion(
			rawValue,
			price.unit_size ?? null
		);
		if (valuePerMillion == null) continue;

		if (best.valuePerMillion == null || valuePerMillion < best.valuePerMillion) {
			best = {
				valuePerMillion,
				providerName: getProviderName(price),
				price,
			};
		}
	}

	return best;
}

function getPriceBundle(
	model: ExtendedModel,
	providerId: string | null | undefined
): PriceBundle {
	return {
		input: getPricePoint(model, providerId, "input"),
		output: getPricePoint(model, providerId, "output"),
		cached: getPricePoint(model, providerId, "cached"),
	};
}

function selectDefaultProviderId(model: ExtendedModel): string | null {
	let best: { id: string; score: number } | null = null;

	for (const option of getProviderOptions(model)) {
		const prices = getPriceBundle(model, option.id);
		const scoredValues = [
			prices.input.valuePerMillion,
			prices.output.valuePerMillion,
		].filter((value): value is number => value != null && Number.isFinite(value));

		const score = scoredValues.length
			? scoredValues.reduce((sum, value) => sum + value, 0)
			: Number.POSITIVE_INFINITY;
		if (!best || score < best.score) {
			best = { id: option.id, score };
		}
	}

	return best?.id ?? null;
}

function toTypeList(value: ExtendedModel["input_types"]): string[] {
	if (!value) return [];
	if (Array.isArray(value)) return value.filter(Boolean);
	return String(value)
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function buildCapabilityChips(model: ExtendedModel): CapabilityChip[] {
	return [
		{ label: "Reasoning", active: Boolean(model.reasoning) },
		{ label: "Web", active: Boolean(model.web_access) },
		{ label: "Fine-tune", active: Boolean(model.fine_tunable) },
	];
}

function buildBenchmarkSummaries(models: ExtendedModel[]): Map<string, BenchmarkSummary> {
	const benchmarkNames = Array.from(
		new Set(models.flatMap((model) => model.benchmark_results?.map((b) => b.benchmark.name) ?? []))
	);
	const summaryByModel = new Map<string, BenchmarkSummary>(
		models.map((model) => [
			model.id,
			{
				wins: 0,
				coverage: model.benchmark_results?.length ?? 0,
				sharedCount: 0,
			},
		])
	);

	for (const benchmarkName of benchmarkNames) {
		const entries = models
			.map((model) => {
				const result = model.benchmark_results?.find(
					(benchmark) => benchmark.benchmark.name === benchmarkName
				);
				return { model, result };
			})
			.filter((entry) => entry.result);

		if (entries.length < 2) continue;

		const benchmark = entries[0].result?.benchmark;
		const isLowerBetter = getLowerIsBetter(benchmark?.order);
		const isPercent = resolveBenchmarkIsPercentage({
			benchmarkType: benchmark?.type,
			fallback: entries.some((entry) =>
				String(entry.result?.score ?? "").trim().endsWith("%")
			),
		});
		const scored = entries
			.map((entry) => ({
				modelId: entry.model.id,
				score: normalizeBenchmarkScoreValue(
					parseBenchmarkScore(entry.result?.score),
					isPercent
				),
			}))
			.filter((entry): entry is { modelId: string; score: number } =>
				entry.score != null && Number.isFinite(entry.score)
			);

		if (scored.length < 2) continue;
		const bestScore = isLowerBetter
			? Math.min(...scored.map((entry) => entry.score))
			: Math.max(...scored.map((entry) => entry.score));

		for (const entry of scored) {
			const summary = summaryByModel.get(entry.modelId);
			if (!summary) continue;
			summary.sharedCount += 1;
			if (Math.abs(entry.score - bestScore) < 0.000001) {
				summary.wins += 1;
			}
		}
	}

	return summaryByModel;
}

function bestNumber(
	models: ExtendedModel[],
	getValue: (model: ExtendedModel) => number | null | undefined,
	direction: "min" | "max"
): number | null {
	const values = models
		.map(getValue)
		.filter((value): value is number => value != null && Number.isFinite(value));
	if (!values.length) return null;
	return direction === "min" ? Math.min(...values) : Math.max(...values);
}

function isBest(
	value: number | null | undefined,
	best: number | null,
	highlightBest: boolean
): boolean {
	return (
		highlightBest &&
		value != null &&
		best != null &&
		best > 0 &&
		Math.abs(value - best) < 0.000001
	);
}

function getSelectedProviderId(
	model: ExtendedModel,
	options: ProviderOption[],
	selectedProviderByModel: Record<string, string>
): string | null {
	const selected = selectedProviderByModel[model.id];
	if (selected && options.some((option) => option.id === selected)) {
		return selected;
	}
	return selectDefaultProviderId(model);
}

function getContextFit(
	model: ExtendedModel,
	inputTokens: number,
	outputTokens: number
) {
	const inputLimit = model.input_context_length ?? null;
	const outputLimit = model.output_context_length ?? null;
	const inputFits = inputLimit == null || inputTokens <= inputLimit;
	const outputFits = outputLimit == null || outputTokens <= outputLimit;
	return {
		fits: inputFits && outputFits,
		inputLimit,
		outputLimit,
	};
}

function Highlight({
	active,
	children,
}: {
	active?: boolean;
	children: React.ReactNode;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-md border border-transparent px-1.5 py-0.5",
				active && BEST_TONE
			)}
		>
			{children}
		</span>
	);
}

export default function DecisionMatrix({
	selectedModels,
	usageByModel,
}: DecisionMatrixProps) {
	const [highlightBest, setHighlightBest] = React.useState(true);
	const [selectedProviderByModel, setSelectedProviderByModel] = React.useState<
		Record<string, string>
	>({});
	const [prompt, setPrompt] = React.useState(DEFAULT_PROMPT);
	const [outputTokens, setOutputTokens] = React.useState(800);
	const [useCache, setUseCache] = React.useState(false);
	const modelBarRef = React.useRef<HTMLDivElement | null>(null);
	const [showStickyCompareBar, setShowStickyCompareBar] = React.useState(false);

	const providerOptionsByModel = React.useMemo(
		() =>
			new Map(
				selectedModels.map((model) => [model.id, getProviderOptions(model)])
			),
		[selectedModels]
	);
	const benchmarkSummaryByModel = React.useMemo(
		() => buildBenchmarkSummaries(selectedModels),
		[selectedModels]
	);

	React.useEffect(() => {
		const node = modelBarRef.current;
		if (!node || typeof IntersectionObserver === "undefined") return;

		const observer = new IntersectionObserver(
			([entry]) => {
				setShowStickyCompareBar(!entry.isIntersecting);
			},
			{
				rootMargin: "-60px 0px 0px 0px",
				threshold: 0,
			}
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, [selectedModels.length]);

	if (!selectedModels.length) return null;

	const selectedProviderIds = new Map(
		selectedModels.map((model) => {
			const options = providerOptionsByModel.get(model.id) ?? [];
			return [
				model.id,
				getSelectedProviderId(model, options, selectedProviderByModel),
			];
		})
	);
	const priceByModel = new Map(
		selectedModels.map((model) => [
			model.id,
			getPriceBundle(model, selectedProviderIds.get(model.id)),
		])
	);
	const inputTokens = estimateTokensFromText(prompt);
	const safeOutputTokens = Math.max(0, Math.min(1_000_000, outputTokens || 0));

	const bestInputContext = bestNumber(
		selectedModels,
		(model) => model.input_context_length,
		"max"
	);
	const bestOutputContext = bestNumber(
		selectedModels,
		(model) => model.output_context_length,
		"max"
	);
	const bestProviderCount = bestNumber(
		selectedModels,
		(model) => providerOptionsByModel.get(model.id)?.length ?? 0,
		"max"
	);
	const bestInputPrice = bestNumber(
		selectedModels,
		(model) => priceByModel.get(model.id)?.input.valuePerMillion,
		"min"
	);
	const bestOutputPrice = bestNumber(
		selectedModels,
		(model) => priceByModel.get(model.id)?.output.valuePerMillion,
		"min"
	);
	const bestCachedPrice = bestNumber(
		selectedModels,
		(model) => priceByModel.get(model.id)?.cached.valuePerMillion,
		"min"
	);
	const bestBenchmarkWins = bestNumber(
		selectedModels,
		(model) => benchmarkSummaryByModel.get(model.id)?.wins,
		"max"
	);
	const bestTokens30d = bestNumber(
		selectedModels,
		(model) => usageByModel[model.id]?.tokens30d,
		"max"
	);
	const bestLatency = bestNumber(
		selectedModels,
		(model) => usageByModel[model.id]?.latencyP50Ms30m,
		"min"
	);
	const bestThroughput = bestNumber(
		selectedModels,
		(model) => usageByModel[model.id]?.throughputP50TokPerSec30m,
		"max"
	);

	const simulationRows = selectedModels.map((model) => {
		const prices = priceByModel.get(model.id);
		const inputPrice =
			useCache && prices?.cached.valuePerMillion != null
				? prices.cached
				: prices?.input;
		const inputCost =
			inputPrice?.valuePerMillion == null
				? null
				: (inputTokens / 1_000_000) * inputPrice.valuePerMillion;
		const outputCost =
			prices?.output.valuePerMillion == null
				? null
				: (safeOutputTokens / 1_000_000) * prices.output.valuePerMillion;
		const totalCost =
			inputCost == null && outputCost == null
				? null
				: (inputCost ?? 0) + (outputCost ?? 0);
		const usage = usageByModel[model.id];
		const estimatedTimeMs =
			usage?.throughputP50TokPerSec30m != null &&
			usage.throughputP50TokPerSec30m > 0
				? (usage.latencyP50Ms30m ?? 0) +
					(safeOutputTokens / usage.throughputP50TokPerSec30m) * 1000
				: usage?.latencyP50Ms30m ?? null;

		return {
			model,
			inputPrice,
			outputPrice: prices?.output,
			totalCost,
			estimatedTimeMs,
			context: getContextFit(model, inputTokens, safeOutputTokens),
		};
	});
	const cheapestSimulation = bestNumber(
		selectedModels,
		(model) =>
			simulationRows.find((row) => row.model.id === model.id)?.totalCost,
		"min"
	);
	const fastestSimulation = bestNumber(
		selectedModels,
		(model) =>
			simulationRows.find((row) => row.model.id === model.id)?.estimatedTimeMs,
		"min"
	);

	const renderModelProviderBar = (keyPrefix: string) => (
		<>
			<div className="mb-3 flex flex-wrap items-center justify-end gap-2">
				<label className="flex items-center gap-2 text-sm text-muted-foreground">
					<Switch checked={highlightBest} onCheckedChange={setHighlightBest} />
					<span>Highlight best</span>
				</label>
				<Button
					asChild
					size="sm"
					className="border border-zinc-800 bg-black text-white hover:bg-zinc-900 dark:border-zinc-700 dark:bg-black dark:text-white dark:hover:bg-zinc-900"
				>
					<Link href="/compare">
						<Plus className="size-4" />
						Add model
					</Link>
				</Button>
				<Button asChild variant="outline" size="sm">
					<Link href="/chat">
						<MessageSquare className="size-4" />
						Chat
					</Link>
				</Button>
			</div>
			<ColumnGrid selectedModels={selectedModels}>
				{selectedModels.map((model) => {
					const options = providerOptionsByModel.get(model.id) ?? [];
					const selectedProviderId = selectedProviderIds.get(model.id);
					const selectedProvider = options.find(
						(option) => option.id === selectedProviderId
					);

					return (
						<div key={`${keyPrefix}-${model.id}`} className="space-y-2">
							<div className="flex min-h-[60px] items-center justify-between gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 shadow-sm">
								<div className="flex min-w-0 items-center gap-2">
									<ProviderLogo
										id={model.provider.provider_id}
										alt={model.provider.name}
										size="xs"
										className="shrink-0"
									/>
									<div className="min-w-0">
										<Link
											href={`/models/${model.id}`}
											className="block truncate text-sm font-semibold text-foreground underline decoration-transparent underline-offset-2 hover:decoration-current"
										>
											{model.name}
										</Link>
									</div>
								</div>
								<div className="flex shrink-0 items-center gap-1">
									<Button
										asChild
										variant="ghost"
										size="icon-sm"
										className="size-7 text-muted-foreground"
									>
										<Link
											href={`/models/${model.id}`}
											aria-label={`View ${model.name} details`}
										>
											<Info className="size-3.5" />
										</Link>
									</Button>
									{model.api_reference_link ? (
										<Button
											asChild
											variant="ghost"
											size="icon-sm"
											className="size-7 text-muted-foreground"
										>
											<a
												href={model.api_reference_link}
												target="_blank"
												rel="noreferrer"
												aria-label={`Open ${model.name} API reference`}
											>
												<ExternalLink className="size-3.5" />
											</a>
										</Button>
									) : null}
								</div>
							</div>
							<Select
								value={selectedProviderId ?? "__none__"}
								disabled={!options.length}
								onValueChange={(value) =>
									setSelectedProviderByModel((current) => ({
										...current,
										[model.id]: value,
									}))
								}
							>
								<SelectTrigger
									aria-label={`Select provider for ${model.name}`}
									className="h-8 w-full rounded-md bg-background px-2 text-xs"
								>
									{selectedProviderId ? (
										<ProviderLogo
											id={selectedProviderId}
											alt={selectedProvider?.name ?? selectedProviderId}
											size="xxs"
											className="mr-2 shrink-0"
										/>
									) : null}
									<SelectValue
										placeholder={selectedProvider?.name ?? "No priced providers"}
									/>
								</SelectTrigger>
								<SelectContent>
									{!options.length ? (
										<SelectItem value="__none__" disabled>
											No priced providers
										</SelectItem>
									) : null}
									{options.map((option) => (
										<SelectItem key={option.id} value={option.id}>
											{option.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					);
				})}
			</ColumnGrid>
		</>
	);

	return (
		<section className="space-y-8" id="compare-provider-surface">
			<div ref={modelBarRef} className="border-b border-border/70 pb-3">
				{renderModelProviderBar("base")}
			</div>
			{showStickyCompareBar ? (
				<div className="fixed left-0 right-0 top-[60px] z-30 border-b border-border/70 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
					<div className="container mx-auto px-4 py-3">
						{renderModelProviderBar("sticky")}
					</div>
				</div>
			) : null}

			<CompareSection title="Overview" selectedModels={selectedModels}>
				{selectedModels.map((model) => {
					const inputTypes = toTypeList(model.input_types);
					const outputTypes = toTypeList(model.output_types);
					const options = providerOptionsByModel.get(model.id) ?? [];

					return (
						<div key={`${model.id}-overview`} className="px-4">
							<MetricRow label="Input modalities">
								<TypeBadges values={inputTypes} />
							</MetricRow>
							<MetricRow label="Output modalities">
								<TypeBadges values={outputTypes} />
							</MetricRow>
							<MetricRow label="Providers">
								<a
									href="#compare-availability"
									className={cn(
										"underline underline-offset-2",
										isBest(options.length, bestProviderCount, highlightBest) &&
											"rounded-md border px-1.5 py-0.5 no-underline " + BEST_TONE
									)}
								>
									{options.length
										? `${options.length} provider${options.length === 1 ? "" : "s"}`
										: "None"}
								</a>
							</MetricRow>
							<MetricRow label="Input context">
								<Highlight
									active={isBest(
										model.input_context_length,
										bestInputContext,
										highlightBest
									)}
								>
									{formatInteger(model.input_context_length)}
								</Highlight>
							</MetricRow>
							<MetricRow label="Max output">
								<Highlight
									active={isBest(
										model.output_context_length,
										bestOutputContext,
										highlightBest
									)}
								>
									{formatInteger(model.output_context_length)}
								</Highlight>
							</MetricRow>
							<MetricRow label="Release">
								{formatMonthYear(model.release_date)}
							</MetricRow>
							<MetricRow label="Capabilities">
								<div className="flex flex-wrap justify-end gap-1">
									{buildCapabilityChips(model).map((chip) => (
										<Badge
											key={`${model.id}-${chip.label}`}
											variant="outline"
											className={cn(
												"h-5 rounded px-1.5 text-[10px]",
												!chip.active && "opacity-35"
											)}
										>
											{chip.label}
										</Badge>
									))}
								</div>
							</MetricRow>
						</div>
					);
				})}
			</CompareSection>

			<CompareSection title="Pricing" selectedModels={selectedModels}>
				{selectedModels.map((model) => {
					const prices = priceByModel.get(model.id);
					const selectedProviderId = selectedProviderIds.get(model.id);
					const selectedProvider = providerOptionsByModel
						.get(model.id)
						?.find((option) => option.id === selectedProviderId);
					const sourceLink =
						prices?.input.price?.source_link ??
						prices?.output.price?.source_link ??
						prices?.cached.price?.source_link;
					const plan =
						prices?.input.price?.pricing_plan ??
						prices?.output.price?.pricing_plan ??
						prices?.cached.price?.pricing_plan;

					return (
						<div key={`${model.id}-pricing`} className="px-4">
							<MetricRow label="Provider">
								<div className="flex items-center justify-end gap-2">
									{selectedProviderId ? (
										<ProviderLogo
											id={selectedProviderId}
											alt={selectedProvider?.name ?? selectedProviderId}
											size="xxs"
										/>
									) : null}
									<span className="truncate">
										{selectedProvider?.name ?? "No provider selected"}
									</span>
								</div>
							</MetricRow>
							<MetricRow label="Input">
								<Highlight
									active={isBest(
										prices?.input.valuePerMillion,
										bestInputPrice,
										highlightBest
									)}
								>
									{formatUsd(prices?.input.valuePerMillion)} / M tokens
								</Highlight>
							</MetricRow>
							<MetricRow label="Output">
								<Highlight
									active={isBest(
										prices?.output.valuePerMillion,
										bestOutputPrice,
										highlightBest
									)}
								>
									{formatUsd(prices?.output.valuePerMillion)} / M tokens
								</Highlight>
							</MetricRow>
							<MetricRow label="Cached input">
								<Highlight
									active={isBest(
										prices?.cached.valuePerMillion,
										bestCachedPrice,
										highlightBest
									)}
								>
									{formatUsd(prices?.cached.valuePerMillion)} / M tokens
								</Highlight>
							</MetricRow>
							<MetricRow label="Plan">
								<span className="truncate">{plan ?? "-"}</span>
							</MetricRow>
							<MetricRow label="Source">
								{sourceLink ? (
									<a
										href={sourceLink}
										target="_blank"
										rel="noreferrer"
										className="underline underline-offset-2"
									>
										Pricing source
									</a>
								) : (
									"-"
								)}
							</MetricRow>
						</div>
					);
				})}
			</CompareSection>

			<CompareSection title="Performance" selectedModels={selectedModels}>
				{selectedModels.map((model) => {
					const usage = usageByModel[model.id];
					const prices = priceByModel.get(model.id);
					const providerLatency =
						prices?.input.price?.latency ??
						prices?.output.price?.latency ??
						prices?.cached.price?.latency;
					const providerThroughput =
						prices?.input.price?.throughput ??
						prices?.output.price?.throughput ??
						prices?.cached.price?.throughput;

					return (
						<div key={`${model.id}-performance`} className="px-4">
							<MetricRow label="Latency (p50)">
								<Highlight
									active={isBest(
										usage?.latencyP50Ms30m,
										bestLatency,
										highlightBest
									)}
								>
									{formatLatency(usage?.latencyP50Ms30m)}
								</Highlight>
							</MetricRow>
							<MetricRow label="Throughput (p50)">
								<Highlight
									active={isBest(
										usage?.throughputP50TokPerSec30m,
										bestThroughput,
										highlightBest
									)}
								>
									{formatThroughput(usage?.throughputP50TokPerSec30m)}
								</Highlight>
							</MetricRow>
							<MetricRow label="Provider latency">
								{providerLatency ?? "-"}
							</MetricRow>
							<MetricRow label="Provider throughput">
								{providerThroughput ?? "-"}
							</MetricRow>
							<MetricRow label="Visualize performance">
								<a
									href="#compare-benchmarks"
									className="underline underline-offset-2"
								>
									View charts
								</a>
							</MetricRow>
						</div>
					);
				})}
			</CompareSection>

			<CompareSection title="Activity" selectedModels={selectedModels}>
				{selectedModels.map((model) => {
					const usage = usageByModel[model.id];

					return (
						<div key={`${model.id}-activity`} className="px-4">
							<MetricRow label="30d tokens">
								<Highlight
									active={isBest(usage?.tokens30d, bestTokens30d, highlightBest)}
								>
									{formatCompact(usage?.tokens30d)}
								</Highlight>
							</MetricRow>
							<div className="border-b border-border/60 py-3">
								<MiniBars modelId={model.id} points={usage?.points30d ?? []} />
							</div>
							<MetricRow label="Total requests">
								{formatCompact(usage?.totalRequests)}
							</MetricRow>
							<MetricRow label="Requests in 30m">
								{formatCompact(usage?.requests30m)}
							</MetricRow>
						</div>
					);
				})}
			</CompareSection>

			<CompareSection title="Benchmarks" selectedModels={selectedModels}>
				{selectedModels.map((model) => {
					const summary = benchmarkSummaryByModel.get(model.id);

					return (
						<div key={`${model.id}-benchmarks`} className="px-4">
							<MetricRow label="Shared wins">
								<Highlight
									active={isBest(
										summary?.wins,
										bestBenchmarkWins,
										highlightBest
									)}
								>
									{summary?.wins ?? 0}
								</Highlight>
							</MetricRow>
							<MetricRow label="Comparable tests">
								{summary?.sharedCount ?? 0}
							</MetricRow>
							<MetricRow label="Total results">
								{summary?.coverage ?? 0}
							</MetricRow>
							<MetricRow label="Benchmark charts">
								<a
									href="#compare-benchmarks"
									className="underline underline-offset-2"
								>
									View detail
								</a>
							</MetricRow>
						</div>
					);
				})}
			</CompareSection>

			<CompareSection title="Simulate a response" selectedModels={selectedModels}>
				{selectedModels.map((model) => {
					const row = simulationRows.find((item) => item.model.id === model.id);

					return (
						<div key={`${model.id}-simulation`} className="px-4">
							<div className="border-b border-border/60 pb-3">
								<Textarea
									value={prompt}
									onChange={(event) => setPrompt(event.target.value)}
									className="min-h-24 resize-y bg-background text-xs"
									aria-label="Prompt for response simulation"
								/>
							</div>
							<div className="grid grid-cols-[minmax(0,1fr)_112px] items-end gap-2 border-b border-border/60 py-3">
								<label className="space-y-1 text-xs text-muted-foreground">
									<span>Expected output tokens</span>
									<Input
										type="number"
										min={0}
										max={1_000_000}
										value={outputTokens}
										onChange={(event) =>
											setOutputTokens(
												Number.parseInt(event.target.value || "0", 10)
											)
										}
										className="h-8 bg-background"
									/>
								</label>
								<label className="flex h-8 items-center justify-end gap-2 text-xs text-muted-foreground">
									<Switch checked={useCache} onCheckedChange={setUseCache} />
									<span>Cache</span>
								</label>
							</div>
							<MetricRow label="Estimated input">
								{formatInteger(inputTokens)} tokens
							</MetricRow>
							<MetricRow label="Context fit">
								<Badge
									variant="outline"
									className={cn(
										"text-[10px]",
										row?.context.fits
											? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300"
											: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300"
									)}
								>
									{row?.context.fits ? "Fits" : "Check limits"}
								</Badge>
							</MetricRow>
							<MetricRow label="Estimated cost">
								<Highlight
									active={isBest(
										row?.totalCost,
										cheapestSimulation,
										highlightBest
									)}
								>
									{formatRequestCost(row?.totalCost)}
								</Highlight>
							</MetricRow>
							<MetricRow label="Est. response time">
								<Highlight
									active={isBest(
										row?.estimatedTimeMs,
										fastestSimulation,
										highlightBest
									)}
								>
									{formatDuration(row?.estimatedTimeMs)}
								</Highlight>
							</MetricRow>
							<MetricRow label="Pricing basis">
								<span className="truncate">
									{formatUsd(row?.inputPrice?.valuePerMillion)} in /{" "}
									{formatUsd(row?.outputPrice?.valuePerMillion)} out
								</span>
							</MetricRow>
						</div>
					);
				})}
			</CompareSection>
		</section>
	);
}
