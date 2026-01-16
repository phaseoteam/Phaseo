"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	fmtUSD,
	formatQuantity,
	formatMeterName,
	type PricingMeter,
} from "@/components/(data)/model/pricing/pricingHelpers";

interface CostBreakdownProps {
	meters: PricingMeter[];
	meterInputs: Record<string, string>;
	requestMultiplier: number;
}

export function CostBreakdown({
	meters,
	meterInputs,
	requestMultiplier,
}: CostBreakdownProps) {
	const calculateLineCost = (meter: PricingMeter): number => {
		const inputValue = parseFloat(meterInputs[meter.meter] || "0");
		if (inputValue === 0) return 0;

		const multipliedValue = inputValue * requestMultiplier;
		const unitSize = meter.unit_size || 1;
		const billableUnits = Math.ceil(multipliedValue / unitSize);
		const unitPrice = parseFloat(meter.price_per_unit) || 0;

		return billableUnits * unitPrice;
	};

	const calculateBillableUnits = (meter: PricingMeter): number => {
		const inputValue = parseFloat(meterInputs[meter.meter] || "0");
		if (inputValue === 0) return 0;

		const multipliedValue = inputValue * requestMultiplier;
		const unitSize = meter.unit_size || 1;

		return Math.ceil(multipliedValue / unitSize);
	};

	const lines = meters
		.map((meter) => ({
			meter,
			lineCost: calculateLineCost(meter),
			inputValue: parseFloat(meterInputs[meter.meter] || "0"),
			multipliedValue: parseFloat(meterInputs[meter.meter] || "0") * requestMultiplier,
			billableUnits: calculateBillableUnits(meter),
			unitPrice: parseFloat(meter.price_per_unit) || 0,
		}))
		.filter((line) => line.inputValue > 0);

	const totalCost = lines.reduce((sum, line) => sum + line.lineCost, 0);

	if (lines.length === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Cost Estimate</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="border-2 border-primary rounded-lg p-6 mb-6">
					<div className="text-center">
						<Label className="text-sm text-muted-foreground">
							Estimated Total Cost
						</Label>
						<div className="text-4xl font-bold mt-2">{fmtUSD(totalCost)}</div>
						<p className="text-xs text-muted-foreground mt-1">
							Based on your input values
						</p>
					</div>
				</div>

				<div className="space-y-4">
					<h4 className="font-semibold">Breakdown by Meter</h4>
					{lines.map((line) => (
						<div
							key={line.meter.meter}
							className="border-b pb-3 last:border-b-0"
						>
							<div className="flex justify-between items-center mb-2">
								<div className="font-medium">
									{formatMeterName(line.meter.meter)}
								</div>
								<div className="font-bold">{fmtUSD(line.lineCost)}</div>
							</div>
							<div className="text-sm text-muted-foreground space-y-1">
								<div className="flex justify-between">
									<span>Input value:</span>
									<span>{formatQuantity(line.inputValue)}</span>
								</div>
								<div className="flex justify-between">
									<span>× {requestMultiplier} requests:</span>
									<span>{formatQuantity(line.multipliedValue)}</span>
								</div>
								<div className="flex justify-between">
									<span>Billable units:</span>
									<span>{line.billableUnits.toLocaleString()}</span>
								</div>
								<div className="flex justify-between">
									<span>Unit price:</span>
									<span>{fmtUSD(line.unitPrice)}</span>
								</div>
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
