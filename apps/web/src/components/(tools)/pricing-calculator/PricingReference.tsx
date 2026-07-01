"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	calculateCost,
	calculateUnits,
	formatQuantity,
	formatMeterName,
	getExamplesForMeter,
	parseMeter,
	fmtUSD,
	formatPricingTimeWindow,
	resolvePricingMeterPrice,
	type PricingMeter,
} from "@/components/(data)/model/pricing/pricingHelpers";
import { getModelDetailsHref } from "@/lib/models/modelHref";

const BLENDED_USAGE_EXAMPLES = [100_000, 1_000_000, 100_000_000];
const BLENDED_BUDGET_EXAMPLES = [1, 10, 100];

type ComparisonPricingModel = {
	key: string;
	label: string;
	modelId?: string;
	provider: string;
	pricingPlan: string;
	meters: PricingMeter[];
};

type BlendedRate = {
	blendedPricePerToken: number;
	blendedPer1M: number;
	inputPer1M: number;
	outputPer1M: number;
};

interface PricingReferenceProps {
	meters: PricingMeter[];
	pricingPlan?: string | null;
	selectedModelId?: string;
	selectedModelLabel?: string;
	selectedProvider: string;
	pricingTimeUtc: string;
	comparisonModels?: ComparisonPricingModel[];
}

function calculateBlendedRate(
	meters: PricingMeter[],
	pricingTimeUtc: string
): BlendedRate | null {
	const inputMeter = meters.find(
		(m) =>
			m.meter.toLowerCase().includes("input") &&
			m.meter.toLowerCase().includes("token") &&
			!m.meter.toLowerCase().includes("cached")
	);
	const outputMeter = meters.find(
		(m) =>
			m.meter.toLowerCase().includes("output") &&
			m.meter.toLowerCase().includes("token")
	);

	if (!inputMeter || !outputMeter) return null;

	const inputPricePerToken =
		resolvePricingMeterPrice(inputMeter, pricingTimeUtc).pricePerUnit /
		(inputMeter.unit_size || 1);
	const outputPricePerToken =
		resolvePricingMeterPrice(outputMeter, pricingTimeUtc).pricePerUnit /
		(outputMeter.unit_size || 1);
	const blendedPricePerToken =
		inputPricePerToken * 0.9 + outputPricePerToken * 0.1;

	return {
		blendedPricePerToken,
		blendedPer1M: blendedPricePerToken * 1_000_000,
		inputPer1M: inputPricePerToken * 1_000_000,
		outputPer1M: outputPricePerToken * 1_000_000,
	};
}

function formatUnitPrice(
	meter: PricingMeter,
	unitLabel: string,
	pricingTimeUtc: string
) {
	const normalizedUnit = unitLabel.toLowerCase();
	const isTokenUnit = normalizedUnit.includes("token");
	const unitSize = meter.unit_size || 1;
	const { pricePerUnit, pricePerUnitRaw } = resolvePricingMeterPrice(
		meter,
		pricingTimeUtc
	);

	if (isTokenUnit && Number.isFinite(pricePerUnit)) {
		const perTokenPrice = pricePerUnit / unitSize;
		const perMillionTokens = perTokenPrice * 1_000_000;
		return `${fmtUSD(perMillionTokens)} / 1M tokens`;
	}

	return `${pricePerUnitRaw} ${meter.currency} / ${meter.unit_size} ${unitLabel}`;
}

function getMeterSortPriority(meterName: string): number {
	const normalized = meterName.toLowerCase();
	const isInputTextTokens =
		normalized.includes("input") &&
		normalized.includes("text") &&
		normalized.includes("token") &&
		!normalized.includes("cached");
	const isOutputTextTokens =
		normalized.includes("output") &&
		normalized.includes("text") &&
		normalized.includes("token");

	if (isInputTextTokens) return 0;
	if (isOutputTextTokens) return 1;
	return 2;
}

function formatProviderLabel(providerId: string): string {
	const known: Record<string, string> = {
		openai: "OpenAI",
		anthropic: "Anthropic",
		google: "Google",
		"google-ai-studio": "Google AI Studio",
		"google-vertex": "Google Vertex",
		"x-ai": "xAI",
		aws: "AWS",
		azure: "Azure",
	};

	if (known[providerId]) {
		return known[providerId];
	}

	return providerId
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatUsageUnit(quantity: number, unitLabel: string) {
	const normalized = unitLabel.trim().toLowerCase();
	if (normalized === "token" || normalized === "tokens") {
		return quantity === 1 ? "token" : "tokens";
	}
	return unitLabel;
}

function getPricingModelHref(model: ComparisonPricingModel) {
	if (!model.modelId) return null;
	const [orgFromModelId] = model.modelId.split("/");
	const organisationId = orgFromModelId || model.provider;
	return getModelDetailsHref(organisationId, model.modelId);
}

function ModelColumnHeader({ model }: { model: ComparisonPricingModel }) {
	const modelHref = getPricingModelHref(model);
	const providerHref = `/api-providers/${encodeURIComponent(model.provider)}`;
	const modelLabel = (
		<p className="truncate text-sm font-medium">{model.label}</p>
	);

	return (
		<div className="max-w-[220px] space-y-1">
			{modelHref ? (
				<Link
					href={modelHref}
					className="block underline decoration-transparent transition-colors duration-200 hover:decoration-current"
				>
					{modelLabel}
				</Link>
			) : (
				modelLabel
			)}
			<Link
				href={providerHref}
				className="block truncate text-xs font-normal text-muted-foreground underline decoration-transparent transition-colors duration-200 hover:decoration-current"
			>
				{formatProviderLabel(model.provider)} · {model.pricingPlan}
			</Link>
		</div>
	);
}

export function PricingReference({
	meters,
	pricingPlan,
	selectedModelId,
	selectedModelLabel,
	selectedProvider,
	pricingTimeUtc,
	comparisonModels,
}: PricingReferenceProps) {
	if (meters.length === 0) {
		return null;
	}

	const displayPlan = pricingPlan || "standard";
	const activeModels =
		comparisonModels && comparisonModels.length > 0
			? comparisonModels
			: [
					{
						key: "primary",
						label: selectedModelLabel || selectedModelId || "Selected Model",
						modelId: selectedModelId,
						provider:
							selectedProvider ||
							(selectedModelId?.includes("/") ? selectedModelId.split("/")[0] : "selected"),
						pricingPlan: displayPlan,
						meters,
					},
			  ];

	const blendedByModel = activeModels.map((model) => ({
		key: model.key,
		blended: calculateBlendedRate(model.meters, pricingTimeUtc),
	}));

	const hasBlendedComparison = blendedByModel.some((model) => Boolean(model.blended));
	const allMeterNames = Array.from(
		new Set(activeModels.flatMap((model) => model.meters.map((meter) => meter.meter)))
	).sort((a, b) => {
		const priorityDiff = getMeterSortPriority(a) - getMeterSortPriority(b);
		if (priorityDiff !== 0) return priorityDiff;
		return formatMeterName(a).localeCompare(formatMeterName(b));
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<span>Pricing Reference</span>
						<Badge variant="outline" className="text-[11px]">
							{activeModels.length} model{activeModels.length === 1 ? "" : "s"}
						</Badge>
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				{hasBlendedComparison ? (
					<div className="space-y-3 rounded-lg border bg-primary/5 p-4">
						<div>
							<h4 className="text-sm font-semibold">Blended Rate</h4>
							<p className="text-xs text-muted-foreground">
								90% input and 10% output token ratio
							</p>
						</div>
						<div className="overflow-x-auto rounded-lg border bg-background">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="sticky left-0 z-10 min-w-[190px] bg-background">
											Metric
										</TableHead>
										{activeModels.map((model) => (
											<TableHead key={`blend-head-${model.key}`} className="min-w-[220px]">
												<ModelColumnHeader model={model} />
											</TableHead>
										))}
									</TableRow>
								</TableHeader>
								<TableBody>
									{[
										{
											key: "blended",
											label: "Blended / 1M",
											value: (rate: BlendedRate) => fmtUSD(rate.blendedPer1M),
										},
										{
											key: "input",
											label: "Input / 1M",
											value: (rate: BlendedRate) => fmtUSD(rate.inputPer1M),
										},
										{
											key: "output",
											label: "Output / 1M",
											value: (rate: BlendedRate) => fmtUSD(rate.outputPer1M),
										},
										...BLENDED_USAGE_EXAMPLES.map((tokens) => ({
											key: `usage-${tokens}`,
											label: `${formatQuantity(tokens)} tokens`,
											value: (rate: BlendedRate) =>
												fmtUSD(
													calculateCost(
														tokens,
														{
															unit_size: 1,
															price_per_unit: String(rate.blendedPricePerToken),
														},
														pricingTimeUtc
													)
												),
										})),
										...BLENDED_BUDGET_EXAMPLES.map((budget) => ({
											key: `budget-${budget}`,
											label: `Usage for ${fmtUSD(budget)}`,
											value: (rate: BlendedRate) => {
												const units = calculateUnits(
													budget,
													{
														unit_size: 1,
														price_per_unit: String(rate.blendedPricePerToken),
													},
													pricingTimeUtc
												);
												return `${formatQuantity(units)} ${formatUsageUnit(
													units,
													"tokens"
												)}`;
											},
										})),
									].map((row) => (
										<TableRow key={`blend-row-${row.key}`}>
											<TableCell className="sticky left-0 z-10 bg-background font-medium">
												{row.label}
											</TableCell>
											{activeModels.map((model) => {
												const blendedModel = blendedByModel.find(
													(entry) => entry.key === model.key
												);
												return (
													<TableCell key={`blend-${row.key}-${model.key}`}>
														{blendedModel?.blended
															? row.value(blendedModel.blended)
															: "-"}
													</TableCell>
												);
											})}
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</div>
				) : null}

				{allMeterNames.map((meterName) => {
					const meterByModel = activeModels.map((model) => ({
						key: model.key,
						meter: model.meters.find((item) => item.meter === meterName) || null,
					}));
					const baseMeter = meterByModel.find((entry) => entry.meter)?.meter;
					if (!baseMeter) {
						return null;
					}

					const examples = getExamplesForMeter(baseMeter);
					const budgets = [1, 10, 100];
					const derivedUnit = parseMeter(baseMeter.meter).unit;
					const unitLabel =
						derivedUnit !== "unknown" ? derivedUnit : baseMeter.unit;

					const rows = [
						{
							key: "rate",
							label: "Unit price",
							value: (meter: PricingMeter) =>
								formatUnitPrice(meter, unitLabel, pricingTimeUtc),
						},
						{
							key: "window",
							label: "Active time window",
							value: (meter: PricingMeter) => {
								const activeWindow = resolvePricingMeterPrice(
									meter,
									pricingTimeUtc
								).timeWindow;
								return activeWindow
									? formatPricingTimeWindow(activeWindow)
									: "Base rate";
							},
						},
						...examples.map((quantity) => ({
							key: `usage-${quantity}`,
							label: `Cost for ${formatQuantity(quantity)} ${unitLabel}`,
							value: (meter: PricingMeter) =>
								fmtUSD(calculateCost(quantity, meter, pricingTimeUtc)),
						})),
						...budgets.map((budget) => ({
							key: `budget-${budget}`,
							label: `Usage for ${fmtUSD(budget)}`,
							value: (meter: PricingMeter) => {
								const units = calculateUnits(budget, meter, pricingTimeUtc);
								return `${formatQuantity(units)} ${formatUsageUnit(
									units,
									unitLabel
								)}`;
							},
						})),
					];

					return (
						<div key={meterName} className="space-y-3 rounded-lg border p-4">
							<h4 className="text-sm font-semibold">
								{formatMeterName(meterName)}
							</h4>
							<div className="overflow-x-auto rounded-lg border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="sticky left-0 z-10 min-w-[220px] bg-background">
												Metric
											</TableHead>
											{activeModels.map((model) => (
												<TableHead
													key={`${meterName}-head-${model.key}`}
													className="min-w-[220px]"
												>
													<ModelColumnHeader model={model} />
												</TableHead>
											))}
										</TableRow>
									</TableHeader>
									<TableBody>
										{rows.map((row) => (
											<TableRow key={`${meterName}-row-${row.key}`}>
												<TableCell className="sticky left-0 z-10 bg-background font-medium">
													{row.label}
												</TableCell>
												{activeModels.map((model) => {
													const entry = meterByModel.find(
														(item) => item.key === model.key
													);
													return (
														<TableCell key={`${meterName}-${row.key}-${model.key}`}>
															{entry?.meter ? row.value(entry.meter) : "-"}
														</TableCell>
													);
												})}
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}
