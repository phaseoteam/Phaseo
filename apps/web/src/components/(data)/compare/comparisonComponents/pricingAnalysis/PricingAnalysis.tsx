"use client";

import type { ExtendedModel, Price } from "@/data/types";
import {
	Card,
	CardHeader,
	CardTitle,
	CardContent,
} from "@/components/ui/card";
import { Badge, badgeVariants } from "@/components/ui/badge";
import PricingBarChart from "./PricingBarChart";
import React from "react";
import Link from "next/link";
import { ProviderLogoName } from "../../ProviderLogoName";
import { ProviderLogo } from "../../ProviderLogo";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface PricingAnalysisProps {
	selectedModels: ExtendedModel[];
}

function LinearScaleIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 20 20"
			className="h-4 w-4"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M3 17h14" />
			<path d="M3 17V4" />
			<path d="M6 14l3-3 2 1 4-5" />
		</svg>
	);
}

function LogScaleIcon() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 20 20"
			className="h-4 w-4"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			<path d="M3 17h14" />
			<path d="M3 17V4" />
			<path d="M5.5 14.5c0-2.2.8-3.8 2.4-4.8 1.5-.9 3.3-1.3 5.6-1.3" />
			<path d="M12.5 8.4h1.1v1.1" />
		</svg>
	);
}

type PricingProvider = { id: string; name: string };
type ProviderSelectionByModel = Record<string, string>;

type PricePoint = {
	valuePerMillion: number | null;
	provider: PricingProvider | null;
};

type ModelPricingSummary = {
	model: ExtendedModel;
	input: PricePoint;
	output: PricePoint;
	blendedPerMillion: number | null;
	providers: PricingProvider[];
	selectedProviderId: string;
	selectedProviderLabel: string;
};

type PricingChartDatum = {
	model: string;
	input: number | null;
	output: number | null;
	blended: number | null;
	inputProvider: string | null;
	outputProvider: string | null;
};

const BLENDED_INPUT_WEIGHT = 0.9;
const BLENDED_OUTPUT_WEIGHT = 0.1;
const BEST_PROVIDER_OPTION = "__best";

function normalizePricePerMillion(
	pricePerUnit: number | null | undefined,
	unitSize: number | null | undefined
): number | null {
	if (pricePerUnit == null || !Number.isFinite(pricePerUnit)) return null;
	const normalizedUnitSize =
		unitSize != null && Number.isFinite(unitSize) && unitSize > 0 ? unitSize : 1;
	return (pricePerUnit * 1_000_000) / normalizedUnitSize;
}

function formatUsd(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "-";
	return `$${value.toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function meterMatchesInput(meter: string): boolean {
	const normalized = meter.trim().toLowerCase();
	return (
		normalized.includes("input") &&
		normalized.includes("token") &&
		!normalized.includes("cached") &&
		!normalized.includes("output")
	);
}

function meterMatchesOutput(meter: string): boolean {
	const normalized = meter.trim().toLowerCase();
	return normalized.includes("output") && normalized.includes("token");
}

function getProviderIdFromPrice(price: Price): string | null {
	return (
		price.api_provider_id ??
		(typeof price.api_provider === "string"
			? price.api_provider
			: price.api_provider?.api_provider_id) ??
		null
	);
}

function resolveProvider(price: Price): PricingProvider | null {
	const providerId = getProviderIdFromPrice(price);
	if (!providerId) return null;

	const providerName =
		typeof price.api_provider === "object"
			? price.api_provider.api_provider_name ?? providerId
			: providerId;
	return {
		id: providerId,
		name: providerName,
	};
}

function selectBestPricePoint(
	prices: Price[],
	kind: "input" | "output"
): PricePoint {
	let best: PricePoint = { valuePerMillion: null, provider: null };

	for (const price of prices) {
		if (!price) continue;
		if (price.meter === "summary") continue;

		const meter = (price.meter ?? "").trim().toLowerCase();
		if (meter) {
			const matches = kind === "input" ? meterMatchesInput(meter) : meterMatchesOutput(meter);
			if (!matches) continue;
		}

		const rawValue =
			kind === "input" ? price.input_token_price : price.output_token_price;
		const valuePerMillion = normalizePricePerMillion(rawValue, price.unit_size ?? null);
		if (valuePerMillion == null) continue;

		if (best.valuePerMillion == null || valuePerMillion < best.valuePerMillion) {
			best = {
				valuePerMillion,
				provider: resolveProvider(price),
			};
		}
	}

	return best;
}

function calculateBlendedTotal(
	inputPerMillion: number | null,
	outputPerMillion: number | null
): number | null {
	if (inputPerMillion == null && outputPerMillion == null) return null;
	if (inputPerMillion == null) return outputPerMillion;
	if (outputPerMillion == null) return inputPerMillion;
	return (
		inputPerMillion * BLENDED_INPUT_WEIGHT +
		outputPerMillion * BLENDED_OUTPUT_WEIGHT
	);
}

function getPricingProviders(model: ExtendedModel): PricingProvider[] {
	const providers: PricingProvider[] = [];
	const seen = new Set<string>();

	for (const price of model.prices ?? []) {
		if (!price) continue;
		if (price.meter === "summary") continue;
		const provider = resolveProvider(price);
		if (!provider || seen.has(provider.id)) continue;
		seen.add(provider.id);
		providers.push(provider);
	}

	return providers;
}

function getEffectivePricesForProvider(
	model: ExtendedModel,
	selectedProviderId: string
): Price[] {
	const prices = model.prices ?? [];
	if (!prices.length) return [];
	if (!selectedProviderId || selectedProviderId === BEST_PROVIDER_OPTION) {
		return prices;
	}
	return prices.filter((price) => getProviderIdFromPrice(price) === selectedProviderId);
}

function buildPricingSummary(
	model: ExtendedModel,
	selectedProviderId: string
): ModelPricingSummary {
	const providers = getPricingProviders(model);
	const selectedProvider =
		selectedProviderId && selectedProviderId !== BEST_PROVIDER_OPTION
			? providers.find((provider) => provider.id === selectedProviderId) ?? null
			: null;
	const effectivePrices = getEffectivePricesForProvider(model, selectedProviderId);
	const input = selectBestPricePoint(effectivePrices, "input");
	const output = selectBestPricePoint(effectivePrices, "output");

	return {
		model,
		input,
		output,
		blendedPerMillion: calculateBlendedTotal(input.valuePerMillion, output.valuePerMillion),
		providers,
		selectedProviderId:
			selectedProvider?.id ?? BEST_PROVIDER_OPTION,
		selectedProviderLabel:
			selectedProvider?.name ?? "Best option",
	};
}

function getCheapestBadge(summaries: ModelPricingSummary[]) {
	const priced = summaries.filter(
		(summary) =>
			summary.blendedPerMillion != null && Number.isFinite(summary.blendedPerMillion)
	);
	if (priced.length < 2) return null;

	const min = Math.min(...priced.map((summary) => summary.blendedPerMillion ?? Number.POSITIVE_INFINITY));
	const cheapest = priced.filter(
		(summary) => Math.abs((summary.blendedPerMillion ?? 0) - min) < 0.000001
	);

	if (cheapest.length === 1) {
		return (
			<Badge
				variant="default"
				className="bg-green-100 text-green-800 border border-green-300 hover:bg-green-200 hover:text-green-900 hover:border-green-400 transition-colors"
			>
				{cheapest[0].model.name} is cheapest
			</Badge>
		);
	}

	return (
		<Badge
			variant="secondary"
			className="bg-blue-100 text-blue-800 border border-blue-300"
		>
			Tied: {cheapest.map((summary) => summary.model.name).join(", ")}
		</Badge>
	);
}

function getStatCards(
	summaries: ModelPricingSummary[],
	providerSelectionByModel: ProviderSelectionByModel,
	onProviderSelectionChange: (modelId: string, providerId: string) => void
) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-3">
			{summaries.map((summary) => {
				const model = summary.model;
				const selectedProviderId =
					providerSelectionByModel[model.id] ?? BEST_PROVIDER_OPTION;

				return (
					<Card key={model.id} className="shadow-sm border border-border/60">
						<CardHeader className="pb-2">
							<CardTitle className="text-base font-semibold flex items-center gap-2">
								<ProviderLogoName
									id={model.provider.provider_id}
									name={model.provider.name}
									href={`/organisations/${model.provider.provider_id}`}
									size="xxs"
									className="mr-2"
									mobilePopover
								/>
								<Link href={`/models/${model.id}`} className="group">
									<span className="relative underline decoration-transparent group-hover:decoration-current transition-colors duration-200">
										{model.name}
									</span>
								</Link>
							</CardTitle>
						</CardHeader>
						<CardContent className="pt-0 space-y-3">
							<div className="grid grid-cols-3 gap-3">
								<div className="space-y-0.5">
									<div className="text-[11px] font-medium text-muted-foreground">
										Input $/M
									</div>
									<div className="font-mono text-foreground">
										{formatUsd(summary.input.valuePerMillion)}
									</div>
									<div className="text-[10px] text-muted-foreground truncate">
										{summary.input.provider?.name ?? "-"}
									</div>
								</div>
								<div className="space-y-0.5">
									<div className="text-[11px] font-medium text-muted-foreground">
										Output $/M
									</div>
									<div className="font-mono text-foreground">
										{formatUsd(summary.output.valuePerMillion)}
									</div>
									<div className="text-[10px] text-muted-foreground truncate">
										{summary.output.provider?.name ?? "-"}
									</div>
								</div>
								<div className="space-y-0.5">
									<div className="text-[11px] font-medium text-muted-foreground">
										Blended $/M
									</div>
									<div className="font-mono text-foreground">
										{formatUsd(summary.blendedPerMillion)}
									</div>
									<div className="text-[10px] text-muted-foreground">
										90/10 input-output
									</div>
								</div>
							</div>

							<div className="space-y-2">
								{summary.providers.length ? (
									<div className="flex flex-wrap items-center gap-2">
										{summary.providers.map((provider) => (
											<button
												key={`${model.id}-${provider.id}`}
												type="button"
												onClick={() =>
													onProviderSelectionChange(model.id, provider.id)
												}
												title={provider.name}
												className={cn(
													badgeVariants({ variant: "outline" }),
													"h-7 px-2 text-[11px] cursor-pointer gap-1.5 border-border/70 bg-background hover:bg-muted/50",
													selectedProviderId === provider.id &&
														"border-primary/60 bg-primary/10 text-foreground shadow-sm"
												)}
												aria-pressed={selectedProviderId === provider.id}
											>
												<ProviderLogo
													id={provider.id}
													alt={provider.name}
													size="xxs"
													className="!h-4 !w-4 !rounded-sm border-0 bg-transparent"
												/>
												{provider.name}
											</button>
										))}
									</div>
								) : (
									<p className="text-xs text-muted-foreground">No providers found yet.</p>
								)}
							</div>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}

function toChartData(summaries: ModelPricingSummary[]): PricingChartDatum[] {
	return summaries.map((summary) => ({
		model: summary.model.name,
		input: summary.input.valuePerMillion,
		output: summary.output.valuePerMillion,
		blended: summary.blendedPerMillion,
		inputProvider: summary.input.provider?.name ?? null,
		outputProvider: summary.output.provider?.name ?? null,
	}));
}

function BarChartTooltip({ active, payload, label }: any) {
	if (!active || !payload || payload.length === 0) return null;
	const point = payload[0]?.payload as PricingChartDatum | undefined;
	if (!point) return null;

	return (
		<Card className="bg-white dark:bg-zinc-950 rounded-lg p-3 min-w-64 border border-border/70">
			<CardHeader className="pb-2 p-0 mb-1">
				<CardTitle className="font-semibold text-sm">{label}</CardTitle>
			</CardHeader>
			<CardContent className="p-0 space-y-1 text-xs">
				<div className="flex justify-between gap-3">
					<span>Input</span>
					<span className="font-mono">{formatUsd(point.input)}</span>
				</div>
				<div className="text-[10px] text-muted-foreground truncate">
					Provider: {point.inputProvider ?? "-"}
				</div>
				<div className="flex justify-between gap-3">
					<span>Output</span>
					<span className="font-mono">{formatUsd(point.output)}</span>
				</div>
				<div className="text-[10px] text-muted-foreground truncate">
					Provider: {point.outputProvider ?? "-"}
				</div>
				<div className="flex justify-between gap-3 pt-1 border-t border-border/60">
					<span>Blended (90/10)</span>
					<span className="font-mono">{formatUsd(point.blended)}</span>
				</div>
			</CardContent>
		</Card>
	);
}

type MeterComparisonRow = {
	meter: string;
	perModel: {
		modelId: string;
		modelName: string;
		pricePerMillion: number | null;
	}[];
};

function formatMeterLabel(meter: string): string {
	const key = meter.trim().toLowerCase();

	const overrides: Record<string, string> = {
		input_token: "Input Tokens",
		output_token: "Output Tokens",
		cached_input_token: "Cached Input Tokens",
		input_text_tokens: "Input Text Tokens",
		output_text_tokens: "Output Text Tokens",
		cached_input_read_tokens: "Cached Read Tokens",
		cached_input_write_tokens: "Cached Write Tokens",
		input_text: "Input Text",
		output_text: "Output Text",
		input_image: "Input Image",
		output_image: "Output Image",
		input_audio: "Input Audio",
		output_audio: "Output Audio",
		input_video: "Input Video",
		output_video: "Output Video",
		per_request: "Per Request",
		request: "Per Request",
	};

	if (overrides[key]) return overrides[key];

	return key
		.replace(/[_-]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function meterPriority(meter: string): number {
	const key = meter.trim().toLowerCase();

	if (key === "input_text_tokens") return 10;
	if (key === "output_text_tokens") return 20;
	if (key === "cached_input_read_tokens") return 30;
	if (key === "cached_input_write_tokens") return 40;

	if (key.includes("input") && key.includes("text") && key.includes("token") && !key.includes("cached")) {
		return 10;
	}
	if (key.includes("output") && key.includes("text") && key.includes("token")) {
		return 20;
	}
	if (key.includes("cached") && key.includes("read")) return 30;
	if (key.includes("cached") && key.includes("write")) return 40;
	if (key.includes("cached") && key.includes("token")) return 45;
	if (key.includes("input") && key.includes("image")) return 50;
	if (key.includes("output") && key.includes("image")) return 60;
	if (key.includes("input") && key.includes("audio")) return 70;
	if (key.includes("output") && key.includes("audio")) return 80;
	if (key.includes("input") && key.includes("video")) return 90;
	if (key.includes("output") && key.includes("video")) return 100;
	if (key.includes("request")) return 110;
	return 200;
}

function buildMeterComparisonRows(
	models: ExtendedModel[],
	providerSelectionByModel: ProviderSelectionByModel
): MeterComparisonRow[] {
	const meterMap = new Map<string, Map<string, { pricePerMillion: number | null }>>();

	for (const model of models) {
		const selectedProviderId =
			providerSelectionByModel[model.id] ?? BEST_PROVIDER_OPTION;
		const effectivePrices = getEffectivePricesForProvider(model, selectedProviderId);
		for (const price of effectivePrices) {
			if (!price.meter || price.meter === "summary") continue;
			const meterKey = price.meter;

			const basePrice =
				price.input_token_price ??
				price.output_token_price ??
				price.cached_input_token_price ??
				null;

			const perMillion =
				basePrice != null && Number.isFinite(basePrice)
					? normalizePricePerMillion(basePrice, price.unit_size ?? null)
					: null;

			if (!meterMap.has(meterKey)) {
				meterMap.set(meterKey, new Map<string, { pricePerMillion: number | null }>());
			}

			const byModel = meterMap.get(meterKey)!;
			const existing = byModel.get(model.id)?.pricePerMillion ?? null;
			const next =
				existing == null ? perMillion : perMillion == null ? existing : Math.min(existing, perMillion);
			byModel.set(model.id, { pricePerMillion: next });
		}
	}

	const rows: MeterComparisonRow[] = [];
	for (const [meter, byModel] of meterMap.entries()) {
		rows.push({
			meter,
			perModel: models.map((model) => ({
				modelId: model.id,
				modelName: model.name,
				pricePerMillion: byModel.get(model.id)?.pricePerMillion ?? null,
			})),
		});
	}

	rows.sort((a, b) => {
		const priorityDiff = meterPriority(a.meter) - meterPriority(b.meter);
		if (priorityDiff !== 0) return priorityDiff;
		return a.meter.localeCompare(b.meter);
	});

	return rows;
}

export default function PricingAnalysis({ selectedModels }: PricingAnalysisProps) {
	const [chartScale, setChartScale] = React.useState<"linear" | "log">("linear");
	const [providerSelectionByModel, setProviderSelectionByModel] =
		React.useState<ProviderSelectionByModel>({});

	React.useEffect(() => {
		setProviderSelectionByModel((previous) => {
			const next: ProviderSelectionByModel = {};
			for (const model of selectedModels) {
				const providerIds = new Set(
					getPricingProviders(model).map((provider) => provider.id)
				);
				const current = previous[model.id];
				next[model.id] =
					current && (current === BEST_PROVIDER_OPTION || providerIds.has(current))
						? current
						: BEST_PROVIDER_OPTION;
			}
			return next;
		});
	}, [selectedModels]);

	if (!selectedModels || selectedModels.length === 0) return null;

	const summaries = selectedModels.map((model) =>
		buildPricingSummary(
			model,
			providerSelectionByModel[model.id] ?? BEST_PROVIDER_OPTION
		)
	);
	const chartData = toChartData(summaries);
	const meterRows = buildMeterComparisonRows(selectedModels, providerSelectionByModel);
	const meterColumnWidth = selectedModels.length > 0 ? "28%" : "100%";
	const modelColumnWidth =
		selectedModels.length > 0
			? `${Math.max(8, 72 / selectedModels.length)}%`
			: "18%";

	const summaryByModelId = new Map(summaries.map((summary) => [summary.model.id, summary]));

	const handleProviderSelectionChange = (modelId: string, providerId: string) => {
		setProviderSelectionByModel((previous) => ({
			...previous,
			[modelId]:
				previous[modelId] === providerId || !providerId
					? BEST_PROVIDER_OPTION
					: providerId,
		}));
	};

	return (
		<section className="space-y-3">
			<header className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">Pricing</h2>
					<p className="text-sm text-muted-foreground">
						Per-1M normalized pricing from observed provider tiers. Blended total uses 90% input + 10% output.
					</p>
				</div>
				{getCheapestBadge(summaries)}
			</header>

			<div className="space-y-4">
				<div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
					<div>
						{getStatCards(
							summaries,
							providerSelectionByModel,
							handleProviderSelectionChange
						)}
					</div>
					<Card className="border border-border/60 bg-background/60 shadow-none">
						<CardHeader className="pb-2">
							<div className="flex items-start justify-between gap-3">
								<div>
									<CardTitle className="text-sm font-semibold">
										{chartScale === "log" ? "Pricing (Log)" : "Pricing"}
									</CardTitle>
									<div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
										<span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2 py-0.5">
											<span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
											Blended (90/10)
										</span>
										<span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2 py-0.5">
											<span className="h-2 w-2 rounded-full bg-[#0ea5e9]" />
											Input $/M
										</span>
										<span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2 py-0.5">
											<span className="h-2 w-2 rounded-full bg-[#10b981]" />
											Output $/M
										</span>
									</div>
								</div>
								<div className="inline-flex items-center gap-1 rounded-md border border-border/60 p-1">
									<TooltipProvider delayDuration={120}>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type="button"
													size="icon"
													variant={chartScale === "linear" ? "default" : "outline"}
													onClick={() => setChartScale("linear")}
													className="h-7 w-7"
													aria-label="Linear scale"
													aria-pressed={chartScale === "linear"}
												>
													<LinearScaleIcon />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Linear scale</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													type="button"
													size="icon"
													variant={chartScale === "log" ? "default" : "outline"}
													onClick={() => setChartScale("log")}
													className="h-7 w-7"
													aria-label="Log scale"
													aria-pressed={chartScale === "log"}
												>
													<LogScaleIcon />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Log scale</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
							</div>
						</CardHeader>
						<CardContent className="pt-0">
							<PricingBarChart
								data={chartData}
								scaleMode={chartScale}
								CustomTooltip={BarChartTooltip}
							/>
						</CardContent>
					</Card>
				</div>

				{meterRows.length > 0 && (
					<div className="mt-6 space-y-2">
						<div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
							<div>
								<div className="text-sm font-semibold">Pricing by meter</div>
								<p className="text-xs text-muted-foreground">
									All unique meters observed across the selected models.
								</p>
							</div>
						</div>
						<div className="overflow-x-auto rounded-md border border-border bg-background/60 mt-2">
							<table className="w-full table-fixed text-xs">
								<colgroup>
									<col style={{ width: meterColumnWidth }} />
									{selectedModels.map((model) => (
										<col key={`meter-col-${model.id}`} style={{ width: modelColumnWidth }} />
									))}
								</colgroup>
								<thead>
									<tr className="border-b border-border bg-muted/60">
										<th className="px-3 py-2 text-left font-medium">Meter</th>
										{selectedModels.map((model) => (
											<th
												key={model.id}
												className="px-3 py-2 text-right font-medium align-top"
											>
												<div className="truncate">{model.name}</div>
												<div className="text-[10px] font-normal text-muted-foreground truncate">
													{summaryByModelId.get(model.id)?.selectedProviderLabel ??
														"Best option"}
												</div>
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{meterRows.map((row, rowIndex) => (
										<tr
											key={row.meter}
											className={`border-b border-border/60 last:border-b-0 ${
												rowIndex % 2 === 0 ? "bg-background/40" : "bg-muted/10"
											}`}
										>
											<td className="px-3 py-2 text-left text-[11px] font-medium whitespace-nowrap">
												{formatMeterLabel(row.meter)}
											</td>
											{row.perModel.map((entry, idx) => {
												const value = entry.pricePerMillion;
												const all = row.perModel
													.map((v) => v.pricePerMillion)
													.filter((v): v is number => v != null && Number.isFinite(v));
												const min = all.length > 0 ? Math.min(...all) : null;
												const isBest =
													min != null && value != null && Math.abs(value - min) < 0.000001;

												return (
													<td
														key={`${row.meter}-${entry.modelId}-${idx}`}
														className="px-3 py-2 text-right font-mono"
													>
														{value != null && Number.isFinite(value) ? (
															<span
																className={isBest ? "text-emerald-600 dark:text-emerald-400" : ""}
															>
																{formatUsd(value)}
															</span>
														) : (
															<span className="text-muted-foreground">-</span>
														)}
													</td>
												);
											})}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</div>
		</section>
	);
}

