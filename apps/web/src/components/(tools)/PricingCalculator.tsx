"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";

type PricingModel = {
	provider: string;
	model: string;
	endpoint: string;
	display_name?: string;
	meters: Array<{
		meter: string;
		unit: string;
		unit_size: number;
		price_per_unit: string;
		currency: string;
		conditions?: any[];
	}>;
};

type PricingCalculatorProps = {
	initialModels?: PricingModel[];
};

export default function PricingCalculator({
	initialModels,
}: PricingCalculatorProps) {
	const [models] = useState<PricingModel[]>(initialModels || []);

	const providerGroups = useMemo(() => {
		const map = new Map<string, Map<string, PricingModel[]>>();

		models.forEach((model) => {
			const providerLabel = model.provider || "unknown";
			const endpointLabel = model.endpoint || "endpoint";
			if (!map.has(providerLabel)) {
				map.set(providerLabel, new Map());
			}
			const endpointMap = map.get(providerLabel)!;
			const bucket = endpointMap.get(endpointLabel) ?? [];
			bucket.push(model);
			endpointMap.set(endpointLabel, bucket);
		});

		return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
	}, [models]);

	const [selectedModel, setSelectedModel] = useState<string>("");
	const [openModel, setOpenModel] = useState(false);

	const selectedModelData = models.find(
		(model) => model.model === selectedModel
	);

	const getExamplesForMeter = (meter: PricingModel["meters"][0]) => {
		const unit = meter.unit.toLowerCase();
		if (unit.includes("token")) {
			return [1000, 1000000, 1000000000]; // 1K, 1M, 1B
		} else if (
			unit.includes("second") ||
			unit.includes("minute") ||
			unit.includes("hour")
		) {
			return [1, 10, 60]; // 1s, 10s, 1min
		} else if (unit.includes("request")) {
			return [1, 10, 100]; // 1, 10, 100
		} else {
			return [1, 10, 100]; // default
		}
	};

	const result = useMemo(() => {
		if (!selectedModelData) return null;

		const lines: Array<{
			dimension: string;
			quantity: number;
			billable_units: number;
			unit_size: number;
			unit_price_usd: string;
			line_cost_usd: string;
			line_nanos: number;
		}> = [];

		for (const meter of selectedModelData.meters) {
			const examples = getExamplesForMeter(meter);
			for (const quantity of examples) {
				const unitSize = meter.unit_size || 1;
				const billableUnits = Math.ceil(quantity / unitSize);
				const pricePerUnit = parseFloat(meter.price_per_unit) || 0;
				const lineCost = billableUnits * pricePerUnit;

				lines.push({
					dimension: meter.meter,
					quantity,
					billable_units: billableUnits,
					unit_size: unitSize,
					unit_price_usd: meter.price_per_unit,
					line_cost_usd: lineCost.toFixed(9),
					line_nanos: Math.round(lineCost * 1_000_000_000),
				});
			}
		}

		if (!lines.length) return null;

		// Group by dimension
		const groupedLines = lines.reduce((acc, line) => {
			if (!acc[line.dimension]) acc[line.dimension] = [];
			acc[line.dimension].push(line);
			return acc;
		}, {} as Record<string, typeof lines>);

		return {
			groupedLines,
			currency: "USD",
		};
	}, [selectedModelData]);

	return (
		<div className="container mx-auto py-8 px-4">
			<div className="mb-6">
				<h1 className="text-3xl font-bold mb-2">Pricing Calculator</h1>
				<p className="text-muted-foreground">
					Calculate costs for AI model usage. Select a model to view
					pricing examples.
				</p>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				{/* Input Section */}
				<Card>
					<CardHeader>
						<CardTitle>Model Selection</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="model-select">Select Model</Label>
							<Popover
								open={openModel}
								onOpenChange={setOpenModel}
							>
								<PopoverTrigger asChild>
									<Button
										variant="outline"
										role="combobox"
										aria-expanded={openModel}
										className="w-full justify-between"
									>
										{selectedModelData
											? `${
													selectedModelData.provider
											  } / ${
													selectedModelData.endpoint
											  } / ${
													selectedModelData.display_name ||
													selectedModelData.model
											  }`
											: "Select model..."}
										<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-full p-0">
									<Command>
										<CommandInput placeholder="Search models..." />
										<CommandList>
											<CommandEmpty>
												No model found.
											</CommandEmpty>
											{providerGroups.map(
												([provider, endpointMap]: [
													string,
													Map<string, PricingModel[]>
												]) => (
													<CommandGroup
														key={provider}
														heading={provider}
													>
														{Array.from(
															endpointMap.entries()
														).map(
															([
																endpoint,
																groupModels,
															]) =>
																groupModels.map(
																	(model) => (
																		<CommandItem
																			key={`${provider}-${endpoint}-${model.model}`}
																			value={`${provider}-${endpoint}-${model.model}`}
																			onSelect={() => {
																				setSelectedModel(
																					model.model
																				);
																				setOpenModel(
																					false
																				);
																			}}
																		>
																			<Check
																				className={cn(
																					"mr-2 h-4 w-4",
																					selectedModel ===
																						model.model
																						? "opacity-100"
																						: "opacity-0"
																				)}
																			/>
																			{
																				endpoint
																			}{" "}
																			-{" "}
																			{model.display_name ||
																				model.model}
																		</CommandItem>
																	)
																)
														)}
													</CommandGroup>
												)
											)}
										</CommandList>
									</Command>
								</PopoverContent>
							</Popover>
						</div>

						{selectedModelData && (
							<div className="space-y-4">
								<div className="border-t pt-4 space-y-4">
									<div>
										<h3 className="font-semibold mb-3">
											Pricing Examples
										</h3>
										{selectedModelData.meters.map(
											(meter) => (
												<div
													key={meter.meter}
													className="space-y-2"
												>
													<Label>
														{meter.meter
															.replace(/_/g, " ")
															.replace(
																/\b\w/g,
																(l) =>
																	l.toUpperCase()
															)}
														<span className="text-sm text-muted-foreground ml-2">
															({meter.unit}, unit
															size:{" "}
															{meter.unit_size})
														</span>
													</Label>
													<div className="grid grid-cols-1 gap-2">
														{result?.groupedLines?.[
															meter.meter
														]?.map((line, idx) => (
															<div
																key={idx}
																className="flex justify-between items-center p-2 bg-muted rounded"
															>
																<span>
																	{line.quantity.toLocaleString()}{" "}
																	{meter.unit}
																</span>
																<span className="font-medium">
																	{
																		line.line_cost_usd
																	}{" "}
																	USD
																</span>
															</div>
														))}
													</div>
													<p className="text-xs text-muted-foreground">
														Price:{" "}
														{meter.price_per_unit}{" "}
														{meter.currency} per{" "}
														{meter.unit_size}{" "}
														{meter.unit}
													</p>
												</div>
											)
										)}
									</div>
								</div>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Results Section */}
				<Card>
					<CardHeader>
						<CardTitle>Pricing Breakdown</CardTitle>
					</CardHeader>
					<CardContent>
						{result ? (
							<div className="space-y-4">
								{Object.entries(result.groupedLines).map(
									([dimension, lines]) => (
										<div
											key={dimension}
											className="space-y-2"
										>
											<h4 className="font-semibold">
												{dimension
													.replace(/_/g, " ")
													.replace(/\b\w/g, (l) =>
														l.toUpperCase()
													)}
											</h4>
											{lines.map((line, index) => (
												<div
													key={index}
													className="flex justify-between items-center py-2 border-b last:border-b-0"
												>
													<div>
														<div className="font-medium">
															{line.quantity.toLocaleString()}{" "}
															units
														</div>
														<div className="text-sm text-muted-foreground">
															{
																line.unit_price_usd
															}{" "}
															USD per{" "}
															{line.unit_size}{" "}
															units
														</div>
													</div>
													<div className="text-right">
														<div className="font-medium">
															{line.line_cost_usd}{" "}
															USD
														</div>
														<div className="text-sm text-muted-foreground">
															{
																line.billable_units
															}{" "}
															billable units
														</div>
													</div>
												</div>
											))}
										</div>
									)
								)}
							</div>
						) : (
							<div className="text-center text-muted-foreground py-8">
								Select a model to view pricing examples
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
