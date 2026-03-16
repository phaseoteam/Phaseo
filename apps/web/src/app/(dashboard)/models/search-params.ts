import { createLoader, parseAsInteger, parseAsString } from "nuqs/server";

export const MODELS_SORT_OPTIONS = [
	"newest",
	"popular_week",
	"price_low_to_high",
	"price_high_to_low",
	"context_high_to_low",
	"throughput_high_to_low",
	"latency_low_to_high",
] as const;

export type ModelsSortOption = (typeof MODELS_SORT_OPTIONS)[number];

export const modelsSearchParams = {
	q: parseAsString
		.withDefault("")
		.withOptions({
			shallow: true,
			clearOnDefault: true,
		}),
	source: parseAsString
		.withDefault("hybrid")
		.withOptions({
			shallow: false,
			clearOnDefault: true,
		}),
	statuses: parseAsString
		.withDefault("")
		.withOptions({
			shallow: false,
			clearOnDefault: true,
		}),
	endpoints: parseAsString
		.withDefault("")
		.withOptions({
			shallow: false,
			clearOnDefault: true,
		}),
	inputModalities: parseAsString
		.withDefault("")
		.withOptions({
			shallow: false,
			clearOnDefault: true,
		}),
	outputModalities: parseAsString
		.withDefault("")
		.withOptions({
			shallow: false,
			clearOnDefault: true,
		}),
	features: parseAsString
		.withDefault("")
		.withOptions({
			shallow: false,
			clearOnDefault: true,
		}),
	year: parseAsInteger
		.withDefault(0)
		.withOptions({
			shallow: false,
			clearOnDefault: true,
		}),
	sort: parseAsString
		.withDefault("newest")
		.withOptions({
			shallow: true,
			clearOnDefault: true,
		}),
};

export const loadModelsSearchParams = createLoader(modelsSearchParams);

export const qParser = modelsSearchParams.q;
export const sourceParser = modelsSearchParams.source;
export const statusesParser = modelsSearchParams.statuses;
export const endpointsParser = modelsSearchParams.endpoints;
export const inputModalitiesParser = modelsSearchParams.inputModalities;
export const outputModalitiesParser = modelsSearchParams.outputModalities;
export const featuresParser = modelsSearchParams.features;
export const yearParser = modelsSearchParams.year;
export const sortParser = modelsSearchParams.sort;
