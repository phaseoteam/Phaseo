"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
	formatQuantity,
	formatMeterName,
	formatPricingTimeWindow,
	resolvePricingMeterPrice,
	type PricingMeter,
} from "@/components/(data)/model/pricing/pricingHelpers";

type ComparisonPricingModel = {
	key: string;
	label: string;
	modelId?: string;
	provider: string;
	pricingPlan: string;
	meters: PricingMeter[];
};

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
	if (inputValue === 0) return 0;

	const multipliedValue = inputValue * requestMultiplier;
	const unitSize = meter.unit_size || 1;
	const billedUnits = multipliedValue / unitSize;
	const { pricePerUnit } = resolvePricingMeterPrice(meter, pricingTimeUtc);

	return billedUnits * pricePerUnit;
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

export function CostBreakdown({
	meters,
	meterInputs,
	requestMultiplier,
	pricingTimeUtc,
	comparisonModels,
}: CostBreakdownProps) {
	const activeModels = useMemo(
		() =>
			comparisonModels && comparisonModels.length > 0
				? comparisonModels
				: [
						{
							key: "primary",
							label: "Selected Model",
							provider: "selected",
							pricingPlan: "standard",
							meters,
						},
				  ],
		[comparisonModels, meters]
	);

	const activeMeterNames = useMemo(() => {
		const names = new Set<string>();
		for (const meter of meters) {
			if (parseFloat(meterInputs[meter.meter] || "0") > 0) {
				names.add(meter.meter);
			}
		}
		return Array.from(names).sort((a, b) =>
			formatMeterName(a).localeCompare(formatMeterName(b))
		);
	}, [meterInputs, meters]);

	const totalsByModel = useMemo(() => {
		return new Map(
			activeModels.map((model) => {
				const total = model.meters.reduce(
					(sum, meter) =>
						sum +
						calculateLineCost(
							meter,
							meterInputs,
							requestMultiplier,
							pricingTimeUtc
						),
					0
				);
				return [model.key, total];
			})
		);
	}, [activeModels, meterInputs, pricingTimeUtc, requestMultiplier]);

	if (activeMeterNames.length === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Cost Estimate</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="overflow-x-auto rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="sticky left-0 z-10 min-w-[220px] bg-background">
									Meter
								</TableHead>
								{activeModels.map((model) => (
									<TableHead
										key={`estimate-head-${model.key}`}
										className="min-w-[190px]"
									>
										<div className="space-y-1">
											<p className="truncate font-medium">{model.label}</p>
											<p className="truncate text-xs font-normal text-muted-foreground">
												{formatProviderLabel(model.provider)} · {model.pricingPlan}
											</p>
										</div>
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							<TableRow className="bg-primary/5">
								<TableCell className="sticky left-0 z-10 bg-primary/5 font-semibold">
									Estimated total
								</TableCell>
								{activeModels.map((model) => (
									<TableCell
										key={`estimate-total-${model.key}`}
										className="font-semibold"
									>
										{fmtUSD(totalsByModel.get(model.key) ?? 0)}
									</TableCell>
								))}
							</TableRow>
							{activeMeterNames.map((meterName) => {
								const inputValue = parseFloat(meterInputs[meterName] || "0");
								const multipliedValue = inputValue * requestMultiplier;

								return (
									<TableRow key={`estimate-row-${meterName}`}>
										<TableCell className="sticky left-0 z-10 bg-background">
											<div className="space-y-1">
												<p className="font-medium">
													{formatMeterName(meterName)}
												</p>
												<p className="text-xs text-muted-foreground">
													{formatQuantity(multipliedValue)} total usage
												</p>
											</div>
										</TableCell>
										{activeModels.map((model) => {
											const meter =
												model.meters.find((item) => item.meter === meterName) ??
												null;
											if (!meter) {
												return (
													<TableCell key={`estimate-${model.key}-${meterName}`}>
														-
													</TableCell>
												);
											}
											const resolvedPrice = resolvePricingMeterPrice(
												meter,
												pricingTimeUtc
											);
											const lineCost = calculateLineCost(
												meter,
												meterInputs,
												requestMultiplier,
												pricingTimeUtc
											);

											return (
												<TableCell key={`estimate-${model.key}-${meterName}`}>
													<div className="space-y-1">
														<p className="font-medium">{fmtUSD(lineCost)}</p>
														<p className="text-xs text-muted-foreground">
															{fmtUSD(resolvedPrice.pricePerUnit)} /{" "}
															{meter.unit_size.toLocaleString()} {meter.unit}
														</p>
														{resolvedPrice.timeWindow ? (
															<p className="text-xs text-muted-foreground">
																{formatPricingTimeWindow(
																	resolvedPrice.timeWindow
																)}
															</p>
														) : null}
													</div>
												</TableCell>
											);
										})}
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
				<p className="text-xs text-muted-foreground">
					Inputs are multiplied by {requestMultiplier.toLocaleString()} request
					{requestMultiplier === 1 ? "" : "s"} before costs are calculated.
				</p>
			</CardContent>
		</Card>
	);
}
