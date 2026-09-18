import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { STEALTH_PROVIDER_DISPLAY_NAME, STEALTH_PROVIDER_ID } from "@/models/provider-identity";

export type PricingSourceRow = Record<string, unknown>;
type Row = PricingSourceRow;

export const STEALTH_PROVIDER_IDENTITY = STEALTH_PROVIDER_ID;

export function publicPricingRouteIdentity(route: Row): Row {
	if (route.is_stealth !== true) return route;
	const modelId = String(route.model_slug ?? "").trim();
	return {
		...route,
		provider_slug: STEALTH_PROVIDER_IDENTITY,
		provider_model_slug: modelId || null,
	};
}

function publicProviderModelId(route: Row): string {
	return route.is_stealth === true
		? `${STEALTH_PROVIDER_IDENTITY}:${String(route.model_slug ?? "").trim()}`
		: id(route.provider_model_id);
}

export type ModelPricingSource = {
	providerRows: Row[];
	pricingRows: Row[];
};

const PROVIDER_FIELDS = "api_provider_name,provider_family_id,offer_label,offer_scope,colour,link,country_code,status,routing_status,residency_mode,default_execution_regions,default_data_regions,zero_data_retention,data_retention_days,residency_source_url,residency_notes,regional_pricing_mode,regional_pricing_uplift_percent,pricing_source_url,regional_pricing_notes,prompt_training_policy,prompt_training_notes,prompt_training_source_url,user_identifier_policy,user_identifier_notes,privacy_policy_url,terms_of_service_url";
const PROVIDER_MODEL_FIELDS = "provider_api_model_id,provider_id,api_model_id,model_id,provider_model_slug,is_active_gateway,routing_status,input_modalities,output_modalities,quantization_scheme,context_length,max_output_tokens,prompt_training_policy_override,prompt_training_override_notes,prompt_training_override_source_url,effective_from,effective_to,created_at,updated_at,data_api_provider_model_capabilities(capability_id,params,max_input_tokens,max_output_tokens,status)";
const POLICY_FIELDS = "data_policy_tier,data_policy_confidence,data_policy_contract_mode,data_policy_contract_notes";
const PRICING_FIELDS = "rule_id,model_key,capability_id,pricing_plan,meter,unit,unit_size,price_per_unit,currency,priority,effective_from,effective_to,note,match,billing_timestamp_basis,time_windows";
const PRICING_FIELDS_LEGACY = "rule_id,model_key,capability_id,pricing_plan,meter,unit,unit_size,price_per_unit,currency,priority,effective_from,effective_to,note,match";

function isMissingSchemaField(error: unknown, fields: string[]): boolean {
	if (!error || typeof error !== "object") return false;
	const record = error as { code?: string; message?: string };
	const text = String(record.message ?? "").toLowerCase();
	return (record.code === "42703" || record.code === "PGRST204" || text.includes("does not exist") || text.includes("schema cache"))
		&& fields.some((field) => text.includes(field.toLowerCase()));
}

function uniqueModelVariants(modelIds: string[]): string[] {
	return [...new Set(modelIds.flatMap((value) => {
		const modelId = value.trim();
		return modelId ? [modelId, `${modelId}-fast`, `${modelId}-flex`] : [];
	}))];
}

/**
 * Loads pricing sources for one or more canonical models with a fixed number of
 * database round trips. The caller can then compose each model independently
 * without repeating provider, capability, and rule queries per model.
 */
export async function fetchModelPricingSources(
	env: Env,
	modelIds: string[],
	includeInternal = false,
	includeExpiredPricing = false,
	pricingWindow?: { startMs: number; endMs: number },
): Promise<ModelPricingSource> {
	const variants = uniqueModelVariants(modelIds);
	if (variants.length === 0) return { providerRows: [], pricingRows: [] };
	const client = getDataClient(env);
	const routesResult = await client.from("v2_model_provider_routes")
		.select("provider_model_id,provider_slug,model_slug,provider_model_slug,is_stealth,status,routing_enabled,provider_availability_status,phaseo_status,access_scope,input_modalities,output_modalities,context_length,max_output_tokens,effective_from,effective_to,created_at,updated_at,metadata")
		.in("model_slug", variants);
	if (routesResult.error) throw routesResult.error;
	const routes = ((routesResult.data ?? []) as Row[]).filter(
		(route) => includeInternal || id(route.access_scope).toLowerCase() !== "internal",
	).map(publicPricingRouteIdentity);
	const routeIds = routes.map((row) => id(row.provider_model_id)).filter(Boolean);
	const providerIds = [...new Set(routes.map((row) => id(row.provider_slug)).filter(Boolean))];
	let skusQuery = client.from("v2_pricing_skus")
		.select("sku_id,provider_model_id,service_tier_slug,operation,status,currency,effective_from,effective_to,metadata")
		.in("provider_model_id", routeIds);
	if (pricingWindow) {
		skusQuery = skusQuery
			.lte("effective_from", new Date(pricingWindow.endMs).toISOString())
			.or(`effective_to.is.null,effective_to.gte.${new Date(pricingWindow.startMs).toISOString()}`);
	}
	const [capabilitiesResult, providersResult, skusResult] = await Promise.all([
		routeIds.length ? client.from("v2_route_capabilities").select("provider_model_id,capability_id,params,max_input_tokens,max_output_tokens,status,effective_from,effective_to,metadata").in("provider_model_id", routeIds) : Promise.resolve({ data: [], error: null }),
		providerIds.length ? client.from("v2_providers").select("provider_slug,name,provider_family_slug,offer_label,offer_scope,country_code,status,routing_enabled,residency_mode,default_execution_regions,default_data_regions,zero_data_retention,data_retention_days,prompt_training_policy,data_policy_tier,data_policy_confidence,data_policy_contract_mode,metadata").in("provider_slug", providerIds) : Promise.resolve({ data: [], error: null }),
		routeIds.length ? skusQuery : Promise.resolve({ data: [], error: null }),
	]);
	for (const result of [capabilitiesResult, providersResult, skusResult]) if (result.error) throw result.error;
	const skuIds = (skusResult.data ?? []).map((row) => id(row.sku_id)).filter(Boolean);
	const metersResult = skuIds.length
		? await client.from("v2_pricing_sku_meters").select("sku_meter_id,sku_id,meter_key,unit,unit_quantity,price_nanos,meter_order,metadata").in("sku_id", skuIds)
		: { data: [], error: null };
	if (metersResult.error) throw metersResult.error;
	const providerMap = new Map((providersResult.data ?? []).map((row) => [id(row.provider_slug), row as Row]));
	const capabilitiesByRoute = new Map<string, Row[]>();
	for (const capability of capabilitiesResult.data ?? []) {
		if (!includeInternal && id(capability.status).toLowerCase() === "internal_testing") continue;
		const routeId = id(capability.provider_model_id);
		capabilitiesByRoute.set(routeId, [...(capabilitiesByRoute.get(routeId) ?? []), capability as Row]);
	}
	const providerRows = routes.map((route) => {
		const provider = providerMap.get(id(route.provider_slug));
		const providerMetadata = asRow(provider?.metadata) ?? {};
		return {
			provider_api_model_id: publicProviderModelId(route),
			provider_id: route.provider_slug,
			api_model_id: route.model_slug,
			model_id: route.model_slug,
			provider_model_slug: route.provider_model_slug,
			is_active_gateway: Boolean(route.routing_enabled && ["active", "degraded"].includes(id(route.status))),
			routing_status: route.status,
			provider_availability_status: route.provider_availability_status,
			phaseo_status: route.phaseo_status,
			access_scope: route.access_scope ?? "public",
			input_modalities: route.input_modalities,
			output_modalities: route.output_modalities,
			context_length: route.context_length,
			max_output_tokens: route.max_output_tokens,
			effective_from: route.effective_from,
			effective_to: route.effective_to,
			created_at: route.created_at,
			updated_at: route.updated_at,
			data_api_provider_model_capabilities: (capabilitiesByRoute.get(id(route.provider_model_id)) ?? []).map((capability) => ({
				provider_model_id: capability.provider_model_id,
				capability_id: capability.capability_id,
				params: capability.params,
				max_input_tokens: capability.max_input_tokens,
				max_output_tokens: capability.max_output_tokens,
				status: capability.status,
				effective_from: capability.effective_from,
				effective_to: capability.effective_to,
				data_policy: asRow(capability.metadata)?.data_policy ?? null,
			})),
			data_api_providers: id(route.provider_slug) === STEALTH_PROVIDER_IDENTITY ? {
				api_provider_name: STEALTH_PROVIDER_DISPLAY_NAME,
				provider_family_id: STEALTH_PROVIDER_IDENTITY,
				offer_label: null,
				offer_scope: null,
				colour: null,
				link: null,
				country_code: null,
				status: route.status,
				routing_status: route.routing_enabled ? "active" : "disabled",
			} : provider ? {
				api_provider_name: provider.name,
				provider_family_id: provider.provider_family_slug,
				offer_label: provider.offer_label,
				offer_scope: provider.offer_scope,
				colour: providerMetadata.colour ?? null,
				link: providerMetadata.link ?? null,
				country_code: provider.country_code,
				status: provider.status,
				routing_status: provider.routing_enabled ? "active" : "disabled",
				residency_mode: provider.residency_mode,
				default_execution_regions: provider.default_execution_regions,
				default_data_regions: provider.default_data_regions,
				zero_data_retention: provider.zero_data_retention,
				data_retention_days: provider.data_retention_days,
				prompt_training_policy: provider.prompt_training_policy,
				prompt_training_notes: providerMetadata.prompt_training_notes ?? null,
				prompt_training_source_url: providerMetadata.prompt_training_source_url ?? null,
				data_policy_tier: provider.data_policy_tier,
				data_policy_confidence: provider.data_policy_confidence,
				data_policy_contract_mode: provider.data_policy_contract_mode,
				data_policy_contract_notes: providerMetadata.data_policy_contract_notes ?? null,
				service_tier_data_policies: providerMetadata.service_tier_data_policies ?? null,
				residency_source_url: providerMetadata.residency_source_url ?? null,
				residency_notes: providerMetadata.residency_notes ?? null,
				privacy_policy_url: providerMetadata.privacy_policy_url ?? null,
				terms_of_service_url: providerMetadata.terms_of_service_url ?? null,
			} : null,
		};
	});
	const skuMap = new Map((skusResult.data ?? []).map((row) => [id(row.sku_id), row as Row]));
	const now = Date.now();
	const routeMap = new Map(routes.map((row) => [id(row.provider_model_id), row]));
	const pricingRows = (metersResult.data ?? []).flatMap((meter) => {
		const sku = skuMap.get(id(meter.sku_id));
		const route = sku ? routeMap.get(id(sku.provider_model_id)) : null;
		if (!sku || !route || id(sku.status) === "disabled") return [];
		const effectiveTo = sku.effective_to ? Date.parse(String(sku.effective_to)) : Number.POSITIVE_INFINITY;
		if (!includeExpiredPricing && now >= effectiveTo) return [];
		const priceNanos = Number(meter.price_nanos);
		if (!Number.isFinite(priceNanos)) return [];
		return [{
			rule_id: meter.sku_meter_id,
			model_key: `${id(route.provider_slug)}:${id(route.model_slug)}:${id(sku.operation) || "inference"}`,
			capability_id: sku.operation,
			pricing_plan: sku.service_tier_slug ?? "standard",
			meter: meter.meter_key,
			unit: meter.unit,
			unit_size: Number(meter.unit_quantity ?? 1),
			price_per_unit: priceNanos / 1_000_000_000,
			currency: sku.currency ?? "USD",
			priority: Number((asRow(meter.metadata) ?? {}).priority ?? meter.meter_order ?? 100),
			effective_from: sku.effective_from,
			effective_to: sku.effective_to,
			note: null,
			match: [],
			billing_timestamp_basis: (asRow(sku.metadata) ?? {}).billing_timestamp_basis ?? "request_start",
			time_windows: (asRow(sku.metadata) ?? {}).time_windows ?? [],
		}];
	});
	return { providerRows, pricingRows };
}

function id(value: unknown): string {
	return String(value ?? "").trim();
}

function asRow(value: unknown): Row | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}

function relation(value: unknown): Row | null {
	return asRow(Array.isArray(value) ? value[0] : value);
}

function rows(value: unknown): Row[] {
	return Array.isArray(value) ? value.map(asRow).filter((row): row is Row => row !== null) : [];
}

function normalizePlan(value: unknown, modelKey: string, note: unknown): string {
	const plan = id(value).toLowerCase();
	const first = modelKey.indexOf(":");
	const last = modelKey.lastIndexOf(":");
	const modelId = first >= 0 && last > first ? modelKey.slice(first + 1, last).toLowerCase() : "";
	const normalizedNote = id(note).toLowerCase();
	const free = modelId.endsWith(":free") || modelId.endsWith("-free") || normalizedNote === "free" || normalizedNote.startsWith("free ");
	return !plan ? free ? "free" : "standard" : plan === "standard" && free ? "free" : plan;
}

function providerInfo(providerId: string, provider: Row | null) {
	return {
		api_provider_id: providerId,
		api_provider_name: id(provider?.api_provider_name) || providerId,
		provider_family_id: id(provider?.provider_family_id) || providerId,
		offer_label: provider?.offer_label ?? null,
		offer_scope: provider?.offer_scope ?? "global",
		colour: provider?.colour ?? null,
		link: provider?.link ?? null,
		country_code: provider?.country_code ?? null,
		status: provider?.status ?? null,
		routing_status: provider?.routing_status ?? null,
		residency_mode: provider?.residency_mode ?? null,
		default_execution_regions: Array.isArray(provider?.default_execution_regions) ? provider.default_execution_regions : null,
		default_data_regions: Array.isArray(provider?.default_data_regions) ? provider.default_data_regions : null,
		zero_data_retention: provider?.zero_data_retention ?? null,
		data_retention_days: provider?.data_retention_days ?? null,
		residency_source_url: provider?.residency_source_url ?? null,
		residency_notes: provider?.residency_notes ?? null,
		regional_pricing_mode: provider?.regional_pricing_mode ?? null,
		regional_pricing_uplift_percent: provider?.regional_pricing_uplift_percent ?? null,
		pricing_source_url: provider?.pricing_source_url ?? null,
		regional_pricing_notes: provider?.regional_pricing_notes ?? null,
		prompt_training_policy: provider?.prompt_training_policy ?? null,
		prompt_training_notes: provider?.prompt_training_notes ?? null,
		prompt_training_source_url: provider?.prompt_training_source_url ?? null,
		data_policy_tier: provider?.data_policy_tier ?? null,
		data_policy_confidence: provider?.data_policy_confidence ?? null,
		data_policy_contract_mode: provider?.data_policy_contract_mode ?? null,
		data_policy_contract_notes: provider?.data_policy_contract_notes ?? null,
		service_tier_data_policies: provider?.service_tier_data_policies ?? null,
		user_identifier_policy: provider?.user_identifier_policy ?? null,
		user_identifier_notes: provider?.user_identifier_notes ?? null,
		privacy_policy_url: provider?.privacy_policy_url ?? null,
		terms_of_service_url: provider?.terms_of_service_url ?? null,
	};
}

function providerModel(row: Row, capability: Row | null) {
	return {
		id: id(row.provider_api_model_id),
		api_provider_id: id(row.provider_id),
		provider_model_slug: row.provider_model_slug ?? null,
		model_id: id(row.api_model_id),
		endpoint: capability ? id(capability.capability_id) : "unmapped",
		capability_status: capability?.status ?? null,
		routing_status: row.routing_status ?? null,
		provider_availability_status: row.provider_availability_status ?? null,
		phaseo_status: row.phaseo_status ?? null,
		access_scope: row.access_scope ?? "public",
		is_active_gateway: Boolean(row.is_active_gateway),
		input_modalities: Array.isArray(row.input_modalities) ? row.input_modalities.map(id).filter(Boolean).join(",") : id(row.input_modalities),
		output_modalities: Array.isArray(row.output_modalities) ? row.output_modalities.map(id).filter(Boolean).join(",") : id(row.output_modalities),
		effective_from: row.effective_from ?? null,
		effective_to: row.effective_to ?? null,
		created_at: row.created_at ?? null,
		updated_at: row.updated_at ?? null,
		params: capability?.params ?? null,
		quantization_scheme: id(row.quantization_scheme)?.toUpperCase() || null,
		context_length: row.context_length ?? null,
		prompt_training_policy_override: row.prompt_training_policy_override ?? null,
		prompt_training_override_notes: row.prompt_training_override_notes ?? null,
		prompt_training_override_source_url: row.prompt_training_override_source_url ?? null,
		max_input_tokens: capability?.max_input_tokens ?? null,
		max_output_tokens: capability?.max_output_tokens ?? row.max_output_tokens ?? null,
		data_policy: capability?.data_policy ?? null,
	};
}

export function composeModelPricing(providerRows: Row[], pricingRows: Row[]) {
	const providers = new Map<string, { provider: ReturnType<typeof providerInfo>; provider_models: Array<ReturnType<typeof providerModel>>; pricing_rules: Row[] }>();
	for (const row of providerRows) {
		const providerId = id(row.provider_id);
		const apiModelId = id(row.api_model_id);
		if (!providerId || !apiModelId) continue;
		const provider = relation(row.data_api_providers);
		const entry = providers.get(providerId) ?? { provider: providerInfo(providerId, provider), provider_models: [], pricing_rules: [] };
		const capabilities = rows(row.data_api_provider_model_capabilities).filter((capability) => id(capability.status).toLowerCase() !== "internal_testing");
		if (rows(row.data_api_provider_model_capabilities).length > 0 && capabilities.length === 0) continue;
		if (capabilities.length === 0) entry.provider_models.push(providerModel(row, null));
		else for (const capability of capabilities) if (id(capability.capability_id)) entry.provider_models.push(providerModel(row, capability));
		providers.set(providerId, entry);
	}
	const exactProvider = new Map<string, string>();
	const prefixProvider = new Map<string, string>();
	for (const [providerId, entry] of providers) for (const model of entry.provider_models) {
		const key = `${model.api_provider_id}:${model.model_id}:${model.endpoint}`;
		exactProvider.set(key, providerId);
		prefixProvider.set(`${model.api_provider_id}:${model.model_id}:`, providerId);
	}
	const now = Date.now();
	const dedupedRules = new Map<string, Row>();
	for (const row of pricingRows) {
		const to = row.effective_to ? Date.parse(String(row.effective_to)) : Number.POSITIVE_INFINITY;
		if (now >= to) continue;
		const ruleId = id(row.rule_id);
		const modelKey = id(row.model_key);
		if (!ruleId || !modelKey) continue;
		dedupedRules.set(ruleId, {
			id: ruleId,
			model_key: modelKey,
			pricing_plan: normalizePlan(row.pricing_plan, modelKey, row.note),
			meter: id(row.meter),
			unit: id(row.unit) || "token",
			unit_size: Number(row.unit_size ?? 1),
			price_per_unit: Number(row.price_per_unit),
			currency: id(row.currency) || "USD",
			note: row.note ?? null,
			match: Array.isArray(row.match) ? row.match : [],
			priority: Number(row.priority ?? 100),
			effective_from: row.effective_from ?? null,
			effective_to: row.effective_to ?? null,
			billing_timestamp_basis: row.billing_timestamp_basis ?? "request_start",
			time_windows: Array.isArray(row.time_windows) ? row.time_windows : [],
		});
	}
	for (const rule of dedupedRules.values()) {
		const modelKey = id(rule.model_key);
		const last = modelKey.lastIndexOf(":");
		const providerId = exactProvider.get(modelKey) ?? (last > 0 ? prefixProvider.get(`${modelKey.slice(0, last)}:`) : undefined);
		if (providerId) providers.get(providerId)?.pricing_rules.push(rule);
	}
	return [...providers.values()].filter((entry) => entry.provider_models.length > 0).sort((left, right) => left.provider.api_provider_name.localeCompare(right.provider.api_provider_name));
}
