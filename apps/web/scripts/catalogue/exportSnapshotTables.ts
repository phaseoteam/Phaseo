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

export type PublicCatalogTableName = keyof typeof PUBLIC_CATALOG_TABLES;

export const PUBLIC_CATALOG_TABLE_NAMES = Object.keys(PUBLIC_CATALOG_TABLES) as PublicCatalogTableName[];
