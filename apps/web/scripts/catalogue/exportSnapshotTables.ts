export const PUBLIC_CATALOG_DOMAINS = {
	aliases: ["v2_model_aliases"],
	api_providers: [
		"v2_providers",
		"v2_provider_regions",
		"v2_model_provider_routes",
		"v2_route_capabilities",
		"v2_service_tiers",
		"v2_route_variants",
	],
	benchmarks: ["v2_benchmarks", "v2_benchmark_results"],
	families: ["v2_model_families"],
	models: ["v2_models", "v2_model_links", "v2_model_details", "v2_model_page_notices"],
	organisations: ["v2_labs", "v2_lab_links"],
	pricing: ["v2_meter_definitions", "v2_pricing_skus", "v2_pricing_sku_meters"],
	subscription_plans: ["v2_subscription_plans", "v2_subscription_plan_models", "v2_subscription_plan_features"],
} as const;

export const PUBLIC_CATALOG_TABLES = {
	v2_labs: ["lab_slug"],
	v2_models: ["model_slug"],
	v2_model_families: ["family_slug"],
	v2_lab_links: ["lab_slug", "platform", "url"],
	v2_providers: ["provider_slug"],
	v2_provider_regions: ["provider_region_id"],
	v2_model_provider_routes: ["provider_model_id"],
	v2_route_capabilities: ["provider_model_id", "capability_id"],
	v2_service_tiers: ["service_tier_slug"],
	v2_route_variants: ["variant_id"],
	v2_meter_definitions: ["meter_key"],
	v2_pricing_skus: ["sku_id"],
	v2_pricing_sku_meters: ["sku_meter_id"],
	v2_benchmarks: ["benchmark_id"],
	v2_benchmark_results: ["result_id"],
	v2_model_aliases: ["alias_slug"],
	v2_model_links: ["model_slug", "link_kind", "url"],
	v2_model_details: ["model_slug", "detail_name"],
	v2_model_page_notices: ["model_slug"],
	v2_subscription_plans: ["plan_uuid"],
	v2_subscription_plan_models: ["plan_uuid", "model_slug"],
	v2_subscription_plan_features: ["plan_uuid", "feature_name"],
} as const;

// Keep the export contract explicit. These are the catalogue fields needed to
// reconstruct public data and its relationships; database-managed audit
// columns are intentionally not part of the snapshot.
export const PUBLIC_CATALOG_TABLE_COLUMNS = {
	v2_labs: ["lab_slug", "name", "country_code", "description", "status", "routable", "metadata", "colour", "subdivision_code"],
	v2_models: [
		"model_slug", "lab_slug", "name", "description", "status", "catalogue_status", "hidden",
		"input_modalities", "output_modalities", "family_slug", "base_model_slug", "variant_kind",
		"announced_at", "released_at", "deprecated_at", "retired_at", "removal_date", "previous_model_slug",
		"replacement_model_slug", "license", "license_url", "metadata",
	],
	v2_model_families: ["family_slug", "lab_slug", "name", "metadata"],
	v2_lab_links: ["lab_slug", "platform", "url"],
	v2_providers: [
		"provider_slug", "lab_slug", "name", "status", "routing_enabled", "routable", "country_code",
		"subdivision_code", "base_url", "credential_mode", "byok_available", "zero_data_retention",
		"residency_mode", "default_execution_regions", "default_data_regions", "data_retention_days",
		"data_policy_confidence", "data_policy_contract_mode", "data_policy_tier", "data_policy_variant",
		"prompt_training_policy", "offer_label", "offer_scope", "provider_family_slug", "metadata",
		"stream_cancellation_evidence_kind", "stream_cancellation_source_url", "stream_cancellation_stops_provider_billing",
		"stream_cancellation_support", "stream_cancellation_usage_recovery", "stream_cancellation_verified_at",
	],
	v2_provider_regions: [
		"provider_region_id", "provider_slug", "region_code", "display_name", "execution_supported",
		"data_residency_supported", "status", "routing_enabled", "metadata",
	],
	v2_model_provider_routes: [
		"provider_model_id", "model_slug", "provider_slug", "provider_model_slug", "status", "routing_enabled",
		"input_modalities", "output_modalities", "regions", "context_length", "max_output_tokens",
		"effective_from", "effective_to", "access_scope", "credential_mode", "provider_availability_status",
		"phaseo_status", "metadata",
	],
	v2_route_capabilities: [
		"provider_model_id", "capability_id", "status", "max_input_tokens", "max_output_tokens", "params",
		"effective_from", "effective_to", "metadata",
	],
	v2_service_tiers: ["service_tier_slug", "display_name", "description", "status", "metadata"],
	v2_route_variants: [
		"variant_id", "provider_model_id", "variant_key", "provider_region_id", "execution_region", "data_region",
		"service_tier_slug", "status", "routing_enabled", "endpoint_label", "metadata",
	],
	v2_meter_definitions: [
		"meter_key", "modality", "direction", "unit", "default_unit_quantity", "display_name", "description", "status", "metadata",
	],
	v2_pricing_skus: [
		"sku_id", "provider_model_id", "sku_code", "version", "operation", "status", "region", "display_name",
		"description", "currency", "effective_from", "effective_to", "service_tier_slug", "route_variant_id", "metadata",
	],
	v2_pricing_sku_meters: [
		"sku_meter_id", "sku_id", "meter_key", "modality", "direction", "unit", "unit_quantity", "price_nanos",
		"display_label", "display_unit", "billable", "meter_order", "metadata",
	],
	v2_benchmarks: ["benchmark_id", "benchmark_type", "category", "name", "link", "ascending_order", "total_models"],
	v2_benchmark_results: [
		"result_id", "benchmark_id", "model_slug", "result_key", "score", "score_numeric", "rank", "occur_idx",
		"variant", "source_link", "other_info", "is_self_reported", "effective_to",
	],
	v2_model_aliases: ["alias_slug", "model_slug", "alias_type", "enabled", "effective_from", "effective_to", "metadata"],
	v2_model_links: ["model_slug", "link_kind", "title", "url", "metadata"],
	v2_model_details: ["model_slug", "detail_name", "detail_value", "detail_order"],
	v2_model_page_notices: ["model_slug", "markdown", "tone"],
	v2_subscription_plans: ["plan_uuid", "plan_id", "lab_slug", "name", "description", "frequency", "price", "currency", "link", "other_info", "effective_to"],
	v2_subscription_plan_models: ["plan_uuid", "model_slug", "model_info", "rate_limit", "other_info", "effective_to"],
	v2_subscription_plan_features: ["plan_uuid", "feature_name", "feature_description", "feature_value", "other_info", "effective_to"],
} as const satisfies Record<PublicCatalogTableName, readonly string[]>;

// These fields are fetched only so the exporter can enforce privacy rules;
// the sanitizer removes them before any snapshot is written.
export const INTERNAL_CATALOG_FILTER_COLUMNS = {
	v2_model_provider_routes: ["is_stealth"],
} as const satisfies Partial<Record<PublicCatalogTableName, readonly string[]>>;

export type PublicCatalogTableName = keyof typeof PUBLIC_CATALOG_TABLES;

export const PUBLIC_CATALOG_TABLE_NAMES = Object.keys(PUBLIC_CATALOG_TABLES) as PublicCatalogTableName[];
