// Copied from pricing/deepseek/deepseek-deepseek-v4-pro/text.generate/pricing.json (source/note metadata dropped).
export const deepSeekV4ProCard = {
	key: "deepseek:deepseek/deepseek-v4-pro:text.generate",
	api_provider_id: "deepseek",
	provider_slug: "deepseek",
	api_model_id: "deepseek/deepseek-v4-pro",
	capability_id: "text.generate",
	rules: [
		{"meter":"input_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":0.435,"currency":"USD","pricing_plan":"standard","match":[],"priority":200,"effective_from":"2026-04-24T00:00:00Z","effective_to":"2026-05-31T15:59:00Z","region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"cached_read_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":0.003625,"currency":"USD","pricing_plan":"standard","match":[],"priority":200,"effective_from":"2026-04-24T00:00:00Z","effective_to":"2026-05-31T15:59:00Z","region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"output_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":0.87,"currency":"USD","pricing_plan":"standard","match":[],"priority":200,"effective_from":"2026-04-24T00:00:00Z","effective_to":"2026-05-31T15:59:00Z","region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"input_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":1.74,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"effective_from":"2026-04-24T00:00:00Z","effective_to":"2026-05-31T15:59:00Z","region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"cached_read_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":0.0145,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"effective_from":"2026-04-24T00:00:00Z","effective_to":"2026-05-31T15:59:00Z","region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"output_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":3.48,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"effective_from":"2026-04-24T00:00:00Z","effective_to":"2026-05-31T15:59:00Z","region":null,"cache_duration_seconds":null,"conditions":[]},
		{"meter":"input_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":0.435,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"billing_timestamp_basis":"provider_accept","effective_from":"2026-05-31T15:59:00Z","region":null,"cache_duration_seconds":null,"conditions":[],"effective_to":"2026-08-13T00:00:00Z"},
		{"meter":"cached_read_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":0.003625,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"billing_timestamp_basis":"provider_accept","effective_from":"2026-05-31T15:59:00Z","region":null,"cache_duration_seconds":null,"conditions":[],"effective_to":"2026-08-13T00:00:00Z"},
		{"meter":"output_text_tokens","unit":"token","unit_size":1000000,"price_per_unit":0.87,"currency":"USD","pricing_plan":"standard","match":[],"priority":100,"billing_timestamp_basis":"provider_accept","effective_from":"2026-05-31T15:59:00Z","region":null,"cache_duration_seconds":null,"conditions":[],"effective_to":"2026-08-13T00:00:00Z"},
	],
};
