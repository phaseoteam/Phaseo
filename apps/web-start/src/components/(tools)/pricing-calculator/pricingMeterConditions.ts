import type { PricingMeter } from "@/components/(data)/model/pricing/pricingHelpers";

type PricingMeterCondition = {
	path?: unknown;
	op?: unknown;
	value?: unknown;
	or_group?: unknown;
};

export type PricingContextTier = {
	key: string;
	label: string;
	detail: string;
	labelKey: "publishedRate" | "standardContext" | "longContext" | "contextTier";
	detailKey: "noContextPriceChange" | "upToInputTokens" | "overInputTokens" | "inputTokenRange";
	labelIndex?: number;
	lowerTokenCount?: string;
	upperTokenCount?: string;
	inputTokens: number;
	meters: PricingMeter[];
};

function compactTokenCount(value: number): string {
	if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(2))}M`;
	if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
	return value.toLocaleString();
}

function inputTokenThresholds(meters: PricingMeter[]): number[] {
	const thresholds = new Set<number>();
	for (const meter of meters) {
		for (const condition of Array.isArray(meter.conditions) ? meter.conditions : []) {
			const candidate = condition as PricingMeterCondition;
			if (candidate.path !== "input_tokens") continue;
			if (!["gt", "gte", "lt", "lte"].includes(String(candidate.op))) continue;
			const value = Number(candidate.value);
			if (Number.isFinite(value) && value > 0) thresholds.add(value);
		}
	}
	return [...thresholds].toSorted((a, b) => a - b);
}

function meterRateSignature(meters: PricingMeter[]): string {
	return meters
		.map((meter) => `${meter.meter}:${meter.unit}:${meter.currency}:${meter.unit_size}:${meter.price_per_unit}`)
		.toSorted()
		.join("|");
}

function numericUsageValue(
	usage: Record<string, string | number | undefined>,
	path: string,
): number {
	const direct = Number(usage[path] ?? 0);
	if (path !== "input_tokens" && path !== "output_tokens") {
		return Number.isFinite(direct) ? direct : 0;
	}
	if (usage[path] !== undefined && Number.isFinite(direct)) return direct;

	const tokenDirection = path === "input_tokens" ? "input" : "output";
	return Object.entries(usage).reduce((total, [meter, rawValue]) => {
		const isDirectionalMeter = meter.includes(`${tokenDirection}_`) && meter.endsWith("_tokens");
		const isInputCacheMeter = tokenDirection === "input" &&
			meter.startsWith("cached_") && meter.endsWith("_tokens");
		if (!isDirectionalMeter && !isInputCacheMeter) return total;
		const value = Number(rawValue ?? 0);
		return total + (Number.isFinite(value) ? Math.max(0, value) : 0);
	}, 0);
}

function conditionMatches(
	condition: PricingMeterCondition,
	usage: Record<string, string | number | undefined>,
): boolean {
	const path = typeof condition.path === "string" ? condition.path : "";
	if (!path) return false;
	if (condition.op === "eq" || condition.op === "neq") {
		const actual = usage[path];
		if (actual === undefined) return false;
		const matches = String(actual) === String(condition.value);
		return condition.op === "eq" ? matches : !matches;
	}
	const expected = Number(condition.value);
	if (!Number.isFinite(expected)) return false;
	const actual = numericUsageValue(usage, path);
	switch (condition.op) {
		case "gt": return actual > expected;
		case "gte": return actual >= expected;
		case "lt": return actual < expected;
		case "lte": return actual <= expected;
		default: return false;
	}
}

function meterConditionsMatch(
	meter: PricingMeter,
	usage: Record<string, string | number | undefined>,
): boolean {
	const conditions = Array.isArray(meter.conditions)
		? meter.conditions as PricingMeterCondition[]
		: [];
	if (conditions.length === 0) return true;
	const groups = new Map<string, PricingMeterCondition[]>();
	for (const condition of conditions) {
		const key = String(condition.or_group ?? "default");
		const group = groups.get(key) ?? [];
		group.push(condition);
		groups.set(key, group);
	}
	return [...groups.values()].some((group) =>
		group.every((condition) => conditionMatches(condition, usage))
	);
}

export function selectPricingMetersForUsage(
	meters: PricingMeter[],
	usage: Record<string, string | number | undefined>,
): PricingMeter[] {
	const grouped = new Map<string, PricingMeter[]>();
	for (const meter of meters) {
		const key = `${meter.meter}:${meter.unit}:${meter.currency}`;
		const group = grouped.get(key) ?? [];
		group.push(meter);
		grouped.set(key, group);
	}

	return [...grouped.values()].map((candidates) => {
		const matching = candidates.filter((meter) => meterConditionsMatch(meter, usage));
		return matching.toSorted((a, b) => {
			const conditionDifference = (b.conditions?.length ?? 0) - (a.conditions?.length ?? 0);
			if (conditionDifference !== 0) return conditionDifference;
			const aRate = Number(a.price_per_unit) / (Number(a.unit_size) || 1);
			const bRate = Number(b.price_per_unit) / (Number(b.unit_size) || 1);
			return aRate - bRate;
		})[0];
	}).filter((meter): meter is PricingMeter => Boolean(meter));
}

export function getPricingContextTiers(meters: PricingMeter[]): PricingContextTier[] {
	const thresholds = inputTokenThresholds(meters);
	const standardMeters = selectPricingMetersForUsage(meters, { input_tokens: 0 });
	if (thresholds.length === 0) {
		return [{
			key: "current",
			label: "Published rate",
			detail: "No context-based price change",
			labelKey: "publishedRate",
			detailKey: "noContextPriceChange",
			inputTokens: 0,
			meters: standardMeters,
		}];
	}

	const samples = [0, ...thresholds.map((threshold) => threshold + 1)];
	const tiers = samples.map((inputTokens, index): PricingContextTier => {
		const lowerThreshold = index > 0 ? thresholds[index - 1] : null;
		const upperThreshold = thresholds[index] ?? null;
		const detail = lowerThreshold === null
			? `Up to ${compactTokenCount(upperThreshold ?? 0)} input tokens`
			: upperThreshold === null
				? `Over ${compactTokenCount(lowerThreshold)} input tokens`
				: `${compactTokenCount(lowerThreshold)} to ${compactTokenCount(upperThreshold)} input tokens`;
		return {
			key: index === 0 ? "standard-context" : `context-${inputTokens}`,
			label: index === 0 ? "Standard context" : index === samples.length - 1 ? "Long context" : `Context tier ${index + 1}`,
			detail,
			labelKey: index === 0 ? "standardContext" : index === samples.length - 1 ? "longContext" : "contextTier",
			detailKey: lowerThreshold === null ? "upToInputTokens" : upperThreshold === null ? "overInputTokens" : "inputTokenRange",
			labelIndex: index + 1,
			...(lowerThreshold !== null ? { lowerTokenCount: compactTokenCount(lowerThreshold) } : {}),
			...(upperThreshold !== null ? { upperTokenCount: compactTokenCount(upperThreshold) } : {}),
			inputTokens,
			meters: selectPricingMetersForUsage(meters, { input_tokens: inputTokens }),
		};
	});

	return tiers.filter((tier, index) =>
		index === 0 || meterRateSignature(tier.meters) !== meterRateSignature(tiers[index - 1].meters)
	);
}
