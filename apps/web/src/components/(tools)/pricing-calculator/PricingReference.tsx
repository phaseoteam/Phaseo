"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
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
	fmtUSD,
	formatMeterName,
	formatPricingTimeWindow,
	formatQuantity,
	getExamplesForMeter,
	parseMeter,
	resolvePricingMeterPrice,
	type PricingMeter,
} from "@/components/(data)/model/pricing/pricingHelpers";
import {
	calculateArtificialAnalysisBlendedRate,
	type BlendedRate,
} from "./blendedRate";
import {
	MeterLabel,
	PricingModelHeader,
	formatSentenceLabel,
	type ComparisonPricingModel,
} from "./PricingTableVisuals";
import {
	getPricingContextTiers,
	type PricingContextTier,
} from "./pricingMeterConditions";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

interface PricingReferenceProps {
	meters: PricingMeter[];
	pricingPlan?: string | null;
	selectedModelId?: string;
	selectedModelLabel?: string;
	selectedProvider: string;
	pricingTimeUtc: string;
	comparisonModels?: ComparisonPricingModel[];
}

const TOKEN_VOLUME_PRESETS = [1_000_000, 10_000_000, 100_000_000, 1_000_000_000];
const BUDGET_PRESETS = [1, 10, 100, 1_000];

function isTokenMeter(meter: PricingMeter): boolean {
	return parseMeter(meter.meter).unit === "token" || meter.unit.toLowerCase().includes("token");
}

function formatUnitPrice(
	meter: PricingMeter,
	pricingTimeUtc: string,
	formatNumber: (value: number) => string,
) {
	const derivedUnit = parseMeter(meter.meter).unit;
	const unitLabel = derivedUnit !== "unknown" ? derivedUnit : meter.unit;
	const { pricePerUnit, pricePerUnitRaw } = resolvePricingMeterPrice(meter, pricingTimeUtc);
	if (unitLabel.toLowerCase().includes("token")) {
		return `${fmtUSD((pricePerUnit / (meter.unit_size || 1)) * 1_000_000)} per 1M tokens`;
	}
	return `${pricePerUnitRaw} ${meter.currency} per ${formatNumber(meter.unit_size)} ${unitLabel}`;
}

function meterSortPriority(meterName: string) {
	const name = meterName.toLowerCase();
	if (name.includes("input") && name.includes("text") && !name.includes("cached")) return 0;
	if (name.includes("output") && name.includes("text")) return 1;
	if (name.includes("cached")) return 2;
	return 3;
}

function contextMeter(tier: PricingContextTier, meterName: string) {
	return tier.meters.find((meter) => meter.meter === meterName);
}

function ContextRateStack({
	tiers,
	meterName,
	pricingTimeUtc,
}: {
	tiers: PricingContextTier[];
	meterName: string;
	pricingTimeUtc: string;
}) {
	const format = useDisplayFormatters();
	return (
		<div className={tiers.length > 1 ? "grid gap-2 sm:grid-cols-2" : "grid gap-2"}>
			{tiers.map((tier) => {
				const meter = contextMeter(tier, meterName);
				if (!meter) return null;
				return (
					<div key={tier.key} className="min-h-[74px] rounded-lg border bg-muted/20 px-3 py-2.5">
						<p className="text-[10px] font-medium text-muted-foreground">{tier.label}</p>
						<p className="mt-0.5 text-sm font-semibold tabular-nums">{formatUnitPrice(meter, pricingTimeUtc, format.number)}</p>
						<p className="mt-0.5 text-[10px] text-muted-foreground">{tier.detail}</p>
					</div>
				);
			})}
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
	const format = useDisplayFormatters();
	if (meters.length === 0) return null;
	const activeModels: ComparisonPricingModel[] =
		comparisonModels && comparisonModels.length > 0
			? comparisonModels
			: [{
				key: "primary",
				label: selectedModelLabel || selectedModelId || "Selected Model",
				modelId: selectedModelId,
				provider: selectedProvider || selectedModelId?.split("/")[0] || "selected",
				pricingPlan: pricingPlan || "standard",
				meters,
			}];
	const contextTiersByModel = new Map(
		activeModels.map((model) => [model.key, getPricingContextTiers(model.allMeters ?? model.meters)])
	);
	const hasContextTiers = [...contextTiersByModel.values()].some((tiers) => tiers.length > 1);
	const blendedTiersByModel = new Map(
		activeModels.map((model) => [
			model.key,
			(contextTiersByModel.get(model.key) ?? []).map((tier) => ({
				tier,
				rate: calculateArtificialAnalysisBlendedRate(tier.meters, pricingTimeUtc),
			})).filter((entry): entry is { tier: PricingContextTier; rate: BlendedRate } => Boolean(entry.rate)),
		])
	);
	const hasBlendedRates = [...blendedTiersByModel.values()].some((tiers) => tiers.length > 0);
	const meterNames = Array.from(
		new Set(activeModels.flatMap((model) => model.meters.map((meter) => meter.meter)))
	).sort((left, right) =>
		meterSortPriority(left) - meterSortPriority(right) ||
		formatMeterName(left).localeCompare(formatMeterName(right))
	);

	return (
		<Card>
			<CardHeader className="border-b bg-muted/10">
				<CardTitle className="flex flex-wrap items-center justify-between gap-2">
					<span>Pricing reference</span>
					<Badge variant="outline" className="rounded-lg bg-background text-[11px]">
						Rates at {pricingTimeUtc} UTC
					</Badge>
				</CardTitle>
				{hasContextTiers ? (
					<p className="text-xs text-muted-foreground">
						Standard and long-context rates are shown together. Cost totals continue to follow the input tokens entered above.
					</p>
				) : null}
			</CardHeader>
			<CardContent className="space-y-6 pt-5">
				{hasBlendedRates ? (
					<section className="space-y-3">
						<div>
							<h3 className="text-sm font-semibold">Text token snapshot</h3>
							<p className="text-xs text-muted-foreground">
								Artificial Analysis-style 7:2:1 mix of cache-hit input, regular input, and output. Cache writes and storage are excluded.
							</p>
						</div>
						<ScrollArea scrollBarOrientation="horizontal" className="w-full rounded-xl border" viewportClassName="rounded-xl">
							<Table>
								<TableHeader>
									<TableRow className="bg-muted/20 hover:bg-muted/20">
										<TableHead className="sticky left-0 z-10 min-w-[250px] bg-muted/20">Rate</TableHead>
										{activeModels.map((model) => <TableHead key={`blend-head-${model.key}`} className="min-w-[240px]"><PricingModelHeader model={model} /></TableHead>)}
									</TableRow>
								</TableHeader>
								<TableBody>
									{[
										{ key: "blended", label: "Blended rate", description: "7:2:1 per 1M tokens", value: (rate: BlendedRate) => rate.blendedPer1M },
										{ key: "cache", label: "Cache-hit input", description: "70% of the blend", value: (rate: BlendedRate) => rate.cacheHitPer1M },
										{ key: "input", label: "Regular input", description: "20% of the blend", value: (rate: BlendedRate) => rate.inputPer1M },
										{ key: "output", label: "Output", description: "10% of the blend", value: (rate: BlendedRate) => rate.outputPer1M },
									].map((row) => (
										<TableRow key={row.key}>
											<TableCell className="sticky left-0 z-10 bg-background">
												<div className="min-w-[190px]">
													<p className="text-sm font-medium">{row.label}</p>
													<p className="text-xs text-muted-foreground">{row.description}</p>
												</div>
											</TableCell>
										{activeModels.map((model) => {
											const tierRates = blendedTiersByModel.get(model.key) ?? [];
											if (tierRates.length === 0) return <TableCell key={`${row.key}-${model.key}`} className="text-sm text-muted-foreground">Not available</TableCell>;
											return (
												<TableCell key={`${row.key}-${model.key}`}>
													<div className={tierRates.length > 1 ? "grid gap-2 sm:grid-cols-2" : "grid gap-2"}>
														{tierRates.map(({ tier, rate }) => (
															<div key={tier.key} className="flex min-h-[62px] items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2">
																<span>
																	<span className="block text-[10px] font-medium text-muted-foreground">{tier.label}</span>
																	<span className="block text-[10px] text-muted-foreground">{tier.detail}</span>
																</span>
																<span className="font-semibold tabular-nums">{fmtUSD(row.value(rate))}</span>
															</div>
														))}
													</div>
												</TableCell>
											);
										})}
										</TableRow>
									))}
								</TableBody>
							</Table>
							</ScrollArea>
							{[...blendedTiersByModel.values()].flat().some(({ rate }) => rate.usesInputForCache) ? (
								<p className="text-[11px] text-muted-foreground">
									Where no cache-hit price is published, the regular input price is used for that part of the blend.
								</p>
							) : null}
						</section>
				) : null}

				<section className="space-y-3">
					<div>
						<h3 className="text-sm font-semibold">All priced meters</h3>
						<p className="text-xs text-muted-foreground">Unit rates with fixed token-volume and budget comparisons where applicable.</p>
					</div>
					<ScrollArea scrollBarOrientation="horizontal" className="w-full rounded-xl border" viewportClassName="rounded-xl">
						<Table>
							<TableHeader>
								<TableRow className="bg-muted/20 hover:bg-muted/20">
									<TableHead className="sticky left-0 z-10 min-w-[250px] bg-muted/20">Meter</TableHead>
								{activeModels.map((model) => <TableHead key={`meter-head-${model.key}`} className="min-w-[360px]"><PricingModelHeader model={model} /></TableHead>)}
								</TableRow>
							</TableHeader>
							<TableBody>
								{meterNames.map((meterName) => {
									const representative = activeModels.flatMap((model) => model.meters).find((meter) => meter.meter === meterName);
									const example = representative ? getExamplesForMeter(representative)[1] ?? getExamplesForMeter(representative)[0] ?? 1 : 1;
									return (
										<TableRow key={meterName}>
											<TableCell className="sticky left-0 z-10 bg-background"><MeterLabel meterName={meterName} label={formatSentenceLabel(formatMeterName(meterName))} description={representative?.unit || "Usage"} /></TableCell>
											{activeModels.map((model) => {
												const meter = model.meters.find((item) => item.meter === meterName);
												if (!meter) return <TableCell key={`${meterName}-${model.key}`} className="text-sm text-muted-foreground">Not priced</TableCell>;
												const timeWindow = resolvePricingMeterPrice(meter, pricingTimeUtc).timeWindow;
												const contextTiers = contextTiersByModel.get(model.key) ?? [];
												return (
													<TableCell key={`${meterName}-${model.key}`}>
										<ContextRateStack tiers={contextTiers} meterName={meterName} pricingTimeUtc={pricingTimeUtc} />
										{isTokenMeter(meter) ? (
											<div className="mt-3 space-y-3 border-t pt-3">
												<p className="text-[10px] font-medium text-muted-foreground">Current rate calculations</p>
														<div>
															<p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Token volume</p>
															<div className="grid grid-cols-4 gap-2">
																{TOKEN_VOLUME_PRESETS.map((quantity) => (
																	<div key={quantity} className="min-w-0">
																		<p className="text-[10px] text-muted-foreground">{formatQuantity(quantity)}</p>
																		<p className="truncate text-xs font-semibold tabular-nums">{fmtUSD(calculateCost(quantity, meter, pricingTimeUtc))}</p>
																	</div>
																))}
															</div>
														</div>
														<div>
															<p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Budget buys</p>
															<div className="grid grid-cols-4 gap-2">
																{BUDGET_PRESETS.map((budget) => (
																	<div key={budget} className="min-w-0">
																		<p className="text-[10px] text-muted-foreground">${format.number(budget, { notation: "standard" })}</p>
																		<p className="truncate text-xs font-semibold tabular-nums">{formatQuantity(calculateUnits(budget, meter, pricingTimeUtc))}</p>
																	</div>
																))}
															</div>
														</div>
													</div>
												) : (
													<>
														<p className="mt-1 text-xs text-muted-foreground">{formatQuantity(example)} costs {fmtUSD(calculateCost(example, meter, pricingTimeUtc))}</p>
														<p className="mt-1 text-xs text-muted-foreground">$10 buys {formatQuantity(calculateUnits(10, meter, pricingTimeUtc))}</p>
													</>
												)}
														{timeWindow ? <p className="mt-1 text-[11px] text-muted-foreground">{formatPricingTimeWindow(timeWindow)}</p> : null}
													</TableCell>
												);
											})}
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</ScrollArea>
				</section>
			</CardContent>
		</Card>
	);
}
