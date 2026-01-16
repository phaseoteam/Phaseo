import { createLoader, parseAsString } from "nuqs/server";

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
};

export const loadPricingCalculatorSearchParams = createLoader(pricingCalculatorSearchParams);

export const modelParser = pricingCalculatorSearchParams.model;
export const endpointParser = pricingCalculatorSearchParams.endpoint;
export const providerParser = pricingCalculatorSearchParams.provider;
export const planParser = pricingCalculatorSearchParams.plan;
