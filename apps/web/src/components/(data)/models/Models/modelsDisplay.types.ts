import type { ModelCard } from "@/lib/fetchers/models/getAllModels";

export type GatewayStatusFilter = "active" | "coming_soon" | "not_active";

export type OptionCount = {
	value: string;
	count: number;
};

export type ModelsFilterFacets = {
	statusCounts: Record<GatewayStatusFilter, number>;
	endpointOptions: OptionCount[];
	inputModalityOptions: OptionCount[];
	outputModalityOptions: OptionCount[];
	featureOptions: OptionCount[];
	supportedParameterOptions: OptionCount[];
	providerOptions: OptionCount[];
	creatorOptions: OptionCount[];
	yearOptions: OptionCount[];
};

export type ModelsPageModel = Pick<
	ModelCard,
	| "model_id"
	| "name"
	| "organisation_id"
	| "organisation_name"
	| "organisation_colour"
	| "primary_date"
	| "primary_timestamp"
	| "primary_group_key"
	| "gateway_status"
	| "gateway_provider_count"
	| "gateway_active_provider_count"
	| "gateway_endpoints"
	| "gateway_input_modalities"
	| "gateway_output_modalities"
	| "gateway_features"
	| "gateway_provider_names"
	| "gateway_active_provider_names"
	| "gateway_provider_details"
	| "gateway_api_model_ids"
	| "context_lengths"
	| "supported_parameters"
	| "lowest_input_price"
	| "lowest_output_price"
	| "lowest_standard_input_price"
	| "lowest_standard_output_price"
	| "lowest_standard_input_price_label"
	| "lowest_standard_input_price_unit"
	| "lowest_standard_output_price_label"
	| "lowest_standard_output_price_unit"
	| "lowest_from_price"
	| "lowest_from_price_unit"
	| "popularity_tokens_week"
	| "throughput_week"
	| "latency_week"
>;
