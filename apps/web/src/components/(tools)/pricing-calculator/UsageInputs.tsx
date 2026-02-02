"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	getMeterInputConfig,
	formatMeterName,
	parseMeter,
	type PricingMeter,
} from "@/components/(data)/model/pricing/pricingHelpers";

interface UsageInputsProps {
	meters: PricingMeter[];
	meterInputs: Record<string, string>;
	requestMultiplier: number;
	onMeterInputChange: (meter: string, value: string) => void;
	onRequestMultiplierChange: (value: number) => void;
}

export function UsageInputs({
	meters,
	meterInputs,
	requestMultiplier,
	onMeterInputChange,
	onRequestMultiplierChange,
}: UsageInputsProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Usage Inputs</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{meters.map((meter) => {
					const inputConfig = getMeterInputConfig(meter.unit, meter.meter);
					const derivedUnit = parseMeter(meter.meter).unit;
					const unitLabel =
						derivedUnit !== "unknown" ? derivedUnit : meter.unit;
					return (
						<div key={meter.meter} className="space-y-2">
							<Label htmlFor={meter.meter}>
								{formatMeterName(meter.meter)}
								<span className="text-xs text-muted-foreground ml-2">
									({unitLabel})
								</span>
							</Label>
							<Input
								id={meter.meter}
								type={inputConfig.type}
								min="0"
								step={inputConfig.step}
								value={meterInputs[meter.meter] || ""}
								onChange={(e) =>
									onMeterInputChange(meter.meter, e.target.value)
								}
								placeholder={inputConfig.placeholder}
							/>
						</div>
					);
				})}

				<div className="space-y-2 border-t pt-4">
					<Label htmlFor="request-multiplier">
						Number of Requests
						<span className="text-xs text-muted-foreground block mt-1">
							Multiply all meter values by this number
						</span>
					</Label>
					<Input
						id="request-multiplier"
						type="number"
						min="1"
						step="1"
						value={requestMultiplier}
						onChange={(e) =>
							onRequestMultiplierChange(parseInt(e.target.value, 10) || 1)
						}
						placeholder="1"
					/>
					<p className="text-xs text-muted-foreground">
						Example: 100 input tokens × 1000 requests = 100,000 total tokens
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
