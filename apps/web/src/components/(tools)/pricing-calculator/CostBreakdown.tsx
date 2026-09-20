"use client";

import { useMemo } from "react";
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
	fmtUSD,
	formatMeterName,
	formatPricingTimeWindow,
	formatQuantity,
	resolvePricingMeterPrice,
	type PricingMeter,
} from "@/components/(data)/model/pricing/pricingHelpers";
import { sanitizeRequestMultiplier } from "./calculatorState";
import {
	MeterLabel,
	PricingModelHeader,
	formatSentenceLabel,
	type ComparisonPricingModel,
} from "./PricingTableVisuals";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

interface CostBreakdownProps {
	meters: PricingMeter[];
	meterInputs: Record<string, string>;
	requestMultiplier: number;
	pricingTimeUtc: string;
	comparisonModels?: ComparisonPricingModel[];
}

function calculateLineCost(
	meter: PricingMeter,
	meterInputs: Record<string, string>,
	requestMultiplier: number,
	pricingTimeUtc: string
): number {
	const inputValue = parseFloat(meterInputs[meter.meter] || "0");
	if (!Number.isFinite(inputValue) || inputValue <= 0) return 0;
	const multipliedValue = inputValue * sanitizeRequestMultiplier(requestMultiplier);
	const unitSize = Number(meter.unit_size) > 0 ? Number(meter.unit_size) : 1;
	const { pricePerUnit } = resolvePricingMeterPrice(meter, pricingTimeUtc);
	return (multipliedValue / unitSize) * pricePerUnit;
}

export function CostBreakdown({
	meters,
	meterInputs,
	requestMultiplier,
	pricingTimeUtc,
	comparisonModels,
}: CostBreakdownProps) {
	const format = useDisplayFormatters();
	const safeRequestMultiplier = sanitizeRequestMultiplier(requestMultiplier);
	const activeModels = useMemo<ComparisonPricingModel[]>(
		() =>
			comparisonModels && comparisonModels.length > 0
				? comparisonModels
				: [{ key: "primary", label: "Selected Model", provider: "selected", pricingPlan: "standard", meters }],
		[comparisonModels, meters]
	);
	const activeMeterNames = useMemo(() => {
		const names = new Set<string>();
		for (const meter of meters) {
			if (parseFloat(meterInputs[meter.meter] || "0") > 0) names.add(meter.meter);
		}
		return Array.from(names).sort((left, right) =>
			formatMeterName(left).localeCompare(formatMeterName(right))
		);
	}, [meterInputs, meters]);
	const totalsByModel = useMemo(
		() => new Map(activeModels.map((model) => [
			model.key,
			model.meters.reduce(
				(total, meter) => total + calculateLineCost(meter, meterInputs, safeRequestMultiplier, pricingTimeUtc),
				0
			),
		])),
		[activeModels, meterInputs, pricingTimeUtc, safeRequestMultiplier]
	);

	if (activeMeterNames.length === 0) return null;

	return (
		<Card>
			<CardHeader className="border-b bg-muted/10">
				<CardTitle className="flex items-center justify-between gap-3">
					<span>Cost estimate</span>
					<span className="text-xs font-normal text-muted-foreground">
						{activeModels.length} model{activeModels.length === 1 ? "" : "s"}
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4 pt-5">
				<ScrollArea scrollBarOrientation="horizontal" className="w-full rounded-xl border" viewportClassName="rounded-xl">
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/20 hover:bg-muted/20">
								<TableHead className="sticky left-0 z-10 min-w-[250px] bg-muted/20">Usage</TableHead>
								{activeModels.map((model) => (
									<TableHead key={`estimate-head-${model.key}`} className="min-w-[240px]">
										<PricingModelHeader model={model} />
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							<TableRow className="bg-primary/5 hover:bg-primary/5">
								<TableCell className="sticky left-0 z-10 bg-primary/5">
									<MeterLabel meterName="total_cost" label="Estimated total" description="Across entered usage" />
								</TableCell>
								{activeModels.map((model) => (
									<TableCell key={`estimate-total-${model.key}`}>
										<span className="text-base font-semibold tabular-nums">{fmtUSD(totalsByModel.get(model.key) ?? 0)}</span>
									</TableCell>
								))}
							</TableRow>
							{activeMeterNames.map((meterName) => {
								const inputValue = parseFloat(meterInputs[meterName] || "0");
								const multipliedValue = inputValue * safeRequestMultiplier;
								return (
									<TableRow key={`estimate-row-${meterName}`}>
										<TableCell className="sticky left-0 z-10 bg-background">
											<MeterLabel
												meterName={meterName}
												label={formatSentenceLabel(formatMeterName(meterName))}
												description={`${formatQuantity(multipliedValue)} total usage`}
											/>
										</TableCell>
										{activeModels.map((model) => {
											const meter = model.meters.find((item) => item.meter === meterName);
											if (!meter) return <TableCell key={`estimate-${model.key}-${meterName}`} className="text-muted-foreground">Not priced</TableCell>;
											const resolvedPrice = resolvePricingMeterPrice(meter, pricingTimeUtc);
											const lineCost = calculateLineCost(meter, meterInputs, safeRequestMultiplier, pricingTimeUtc);
											return (
												<TableCell key={`estimate-${model.key}-${meterName}`}>
													<p className="font-semibold tabular-nums">{fmtUSD(lineCost)}</p>
													<p className="mt-1 text-xs text-muted-foreground">
												{fmtUSD(resolvedPrice.pricePerUnit)} per {format.number(meter.unit_size)} {meter.unit}
													</p>
													{resolvedPrice.timeWindow ? <p className="mt-1 text-xs text-muted-foreground">{formatPricingTimeWindow(resolvedPrice.timeWindow)}</p> : null}
												</TableCell>
											);
										})}
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</ScrollArea>
				<p className="text-xs text-muted-foreground">
					Inputs are multiplied by {format.number(safeRequestMultiplier)} request{safeRequestMultiplier === 1 ? "" : "s"} before costs are calculated.
				</p>
			</CardContent>
		</Card>
	);
}
