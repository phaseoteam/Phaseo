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
import { useLocale, useTranslations } from "next-intl";
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

type LocalizedPricingContextTier = PricingContextTier & {
	label: string;
	detail: string;
};

function isTokenMeter(meter: PricingMeter): boolean {
	return parseMeter(meter.meter).unit === "token" || meter.unit.toLowerCase().includes("token");
}

function formatUnitPrice(
	meter: PricingMeter,
	pricingTimeUtc: string,
	locale: string,
	perMillionTokens: string,
	formatUnitPriceMessage: (values: { price: string; currency: string; count: string; unit: string }) => string
,
	formatNumber: (value: number) => string = value => new Intl.NumberFormat(locale).format(value),
) {
	const derivedUnit = parseMeter(meter.meter).unit;
	const unitLabel = derivedUnit !== "unknown" ? derivedUnit : meter.unit;
	const { pricePerUnit, pricePerUnitRaw } = resolvePricingMeterPrice(meter, pricingTimeUtc);
	if (unitLabel.toLowerCase().includes("token")) {
		return `${fmtUSD((pricePerUnit / (meter.unit_size || 1)) * 1_000_000)} ${perMillionTokens}`;
	}
	return formatUnitPriceMessage({
		price: pricePerUnitRaw,
		currency: meter.currency,
		count: formatNumber(meter.unit_size),
		unit: unitLabel,
	});
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
	locale,
	perMillionTokens,
	formatUnitPriceMessage,
}: {
	tiers: LocalizedPricingContextTier[];
	meterName: string;
	pricingTimeUtc: string;
	locale: string;
	perMillionTokens: string;
	formatUnitPriceMessage: (values: { price: string; currency: string; count: string; unit: string }) => string;
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
						<p className="mt-0.5 text-sm font-semibold tabular-nums">{formatUnitPrice(meter, pricingTimeUtc, locale, perMillionTokens, formatUnitPriceMessage, format.number)}</p>
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
	const locale = useLocale();
	const t = useTranslations("Product.tools.pricing");
	const translateMeter = useTranslations("Catalogue.modelDetail.pricing.meters");
	const getMeterLabel = (meterName: string) =>
		translateMeter.has(meterName as never)
			? translateMeter(meterName as never)
			: formatSentenceLabel(formatMeterName(meterName));
	const localizeContextTier = (tier: PricingContextTier): LocalizedPricingContextTier => {
		let label: string;
		switch (tier.labelKey) {
			case "publishedRate": label = t("publishedRate"); break;
			case "standardContext": label = t("standardContext"); break;
			case "longContext": label = t("longContext"); break;
			case "contextTier": label = t("contextTier", { index: tier.labelIndex ?? 1 }); break;
		}

		let detail: string;
		switch (tier.detailKey) {
			case "noContextPriceChange": detail = t("noContextPriceChange"); break;
			case "upToInputTokens": detail = t("upToInputTokens", { count: tier.upperTokenCount ?? "" }); break;
			case "overInputTokens": detail = t("overInputTokens", { count: tier.lowerTokenCount ?? "" }); break;
			case "inputTokenRange": detail = t("inputTokenRange", {
				lower: tier.lowerTokenCount ?? "",
				upper: tier.upperTokenCount ?? "",
			}); break;
		}
		return { ...tier, label, detail };
	};
	const format = useDisplayFormatters();
	if (meters.length === 0) return null;
	const activeModels: ComparisonPricingModel[] =
		comparisonModels && comparisonModels.length > 0
			? comparisonModels
			: [{
				key: "primary",
				label: selectedModelLabel || selectedModelId || t("selectedModel"),
				modelId: selectedModelId,
				provider: selectedProvider || selectedModelId?.split("/")[0] || "selected",
				pricingPlan: pricingPlan || "standard",
				meters,
			}];
	const contextTiersByModel = new Map(
		activeModels.map((model) => [
			model.key,
			getPricingContextTiers(model.allMeters ?? model.meters).map(localizeContextTier),
		])
	);
	const hasContextTiers = [...contextTiersByModel.values()].some((tiers) => tiers.length > 1);
	const blendedTiersByModel = new Map(
		activeModels.map((model) => [
			model.key,
			(contextTiersByModel.get(model.key) ?? []).map((tier) => ({
				tier,
				rate: calculateArtificialAnalysisBlendedRate(tier.meters, pricingTimeUtc),
			})).filter((entry): entry is { tier: LocalizedPricingContextTier; rate: BlendedRate } => Boolean(entry.rate)),
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
					<span>{t("pricingReference")}</span>
					<Badge variant="outline" className="rounded-lg bg-background text-[11px]">
						{t("ratesAtUtc", { time: pricingTimeUtc })}
					</Badge>
				</CardTitle>
				{hasContextTiers ? (
					<p className="text-xs text-muted-foreground">
						{t("contextRatesDescription")}
					</p>
				) : null}
			</CardHeader>
			<CardContent className="space-y-6 pt-5">
				{hasBlendedRates ? (
					<section className="space-y-3">
						<div>
							<h3 className="text-sm font-semibold">{t("textTokenSnapshot")}</h3>
							<p className="text-xs text-muted-foreground">
								{t("blendedMixDescription")}
							</p>
						</div>
						<ScrollArea scrollBarOrientation="horizontal" className="w-full rounded-xl border" viewportClassName="rounded-xl">
							<Table>
								<TableHeader>
									<TableRow className="bg-muted/20 hover:bg-muted/20">
										<TableHead className="sticky left-0 z-10 min-w-[250px] bg-muted/20">{t("rate")}</TableHead>
										{activeModels.map((model) => <TableHead key={`blend-head-${model.key}`} className="min-w-[240px]"><PricingModelHeader model={model} /></TableHead>)}
									</TableRow>
								</TableHeader>
								<TableBody>
									{[
										{ key: "blended", label: t("blendedRate"), description: t("blendedRateDescription"), value: (rate: BlendedRate) => rate.blendedPer1M },
										{ key: "cache", label: t("cacheHitInput"), description: t("cacheHitShare"), value: (rate: BlendedRate) => rate.cacheHitPer1M },
										{ key: "input", label: t("regularInput"), description: t("regularInputShare"), value: (rate: BlendedRate) => rate.inputPer1M },
										{ key: "output", label: t("output"), description: t("outputShare"), value: (rate: BlendedRate) => rate.outputPer1M },
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
											if (tierRates.length === 0) return <TableCell key={`${row.key}-${model.key}`} className="text-sm text-muted-foreground">{t("notAvailable")}</TableCell>;
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
									{t("cacheFallbackDescription")}
								</p>
							) : null}
						</section>
				) : null}

				<section className="space-y-3">
					<div>
						<h3 className="text-sm font-semibold">{t("allPricedMeters")}</h3>
						<p className="text-xs text-muted-foreground">{t("unitRatesDescription")}</p>
					</div>
					<ScrollArea scrollBarOrientation="horizontal" className="w-full rounded-xl border" viewportClassName="rounded-xl">
						<Table>
							<TableHeader>
								<TableRow className="bg-muted/20 hover:bg-muted/20">
									<TableHead className="sticky left-0 z-10 min-w-[250px] bg-muted/20">{t("meter")}</TableHead>
								{activeModels.map((model) => <TableHead key={`meter-head-${model.key}`} className="min-w-[360px]"><PricingModelHeader model={model} /></TableHead>)}
								</TableRow>
							</TableHeader>
							<TableBody>
								{meterNames.map((meterName) => {
									const representative = activeModels.flatMap((model) => model.meters).find((meter) => meter.meter === meterName);
									const example = representative ? getExamplesForMeter(representative)[1] ?? getExamplesForMeter(representative)[0] ?? 1 : 1;
									return (
										<TableRow key={meterName}>
										<TableCell className="sticky left-0 z-10 bg-background"><MeterLabel meterName={meterName} label={getMeterLabel(meterName)} description={representative?.unit || t("usage")} /></TableCell>
											{activeModels.map((model) => {
												const meter = model.meters.find((item) => item.meter === meterName);
												if (!meter) return <TableCell key={`${meterName}-${model.key}`} className="text-sm text-muted-foreground">{t("notPriced")}</TableCell>;
												const timeWindow = resolvePricingMeterPrice(meter, pricingTimeUtc).timeWindow;
												const contextTiers = contextTiersByModel.get(model.key) ?? [];
												return (
													<TableCell key={`${meterName}-${model.key}`}>
										<ContextRateStack
											tiers={contextTiers}
											meterName={meterName}
											pricingTimeUtc={pricingTimeUtc}
											locale={locale}
											perMillionTokens={t("perMillionTokens")}
											formatUnitPriceMessage={(values) => t("unitPrice", values)}
										/>
										{isTokenMeter(meter) ? (
											<div className="mt-3 space-y-3 border-t pt-3">
												<p className="text-[10px] font-medium text-muted-foreground">{t("currentRateCalculations")}</p>
														<div>
															<p className="mb-1.5 text-[10px] font-medium text-muted-foreground">{t("tokenVolume")}</p>
															<div className="grid grid-cols-4 gap-2">
																{TOKEN_VOLUME_PRESETS.map((quantity) => (
																	<div key={quantity} className="min-w-0">
																	<p className="text-[10px] text-muted-foreground">{formatQuantity(quantity, t("unlimited"))}</p>
																		<p className="truncate text-xs font-semibold tabular-nums">{fmtUSD(calculateCost(quantity, meter, pricingTimeUtc))}</p>
																	</div>
																))}
															</div>
														</div>
														<div>
															<p className="mb-1.5 text-[10px] font-medium text-muted-foreground">{t("budgetBuys")}</p>
															<div className="grid grid-cols-4 gap-2">
																{BUDGET_PRESETS.map((budget) => (
																	<div key={budget} className="min-w-0">
																		<p className="text-[10px] text-muted-foreground">{new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(budget)}</p>
																		<p className="truncate text-xs font-semibold tabular-nums">{formatQuantity(calculateUnits(budget, meter, pricingTimeUtc), t("unlimited"))}</p>
																	</div>
																))}
															</div>
														</div>
													</div>
												) : (
													<>
														<p className="mt-1 text-xs text-muted-foreground">{t("costsValue", { quantity: formatQuantity(example, t("unlimited")), price: fmtUSD(calculateCost(example, meter, pricingTimeUtc)) })}</p>
														<p className="mt-1 text-xs text-muted-foreground">{t("buysValue", { budget: new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(10), units: formatQuantity(calculateUnits(10, meter, pricingTimeUtc), t("unlimited")) })}</p>
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
