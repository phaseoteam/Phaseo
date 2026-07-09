"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock3 } from "lucide-react";
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
	pricingTimeUtc: string;
	onMeterInputChange: (meter: string, value: string) => void;
	onRequestMultiplierChange: (value: number) => void;
	onPricingTimeUtcChange: (value: string) => void;
}

export function UsageInputs({
	meters,
	meterInputs,
	requestMultiplier,
	pricingTimeUtc,
	onMeterInputChange,
	onRequestMultiplierChange,
	onPricingTimeUtcChange,
}: UsageInputsProps) {
	const uniqueMeters = useMemo(() => {
		const map = new Map<string, PricingMeter>();
		for (const meter of meters) {
			if (!map.has(meter.meter)) {
				map.set(meter.meter, meter);
			}
		}
		return Array.from(map.values());
	}, [meters]);

	const setCurrentUtcTime = () => {
		onPricingTimeUtcChange(new Date().toISOString().slice(11, 16));
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Usage Inputs</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{uniqueMeters.map((meter) => {
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
						Example: 100 input tokens x 1000 requests = 100,000 total tokens
					</p>
				</div>

				<div className="space-y-2 border-t pt-4">
					<Label htmlFor="pricing-time-utc">
						Pricing Time
						<span className="text-xs text-muted-foreground block mt-1">
							UTC time used for provider time-window prices
						</span>
					</Label>
					<div className="flex gap-2">
						<Input
							id="pricing-time-utc"
							type="time"
							step="60"
							value={pricingTimeUtc}
							onChange={(e) => onPricingTimeUtcChange(e.target.value)}
						/>
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={setCurrentUtcTime}
							aria-label="Use current UTC time"
							title="Use current UTC time"
						>
							<Clock3 className="h-4 w-4" />
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
