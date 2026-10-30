import {
	resolvePricingMeterPrice,
	type PricingMeter,
} from "@/components/(data)/model/pricing/pricingHelpers";

export type BlendedRate = {
	blendedPer1M: number;
	cacheHitPer1M: number;
	inputPer1M: number;
	outputPer1M: number;
	usesInputForCache: boolean;
};

function pricePerMillion(meter: PricingMeter, pricingTimeUtc: string): number {
	return (
		(resolvePricingMeterPrice(meter, pricingTimeUtc).pricePerUnit /
			(meter.unit_size || 1)) * 1_000_000
	);
}

export function calculateArtificialAnalysisBlendedRate(
	meters: PricingMeter[],
	pricingTimeUtc: string
): BlendedRate | null {
	const inputMeter = meters.find((meter) => {
		const name = meter.meter.toLowerCase();
		return name.includes("input") && name.includes("token") && !name.includes("cache");
	});
	const outputMeter = meters.find((meter) => {
		const name = meter.meter.toLowerCase();
		return name.includes("output") && name.includes("token");
	});
	if (!inputMeter || !outputMeter) return null;

	const cacheHitMeter = meters.find((meter) => {
		const name = meter.meter.toLowerCase();
		const isCacheRead =
			(name.includes("cache") && (name.includes("read") || name.includes("hit"))) ||
			name.includes("cached_input");
		return isCacheRead && name.includes("token") && !name.includes("write");
	});
	const inputPer1M = pricePerMillion(inputMeter, pricingTimeUtc);
	const outputPer1M = pricePerMillion(outputMeter, pricingTimeUtc);
	const cacheHitPer1M = cacheHitMeter
		? pricePerMillion(cacheHitMeter, pricingTimeUtc)
		: inputPer1M;

	return {
		inputPer1M,
		outputPer1M,
		cacheHitPer1M,
		usesInputForCache: !cacheHitMeter,
		blendedPer1M: cacheHitPer1M * 0.7 + inputPer1M * 0.2 + outputPer1M * 0.1,
	};
}
