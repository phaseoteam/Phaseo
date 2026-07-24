export interface ModelAvailabilityItem {
	id: string;
	api_provider_id: string;
	api_model_id: string;
	provider_model_slug: string | null;
	endpoint: string;
	is_active_gateway: boolean;
	input_modalities: string;
	output_modalities: string;
	effective_from: string | null;
	effective_to: string | null;
	created_at: string;
	updated_at: string;
	key: string;
	params: unknown;
	max_input_tokens: number | null;
	max_output_tokens: number | null;
	provider: {
		api_provider_id: string;
		api_provider_name: string;
		country_code: string | null;
	};
}
