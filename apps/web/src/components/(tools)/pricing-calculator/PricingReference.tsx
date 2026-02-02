"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
import { Logo } from "@/components/Logo";
import { CircleDollarSign, Gift, Layers, Sparkles, Zap } from "lucide-react";

interface PricingReferenceProps {
	meters: PricingMeter[];
	pricingPlan?: string | null;
	availableProviders: Array<{ provider: string; displayName: string }>;
	availablePricingPlans: string[];
	selectedProvider: string;
	selectedPricingPlan: string;
	onProviderSelect: (provider: string) => void;
	onPricingPlanSelect: (plan: string) => void;
}

export function PricingReference({
	meters,
	pricingPlan,
	availableProviders,
	availablePricingPlans,
	selectedProvider,
	selectedPricingPlan,
	onProviderSelect,
	onPricingPlanSelect,
}: PricingReferenceProps) {
	if (meters.length === 0) {
		return null;
	}

	const displayPlan = pricingPlan || "standard";
	const showProviderSelect = availableProviders.length > 1;
	const showPricingPlanSelect = availablePricingPlans.length > 1;

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

	// Calculate blended rate (9:1 input:output ratio for typical usage)
	const calculateBlendedRate = () => {
		// Find input and output token meters
		const inputMeter = meters.find(m =>
			m.meter.toLowerCase().includes('input') &&
			m.meter.toLowerCase().includes('token') &&
			!m.meter.toLowerCase().includes('cached')
		);
		const outputMeter = meters.find(m =>
			m.meter.toLowerCase().includes('output') &&
			m.meter.toLowerCase().includes('token')
		);

		if (!inputMeter || !outputMeter) return null;

		// Calculate price per token for each
		const inputPricePerToken = parseFloat(inputMeter.price_per_unit) / (inputMeter.unit_size || 1);
		const outputPricePerToken = parseFloat(outputMeter.price_per_unit) / (outputMeter.unit_size || 1);

		// Blended rate: 90% input, 10% output
		const blendedPricePerToken = (inputPricePerToken * 0.9) + (outputPricePerToken * 0.1);

		// Convert to per 1M tokens
		const blendedPer1M = blendedPricePerToken * 1_000_000;

		return {
			blendedPer1M,
			inputPer1M: inputPricePerToken * 1_000_000,
			outputPer1M: outputPricePerToken * 1_000_000,
		};
	};

	const blendedRate = calculateBlendedRate();

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center justify-between flex-wrap gap-2">
					<span>Pricing Reference</span>
					<div className="flex items-center gap-2">
						{showProviderSelect && (
							<Select
								value={selectedProvider}
								onValueChange={onProviderSelect}
							>
								<SelectTrigger className="h-8 w-[140px] text-xs">
									<SelectValue placeholder="Provider" />
								</SelectTrigger>
								<SelectContent>
									{availableProviders.map((provider) => (
										<SelectItem key={provider.provider} value={provider.provider}>
											<div className="flex items-center gap-2">
												<Logo
													id={provider.provider}
													width={16}
													height={16}
													className="w-4 h-4"
													fallback={<div className="w-4 h-4 bg-muted rounded" />}
												/>
												{provider.displayName}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
						{showPricingPlanSelect && (
							<Select
								value={selectedPricingPlan}
								onValueChange={onPricingPlanSelect}
							>
								<SelectTrigger className="h-8 w-[120px] text-xs">
									<SelectValue placeholder="Plan" />
								</SelectTrigger>
								<SelectContent>
									{availablePricingPlans.map((plan) => (
										<SelectItem key={plan} value={plan}>
											<div className="flex items-center gap-2">
												{getPricingPlanIcon(plan)}
												{plan.charAt(0).toUpperCase() + plan.slice(1)}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
						{displayPlan && !showPricingPlanSelect && (
							<Badge variant="secondary" className="text-xs h-8 flex items-center gap-1">
								{getPricingPlanIcon(displayPlan)}
								{displayPlan.charAt(0).toUpperCase() + displayPlan.slice(1)}
							</Badge>
						)}
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Blended Rate Section */}
				{blendedRate && (
					<div className="bg-primary/5 border-2 border-primary/20 rounded-lg p-4">
						<div className="flex items-start justify-between gap-4 mb-3">
							<div>
								<h4 className="font-semibold text-sm mb-1">Blended Rate</h4>
								<p className="text-xs text-muted-foreground">
									Typical usage (9:1 input/output ratio)
								</p>
							</div>
							<div className="text-right">
								<div className="text-2xl font-bold text-primary">
									{fmtUSD(blendedRate.blendedPer1M)}
								</div>
								<div className="text-xs text-muted-foreground">per 1M tokens</div>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-2 text-xs">
							<div className="bg-background/50 rounded p-2">
								<div className="text-muted-foreground mb-1">Input (90%)</div>
								<div className="font-medium">{fmtUSD(blendedRate.inputPer1M)}/1M</div>
							</div>
							<div className="bg-background/50 rounded p-2">
								<div className="text-muted-foreground mb-1">Output (10%)</div>
								<div className="font-medium">{fmtUSD(blendedRate.outputPer1M)}/1M</div>
							</div>
						</div>
					</div>
				)}

				{/* Individual Meters */}
				{meters.map((meter) => {
					const examples = getExamplesForMeter(meter);
					const budgets = [1, 10, 100];
					const derivedUnit = parseMeter(meter.meter).unit;
					const unitLabel =
						derivedUnit !== "unknown" ? derivedUnit : meter.unit;

					return (
						<div
							key={meter.meter}
							className="space-y-3 border-b pb-4 last:border-b-0"
						>
							<div className="flex items-center justify-between">
								<h4 className="font-semibold">{formatMeterName(meter.meter)}</h4>
								<p className="text-xs text-muted-foreground">
									{meter.price_per_unit} {meter.currency} per {meter.unit_size} {unitLabel}
								</p>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label className="text-xs text-muted-foreground">
										Cost by usage
									</Label>
									{examples.map((quantity: number) => {
										const cost = calculateCost(quantity, meter);
										return (
											<div
												key={quantity}
												className="flex justify-between p-2 bg-muted rounded text-sm"
											>
												<span>
													{formatQuantity(quantity)} {unitLabel}
												</span>
												<span className="font-medium">{fmtUSD(cost)}</span>
											</div>
										);
									})}
								</div>

								<div className="space-y-2">
									<Label className="text-xs text-muted-foreground">
										Usage by budget
									</Label>
									{budgets.map((budget) => {
										const units = calculateUnits(budget, meter);
										return (
											<div
												key={budget}
												className="flex justify-between p-2 bg-muted rounded text-sm"
											>
												<span>{fmtUSD(budget)}</span>
												<span className="font-medium">
													{formatQuantity(units)} {unitLabel}
												</span>
											</div>
										);
									})}
								</div>
							</div>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}
