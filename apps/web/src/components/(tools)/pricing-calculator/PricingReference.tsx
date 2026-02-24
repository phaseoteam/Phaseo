"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
	type PricingMeter,
} from "@/components/(data)/model/pricing/pricingHelpers";
import { getModelDetailsHref } from "@/lib/models/modelHref";
import { Logo } from "@/components/Logo";
import { CircleDollarSign, Gift, Layers, Sparkles, Zap } from "lucide-react";

const BLENDED_USAGE_EXAMPLES = [100_000, 1_000_000, 100_000_000];
const BLENDED_BUDGET_EXAMPLES = [1, 10, 100];
const PRICING_PLAN_ORDER = ["batch", "flex", "standard", "priority"] as const;

type ComparisonPricingModel = {
	key: string;
	label: string;
	modelId?: string;
	provider: string;
	availableProviders?: string[];
	pricingPlan: string;
	availablePricingPlans?: string[];
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
	availableProviders: Array<{ provider: string; displayName: string }>;
	selectedProvider: string;
	onProviderSelect: (provider: string) => void;
	onPricingPlanSelect: (plan: string) => void;
	comparisonModels?: ComparisonPricingModel[];
	onComparisonModelPricingPlanSelect?: (modelKey: string, plan: string) => void;
	onComparisonModelProviderSelect?: (modelKey: string, provider: string) => void;
}

function calculateBlendedRate(meters: PricingMeter[]): BlendedRate | null {
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
		parseFloat(inputMeter.price_per_unit) / (inputMeter.unit_size || 1);
	const outputPricePerToken =
		parseFloat(outputMeter.price_per_unit) / (outputMeter.unit_size || 1);
	const blendedPricePerToken =
		inputPricePerToken * 0.9 + outputPricePerToken * 0.1;

	return {
		blendedPricePerToken,
		blendedPer1M: blendedPricePerToken * 1_000_000,
		inputPer1M: inputPricePerToken * 1_000_000,
		outputPer1M: outputPricePerToken * 1_000_000,
	};
}

function formatUnitPrice(meter: PricingMeter, unitLabel: string) {
	const normalizedUnit = unitLabel.toLowerCase();
	const isTokenUnit = normalizedUnit.includes("token");
	const unitSize = meter.unit_size || 1;
	const unitPrice = parseFloat(meter.price_per_unit);

	if (isTokenUnit && Number.isFinite(unitPrice)) {
		const perTokenPrice = unitPrice / unitSize;
		const perMillionTokens = perTokenPrice * 1_000_000;
		return `${fmtUSD(perMillionTokens)} / 1M tokens`;
	}

	return `${meter.price_per_unit} ${meter.currency} / ${meter.unit_size} ${unitLabel}`;
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

function sortPricingPlans(plans: string[]) {
	const priorityByPlan = new Map<string, number>(
		PRICING_PLAN_ORDER.map((plan, index) => [plan, index])
	);

	return [...plans].sort((a, b) => {
		const aPriority = priorityByPlan.get(a.toLowerCase());
		const bPriority = priorityByPlan.get(b.toLowerCase());
		if (aPriority !== undefined && bPriority !== undefined) {
			return aPriority - bPriority;
		}
		if (aPriority !== undefined) return -1;
		if (bPriority !== undefined) return 1;
		return a.localeCompare(b);
	});
}

function formatUsageUnit(quantity: number, unitLabel: string) {
	const normalized = unitLabel.trim().toLowerCase();
	if (normalized === "token" || normalized === "tokens") {
		return quantity === 1 ? "token" : "tokens";
	}
	return unitLabel;
}

export function PricingReference({
	meters,
	pricingPlan,
	selectedModelId,
	selectedModelLabel,
	availableProviders,
	selectedProvider,
	onProviderSelect,
	onPricingPlanSelect,
	comparisonModels,
	onComparisonModelPricingPlanSelect,
	onComparisonModelProviderSelect,
}: PricingReferenceProps) {
	if (meters.length === 0) {
		return null;
	}

	const displayPlan = pricingPlan || "standard";
	const hasComparisonModels = Boolean(comparisonModels && comparisonModels.length > 0);
	const activeModels =
		comparisonModels && comparisonModels.length > 0
			? comparisonModels
			: [
					{
						key: "primary",
						label: selectedModelLabel || selectedModelId || "Selected Model",
						modelId: selectedModelId,
						provider: selectedProvider || availableProviders[0]?.provider || "selected",
						availableProviders: availableProviders.map((item) => item.provider),
						pricingPlan: displayPlan,
						availablePricingPlans: [displayPlan],
						meters,
					},
			  ];

	const getProviderHref = (providerId: string) =>
		`/api-providers/${encodeURIComponent(providerId)}`;

	const getPricingModelHref = (model: ComparisonPricingModel) => {
		if (!model.modelId) return null;
		const [orgFromModelId] = model.modelId.split("/");
		const organisationId = orgFromModelId || model.provider;
		return getModelDetailsHref(organisationId, model.modelId);
	};

	const renderModelName = (model: ComparisonPricingModel, className: string) => {
		const href = getPricingModelHref(model);
		if (!href) {
			return <p className={className}>{model.label}</p>;
		}
		return (
			<p className={className}>
				<Link href={href} className="underline decoration-transparent hover:decoration-current transition-colors duration-200">
					{model.label}
				</Link>
			</p>
		);
	};

	const renderProviderName = (providerId: string, className: string) => (
		<p className={className}>
			<Link
				href={getProviderHref(providerId)}
				className="underline decoration-transparent hover:decoration-current transition-colors duration-200"
			>
				{formatProviderLabel(providerId)}
			</Link>
		</p>
	);

	const handleModelProviderSelect = (
		model: ComparisonPricingModel,
		provider: string
	) => {
		if (model.key === "primary") {
			onProviderSelect(provider);
			return;
		}
		onComparisonModelProviderSelect?.(model.key, provider);
	};

	const handleModelPricingPlanSelect = (
		model: ComparisonPricingModel,
		plan: string
	) => {
		if (model.key === "primary") {
			onPricingPlanSelect(plan);
			return;
		}
		onComparisonModelPricingPlanSelect?.(model.key, plan);
	};

	const getPricingPlanIcon = (plan: string) => {
		switch (plan.toLowerCase()) {
			case "free":
				return <Gift className="w-4 h-4" />;
			case "batch":
				return <Layers className="w-4 h-4" />;
			case "flex":
				return <Zap className="w-4 h-4" />;
			case "priority":
				return <Sparkles className="w-4 h-4" />;
			case "standard":
			default:
				return <CircleDollarSign className="w-4 h-4" />;
		}
	};

	const blendedByModel = activeModels.map((model) => ({
		key: model.key,
		blended: calculateBlendedRate(model.meters),
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
				<CardTitle className="flex items-center justify-between flex-wrap gap-2">
					<div className="flex items-center gap-2">
						<span>Pricing Reference</span>
						<Badge variant="outline" className="text-[11px]">
							{activeModels.length} model{activeModels.length === 1 ? "" : "s"}
						</Badge>
					</div>
					<div className="flex items-center gap-2" />
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-7">
				<div className="rounded-xl border bg-muted/20 p-4">
					<div className="mb-3 flex items-center justify-between gap-2">
						<h4 className="text-sm font-semibold">Selected Models</h4>
					</div>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
						{activeModels.map((model) => {
							const modelProviderOptions = Array.from(
								new Set(model.availableProviders ?? [model.provider])
							).sort((a, b) =>
								formatProviderLabel(a).localeCompare(formatProviderLabel(b))
							);
							const modelPlanOptions = sortPricingPlans(
								model.availablePricingPlans ?? []
							);

							return (
								<div
									key={`${model.key}-selected`}
									className="rounded-lg border bg-background p-3"
								>
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0 space-y-1">
										{renderModelName(model, "truncate text-sm font-medium")}
										{renderProviderName(
											model.provider,
											"text-xs text-muted-foreground"
										)}
									</div>
									<Link
										href={getProviderHref(model.provider)}
										className="shrink-0"
										aria-label={`View ${formatProviderLabel(model.provider)} provider`}
									>
										<Logo
											id={model.provider}
											width={18}
											height={18}
											className="h-[18px] w-[18px] shrink-0"
											fallback={<div className="h-[18px] w-[18px] rounded bg-muted" />}
										/>
									</Link>
								</div>
								<Select
									value={model.provider}
									onValueChange={(provider) =>
										handleModelProviderSelect(model, provider)
									}
									disabled={modelProviderOptions.length <= 1}
								>
									<SelectTrigger className="mt-2 h-8 w-full text-xs">
										<SelectValue placeholder="Provider" />
									</SelectTrigger>
									<SelectContent>
										{modelProviderOptions.map((providerId) => (
											<SelectItem
												key={`${model.key}-provider-${providerId}`}
												value={providerId}
											>
												<div className="flex items-center gap-2">
													<Logo
														id={providerId}
														width={14}
														height={14}
														className="h-3.5 w-3.5"
														fallback={
															<div className="h-3.5 w-3.5 rounded bg-muted" />
														}
													/>
													{formatProviderLabel(providerId)}
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{model.availablePricingPlans && model.availablePricingPlans.length > 0 ? (
									<Select
										value={model.pricingPlan}
										onValueChange={(plan) => handleModelPricingPlanSelect(model, plan)}
										disabled={modelPlanOptions.length <= 1}
									>
										<SelectTrigger className="mt-2 h-8 w-full text-xs">
											<SelectValue placeholder="Tier" />
										</SelectTrigger>
										<SelectContent>
											{modelPlanOptions.map((plan) => (
												<SelectItem key={`${model.key}-${plan}`} value={plan}>
													<div className="flex items-center gap-2">
														{getPricingPlanIcon(plan)}
														{plan.charAt(0).toUpperCase() + plan.slice(1)}
													</div>
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								) : null}
								</div>
							);
						})}
					</div>
				</div>

				{hasBlendedComparison && (
					<div className="space-y-4 rounded-xl border bg-primary/5 p-5">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div>
								<h4 className="text-base font-semibold">Blended Rate Comparison</h4>
								<p className="text-xs text-muted-foreground">
									90% input and 10% output token ratio
								</p>
							</div>
						</div>

						<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
							{activeModels.map((model) => {
								const blendedModel = blendedByModel.find((entry) => entry.key === model.key);
								return (
									<div
										key={`${model.key}-blend-summary`}
										className="rounded-lg border bg-background p-4 space-y-3"
									>
										<div className="flex items-start justify-between gap-2">
											<div className="min-w-0">
												{renderModelName(model, "truncate text-sm font-medium")}
												{renderProviderName(
													model.provider,
													"text-xs text-muted-foreground"
												)}
											</div>
											<Link
												href={getProviderHref(model.provider)}
												className="shrink-0"
												aria-label={`View ${formatProviderLabel(model.provider)} provider`}
											>
												<Logo
													id={model.provider}
													width={16}
													height={16}
													className="h-4 w-4 shrink-0"
													fallback={<div className="h-4 w-4 rounded bg-muted" />}
												/>
											</Link>
										</div>
										<div className="space-y-2 text-sm">
											<div className="flex items-center justify-between gap-2">
												<span className="text-muted-foreground">Blended / 1M</span>
												<span className="font-semibold">
													{blendedModel?.blended
														? fmtUSD(blendedModel.blended.blendedPer1M)
														: "-"}
												</span>
											</div>
											<div className="flex items-center justify-between gap-2">
												<span className="text-muted-foreground">Input / 1M</span>
												<span>
													{blendedModel?.blended
														? fmtUSD(blendedModel.blended.inputPer1M)
														: "-"}
												</span>
											</div>
											<div className="flex items-center justify-between gap-2">
												<span className="text-muted-foreground">Output / 1M</span>
												<span>
													{blendedModel?.blended
														? fmtUSD(blendedModel.blended.outputPer1M)
														: "-"}
												</span>
											</div>
										</div>
									</div>
								);
							})}
						</div>

						<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
							<div className="rounded-lg border bg-background p-3">
								<h5 className="mb-2 text-xs font-semibold text-muted-foreground">
									Cost by Usage
								</h5>
								<div className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="min-w-[190px]">Model</TableHead>
												{BLENDED_USAGE_EXAMPLES.map((tokens) => (
													<TableHead key={`blended-usage-h-${tokens}`}>
														{formatQuantity(tokens)} tokens
													</TableHead>
												))}
											</TableRow>
										</TableHeader>
										<TableBody>
											{activeModels.map((model) => {
												const blendedModel = blendedByModel.find(
													(entry) => entry.key === model.key
												);
												return (
													<TableRow key={`blended-usage-row-${model.key}`}>
														<TableCell>
															<div className="flex items-center gap-2">
																<Link
																	href={getProviderHref(model.provider)}
																	className="shrink-0"
																	aria-label={`View ${formatProviderLabel(model.provider)} provider`}
																>
																	<Logo
																		id={model.provider}
																		width={14}
																		height={14}
																		className="h-3.5 w-3.5"
																		fallback={
																			<div className="h-3.5 w-3.5 rounded bg-muted" />
																		}
																	/>
																</Link>
																<div className="min-w-0">
																	{renderModelName(
																		model,
																		"truncate text-sm font-medium"
																	)}
																	{renderProviderName(
																		model.provider,
																		"text-[11px] text-muted-foreground"
																	)}
																</div>
															</div>
														</TableCell>
														{BLENDED_USAGE_EXAMPLES.map((tokens) => (
															<TableCell key={`blend-${model.key}-usage-${tokens}`}>
																{blendedModel?.blended
																	? fmtUSD(
																			calculateCost(tokens, {
																				unit_size: 1,
																				price_per_unit: String(
																					blendedModel.blended.blendedPricePerToken
																				),
																			})
																	  )
																	: "-"}
															</TableCell>
														))}
													</TableRow>
												);
											})}
										</TableBody>
									</Table>
								</div>
							</div>

							<div className="rounded-lg border bg-background p-3">
								<h5 className="mb-2 text-xs font-semibold text-muted-foreground">
									Usage by Budget
								</h5>
								<div className="overflow-x-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="min-w-[190px]">Model</TableHead>
												{BLENDED_BUDGET_EXAMPLES.map((budget) => (
													<TableHead key={`blended-budget-h-${budget}`}>
														{fmtUSD(budget)}
													</TableHead>
												))}
											</TableRow>
										</TableHeader>
										<TableBody>
											{activeModels.map((model) => {
												const blendedModel = blendedByModel.find(
													(entry) => entry.key === model.key
												);
												return (
													<TableRow key={`blended-budget-row-${model.key}`}>
														<TableCell>
															<div className="flex items-center gap-2">
																<Link
																	href={getProviderHref(model.provider)}
																	className="shrink-0"
																	aria-label={`View ${formatProviderLabel(model.provider)} provider`}
																>
																	<Logo
																		id={model.provider}
																		width={14}
																		height={14}
																		className="h-3.5 w-3.5"
																		fallback={
																			<div className="h-3.5 w-3.5 rounded bg-muted" />
																		}
																	/>
																</Link>
																<div className="min-w-0">
																	{renderModelName(
																		model,
																		"truncate text-sm font-medium"
																	)}
																	{renderProviderName(
																		model.provider,
																		"text-[11px] text-muted-foreground"
																	)}
																</div>
															</div>
														</TableCell>
														{BLENDED_BUDGET_EXAMPLES.map((budget) => (
															<TableCell key={`blend-${model.key}-budget-${budget}`}>
																{blendedModel?.blended
																	? (() => {
																			const units = calculateUnits(budget, {
																				unit_size: 1,
																				price_per_unit: String(
																					blendedModel.blended.blendedPricePerToken
																				),
																			});
																			return `${formatQuantity(units)} ${formatUsageUnit(units, "tokens")}`;
																	  })()
																	: "-"}
															</TableCell>
														))}
													</TableRow>
												);
											})}
										</TableBody>
									</Table>
								</div>
							</div>
						</div>
					</div>
				)}

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

					return (
						<div key={meterName} className="space-y-4 rounded-xl border p-5">
							<div className="flex items-center justify-between gap-2 flex-wrap">
								<h4 className="text-base font-semibold">{formatMeterName(meterName)}</h4>
							</div>

							<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
								{activeModels.map((model) => {
									const entry = meterByModel.find((item) => item.key === model.key);
									return (
										<div
											key={`${meterName}-${model.key}-rate-card`}
											className="rounded-lg border bg-background p-4"
										>
											<div className="flex items-start justify-between gap-2">
												<div className="min-w-0">
													{renderModelName(model, "truncate text-sm font-medium")}
													{renderProviderName(
														model.provider,
														"text-xs text-muted-foreground"
													)}
												</div>
												<Link
													href={getProviderHref(model.provider)}
													className="shrink-0"
													aria-label={`View ${formatProviderLabel(model.provider)} provider`}
												>
													<Logo
														id={model.provider}
														width={16}
														height={16}
														className="h-4 w-4 shrink-0"
														fallback={<div className="h-4 w-4 rounded bg-muted" />}
													/>
												</Link>
											</div>
											<p className="mt-3 text-sm font-medium leading-5">
												{entry?.meter ? formatUnitPrice(entry.meter, unitLabel) : "-"}
											</p>
										</div>
									);
								})}
							</div>

							<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
								<div className="rounded-lg border bg-background p-3">
									<h5 className="mb-2 text-xs font-semibold text-muted-foreground">
										Cost by Usage
									</h5>
									<div className="overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="min-w-[190px]">Model</TableHead>
													{examples.map((quantity) => (
														<TableHead key={`${meterName}-${quantity}-usage-col`}>
															{formatQuantity(quantity)} {unitLabel}
														</TableHead>
													))}
												</TableRow>
											</TableHeader>
											<TableBody>
												{activeModels.map((model) => {
													const entry = meterByModel.find((item) => item.key === model.key);
													return (
													<TableRow key={`${meterName}-usage-row-${model.key}`}>
														<TableCell>
															<div className="flex items-center gap-2">
																<Link
																	href={getProviderHref(model.provider)}
																	className="shrink-0"
																	aria-label={`View ${formatProviderLabel(model.provider)} provider`}
																>
																	<Logo
																		id={model.provider}
																		width={14}
																		height={14}
																		className="h-3.5 w-3.5"
																		fallback={
																			<div className="h-3.5 w-3.5 rounded bg-muted" />
																		}
																	/>
																</Link>
																<div className="min-w-0">
																	{renderModelName(
																		model,
																		"truncate text-sm font-medium"
																	)}
																	{renderProviderName(
																		model.provider,
																		"text-[11px] text-muted-foreground"
																	)}
																</div>
															</div>
														</TableCell>
														{examples.map((quantity) => (
															<TableCell key={`${meterName}-${model.key}-${quantity}`}>
																{entry?.meter
																	? fmtUSD(calculateCost(quantity, entry.meter))
																	: "-"}
															</TableCell>
														))}
													</TableRow>
													);
												})}
											</TableBody>
										</Table>
									</div>
								</div>

								<div className="rounded-lg border bg-background p-3">
									<h5 className="mb-2 text-xs font-semibold text-muted-foreground">
										Usage by Budget
									</h5>
									<div className="overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="min-w-[190px]">Model</TableHead>
													{budgets.map((budget) => (
														<TableHead key={`${meterName}-${budget}-budget-col`}>
															{fmtUSD(budget)}
														</TableHead>
													))}
												</TableRow>
											</TableHeader>
											<TableBody>
												{activeModels.map((model) => {
													const entry = meterByModel.find((item) => item.key === model.key);
													return (
													<TableRow key={`${meterName}-budget-row-${model.key}`}>
														<TableCell>
															<div className="flex items-center gap-2">
																<Link
																	href={getProviderHref(model.provider)}
																	className="shrink-0"
																	aria-label={`View ${formatProviderLabel(model.provider)} provider`}
																>
																	<Logo
																		id={model.provider}
																		width={14}
																		height={14}
																		className="h-3.5 w-3.5"
																		fallback={
																			<div className="h-3.5 w-3.5 rounded bg-muted" />
																		}
																	/>
																</Link>
																<div className="min-w-0">
																	{renderModelName(
																		model,
																		"truncate text-sm font-medium"
																	)}
																	{renderProviderName(
																		model.provider,
																		"text-[11px] text-muted-foreground"
																	)}
																</div>
															</div>
														</TableCell>
														{budgets.map((budget) => (
															<TableCell key={`${meterName}-${model.key}-b-${budget}`}>
																{entry?.meter
																	? (() => {
																			const units = calculateUnits(budget, entry.meter);
																			return `${formatQuantity(units)} ${formatUsageUnit(units, unitLabel)}`;
																	  })()
																	: "-"}
															</TableCell>
														))}
													</TableRow>
													);
												})}
											</TableBody>
										</Table>
									</div>
								</div>
							</div>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}

