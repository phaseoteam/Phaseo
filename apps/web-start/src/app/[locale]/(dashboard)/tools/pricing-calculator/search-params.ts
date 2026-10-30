import {
	createLoader,
	parseAsArrayOf,
	parseAsInteger,
	parseAsJson,
	parseAsString,
} from "nuqs/server";

type CalculatorModelConfig = {
	endpoint: string;
	provider: string;
	pricingPlan: string;
};

type CalculatorModelSelection = {
	id: string;
	modelId: string;
};

export const pricingCalculatorSearchParams = {
	model: parseAsString.withDefault("").withOptions({
		shallow: true,
		clearOnDefault: true,
	}),
	endpoint: parseAsString.withDefault("").withOptions({
		shallow: true,
		clearOnDefault: true,
	}),
	provider: parseAsString.withDefault("").withOptions({
		shallow: true,
		clearOnDefault: true,
	}),
	plan: parseAsString.withDefault("").withOptions({
		shallow: true,
		clearOnDefault: true,
	}),
	models: parseAsArrayOf(parseAsString).withDefault([]).withOptions({
		shallow: true,
		clearOnDefault: true,
	}),
	selections: parseAsJson<CalculatorModelSelection[]>((value) =>
		Array.isArray(value) ? value as CalculatorModelSelection[] : null
	).withDefault([]).withOptions({
		shallow: true,
		clearOnDefault: true,
	}),
	configs: parseAsJson<Record<string, CalculatorModelConfig>>((value) =>
		value && typeof value === "object" && !Array.isArray(value)
			? value as Record<string, CalculatorModelConfig>
			: null
	).withDefault({}).withOptions({
		shallow: true,
		clearOnDefault: true,
	}),
	usage: parseAsJson<Record<string, string>>((value) =>
		value && typeof value === "object" && !Array.isArray(value)
			? value as Record<string, string>
			: null
	).withDefault({}).withOptions({
		shallow: true,
		clearOnDefault: true,
	}),
	requests: parseAsInteger.withDefault(1).withOptions({
		shallow: true,
		clearOnDefault: true,
	}),
	time: parseAsString.withDefault("").withOptions({
		shallow: true,
		clearOnDefault: true,
	}),
};

export const loadPricingCalculatorSearchParams = createLoader(pricingCalculatorSearchParams);

export const modelParser = pricingCalculatorSearchParams.model;
export const endpointParser = pricingCalculatorSearchParams.endpoint;
export const providerParser = pricingCalculatorSearchParams.provider;
export const planParser = pricingCalculatorSearchParams.plan;
