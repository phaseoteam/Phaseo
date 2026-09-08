import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { publicProviderDisplayName, publicProviderPayload } from "@/models/provider-identity";

type Row = Record<string, unknown>;

export type GatewayMetadataSource = {
	providerModels: Row[];
	caps: Row[];
	providers: Row[];
	aliases: Array<{ api_model_id: string; alias_slug: string }>;
};

const CAPABILITY_ENDPOINTS: Record<string, string[]> = {
	"text.generate": ["chat.completions", "responses", "messages"],
	"text.embed": ["embeddings"],
	"image.generate": ["images.generations"],
	"images.generate": ["images.generations"],
	"image.edit": ["images.edits"],
	"images.edits": ["images.edits"],
	"image.vary": ["images.variations"],
	"audio.transcribe": ["audio.transcriptions"],
	"audio.transcription": ["audio.transcriptions"],
	"audio.translate": ["audio.translations"],
	"audio.translation": ["audio.translations"],
	"audio.translations": ["audio.translations"],
	"audio.speech": ["audio.speech"],
	"audio.realtime": ["audio.realtime"],
	realtime: ["audio.realtime"],
	moderation: ["moderations"],
	"moderations.create": ["moderations"],
	"text.moderate": ["moderations"],
	batch: ["batches"],
	"batch.create": ["batches"],
	"music.generate": ["music.generations"],
	"video.generations": ["video.generations"],
	ocr: ["ocr"],
};

const IGNORED_PARAMETER_KEYS = new Set(["type", "title", "description", "default", "minimum", "maximum", "enum", "oneof", "anyof", "allof", "items", "properties", "required", "nullable", "additionalproperties", "$schema", "$id", "strict", "param_id", "provider_min", "provider_max", "provider_default", "notes", "capability_id", "status"]);

function id(value: unknown): string | null {
	const normalized = String(value ?? "").trim();
	return normalized || null;
}

function status(value: unknown): string | null {
	return id(value)?.toLowerCase().replace(/[\s-]+/g, "_") ?? null;
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

function stringList(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(id).filter((item): item is string => item !== null);
	return typeof value === "string" ? value.split(/[\s,]+/).map(id).filter((item): item is string => item !== null) : [];
}

function normalizeParameterKey(value: string): string | null {
	const normalized = value.trim().replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s./-]+/g, "_").toLowerCase().replace(/[^a-z0-9_]/g, "").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
	return !normalized || normalized.length < 2 || /^\d+$/.test(normalized) || IGNORED_PARAMETER_KEYS.has(normalized) ? null : normalized;
}

function supportedParameters(value: unknown, result = new Set<string>()): string[] {
	if (Array.isArray(value)) for (const item of value) supportedParameters(item, result);
	else if (value && typeof value === "object") {
		const record = value as Row;
		const direct = typeof record.param_id === "string" ? normalizeParameterKey(record.param_id) : null;
		if (direct) result.add(direct);
		else for (const [key, nested] of Object.entries(record)) {
			const normalized = normalizeParameterKey(key);
			if (normalized) result.add(normalized);
			supportedParameters(nested, result);
		}
	}
	return [...result].sort();
}

function publicRouting(value: unknown): boolean {
	const normalized = status(value);
	return normalized === null || normalized === "active" || normalized === "deranked_lvl1" || normalized === "deranked_lvl2" || normalized === "deranked_lvl3";
}

function providerAvailabilityAllowsRouting(row: Row, now: number): boolean {
	const providerAvailability = status(row.provider_availability_status);
	if (providerAvailability === null || ["available", "preview", "limited_access"].includes(providerAvailability)) return true;
	if (providerAvailability !== "deprecated") return false;
	const effectiveTo = row.effective_to ? Date.parse(String(row.effective_to)) : Number.NaN;
	return Number.isFinite(effectiveTo) && effectiveTo > now;
}

function availability(row: Row, capability: Row, provider: Row | null, now: number): "active" | "coming_soon" | "inactive" {
	const from = row.effective_from ? Date.parse(String(row.effective_from)) : Number.NEGATIVE_INFINITY;
	const to = row.effective_to ? Date.parse(String(row.effective_to)) : Number.POSITIVE_INFINITY;
	if (now >= to) return "inactive";
	if (now < from) return "coming_soon";
	const providerAvailability = status(row.provider_availability_status);
	if (providerAvailability === "coming_soon") return "coming_soon";
	if (!providerAvailabilityAllowsRouting(row, now)) return "inactive";
	const phaseo = status(row.phaseo_status);
	if (status(row.access_scope) === "internal") return "coming_soon";
	if (phaseo && ["planned", "implementing", "testing"].includes(phaseo)) return "coming_soon";
	if (phaseo && phaseo !== "enabled") return "inactive";
	const providerStatus = status(provider?.status);
	if (providerStatus === "beta" || providerStatus === "alpha") return "coming_soon";
	if (!row.is_active_gateway || (providerStatus && providerStatus !== "active") || !publicRouting(provider?.routing_status) || !publicRouting(row.routing_status)) return "inactive";
	const capabilityStatus = status(capability.status);
	if (capabilityStatus === "internal_testing" || capabilityStatus === "coming_soon") return "coming_soon";
	return capabilityStatus && capabilityStatus !== "active" && !(providerAvailability === "deprecated" && capabilityStatus === "degraded") ? "inactive" : "active";
}

function availabilityReason(row: Row, capability: Row, provider: Row | null, now: number): string {
	const from = row.effective_from ? Date.parse(String(row.effective_from)) : Number.NEGATIVE_INFINITY;
	const to = row.effective_to ? Date.parse(String(row.effective_to)) : Number.POSITIVE_INFINITY;
	if (now >= to) return "retired";
	if (now < from) return "scheduled";
	const providerAvailability = status(row.provider_availability_status);
	const phaseo = status(row.phaseo_status);
	const accessScope = status(row.access_scope);
	if (accessScope === "internal" || phaseo === "testing") return "internal_testing";
	if (phaseo && phaseo !== "enabled") return `phaseo_${phaseo}`;
	if (providerAvailability && providerAvailability !== "available") return `provider_${providerAvailability}`;
	const providerStatus = status(provider?.status);
	if (providerStatus === "beta" || providerStatus === "alpha") return "preview_only";
	if (providerStatus && providerStatus !== "active") return ["not_ready", "gated", "access_limited", "region_limited", "project_limited", "paused", "soft_blocked"].includes(providerStatus) ? providerStatus : "provider_inactive";
	const providerRouting = status(provider?.routing_status);
	const modelRouting = status(row.routing_status);
	if (providerRouting === "disabled") return "provider_disabled";
	if (modelRouting === "disabled") return "model_disabled";
	if (["deranked_lvl1", "deranked_lvl2", "deranked_lvl3"].includes(providerRouting ?? "")) return providerRouting!;
	if (["deranked_lvl1", "deranked_lvl2", "deranked_lvl3"].includes(modelRouting ?? "")) return modelRouting!;
	const capabilityStatus = status(capability.status);
	if (capabilityStatus === "disabled") return "capability_disabled";
	if (capabilityStatus === "internal_testing") return "internal_testing";
	if (!row.is_active_gateway) return "inactive";
	return capabilityStatus === "coming_soon" ? "coming_soon" : capabilityStatus && capabilityStatus !== "active" ? "inactive" : "active";
}

export async function fetchGatewayMetadataSource(env: Env, modelId: string): Promise<GatewayMetadataSource | null> {
	const client = getDataClient(env);
	const v2Pricing = await client.rpc("get_v2_model_pricing", {
		p_model_slug: modelId,
		p_region: null,
		p_service_tier: "standard",
	});
	if (!v2Pricing.error && Array.isArray(v2Pricing.data)) {
		const routeStatusResult = await client
			.from("v2_model_provider_routes")
			.select("provider_model_id,provider_availability_status,phaseo_status,access_scope,effective_from,effective_to")
			.eq("model_slug", modelId);
		const explicitStatusesByRoute = new Map(
			(routeStatusResult.error ? [] : rows(routeStatusResult.data)).flatMap((route) => {
				const providerModelId = id(route.provider_model_id);
				return providerModelId ? [[providerModelId, route] as const] : [];
			}),
		);
		const providerModels = new Map<string, Row>();
		const caps = new Map<string, Row>();
		const providers: Row[] = [];
		for (const payload of v2Pricing.data as Row[]) {
			const provider = asRow(payload.provider);
			if (provider) providers.push(publicProviderPayload(provider));
			for (const item of rows(payload.provider_models)) {
				const providerModelId = id(item.id);
				const endpoint = id(item.endpoint) ?? "unmapped";
				if (!providerModelId) continue;
				const key = `${providerModelId}:${endpoint}`;
				const explicitStatuses = explicitStatusesByRoute.get(providerModelId);
				const normalized = {
					provider_api_model_id: providerModelId,
					provider_id: item.api_provider_id,
					api_model_id: item.model_id,
					model_id: item.model_id,
					provider_model_slug: item.provider_model_slug,
					is_active_gateway: item.is_active_gateway,
					provider_availability_status: explicitStatuses?.provider_availability_status ?? item.provider_availability_status ?? null,
					phaseo_status: explicitStatuses?.phaseo_status ?? item.phaseo_status ?? null,
					access_scope: explicitStatuses?.access_scope ?? item.access_scope ?? null,
					routing_status: item.routing_status,
					input_modalities: item.input_modalities,
					output_modalities: item.output_modalities,
					context_length: item.context_length,
					max_output_tokens: item.max_output_tokens,
					effective_from: explicitStatuses?.effective_from ?? item.effective_from ?? null,
					effective_to: explicitStatuses?.effective_to ?? item.effective_to ?? null,
				};
				if (!providerModels.has(key) || item.execution_region == null) providerModels.set(key, normalized);
				caps.set(key, {
					provider_api_model_id: providerModelId,
					capability_id: endpoint,
					params: item.params ?? {},
					max_input_tokens: item.max_input_tokens ?? null,
					max_output_tokens: item.max_output_tokens ?? null,
					status: item.capability_status ?? "active",
				});
			}
		}
		const uniqueProviders = [...new Map(providers.map((provider, index) => [id(provider.api_provider_id) ?? `provider-${index}`, provider])).values()];
		const aliasResult = await client.rpc("get_v2_model_aliases", { p_model_slug: modelId });
		const aliases = !aliasResult.error
			? rows(aliasResult.data).flatMap((alias) => id(alias.alias_slug) ? [{ api_model_id: modelId, alias_slug: id(alias.alias_slug)! }] : [])
			: [];
		return {
			providerModels: [...providerModels.values()],
			caps: [...caps.values()],
			providers: uniqueProviders,
			aliases,
		};
	}
	throw v2Pricing.error ?? new Error("V2 gateway metadata query returned an invalid payload");
}

export function composeGatewayMetadata(modelId: string, source: GatewayMetadataSource) {
	const capsByProviderModel = new Map<string, Row[]>();
	for (const cap of source.caps) {
		const key = id(cap.provider_api_model_id);
		if (key) capsByProviderModel.set(key, [...(capsByProviderModel.get(key) ?? []), cap]);
	}
	const providerById = new Map(source.providers.flatMap((provider) => {
		const key = id(provider.api_provider_id);
		return key ? [[key, provider] as const] : [];
	}));
	const stats = new Map<string, { active: number; total: number }>();
	const now = Date.now();
	for (const row of source.providerModels) {
		const apiModelId = id(row.api_model_id);
		if (!apiModelId) continue;
		const item = stats.get(apiModelId) ?? { active: 0, total: 0 };
		item.total += 1;
		const provider = providerById.get(id(row.provider_id) ?? "") ?? null;
		if ((capsByProviderModel.get(id(row.provider_api_model_id) ?? "") ?? []).some((cap) => availability(row, cap, provider, now) === "active")) item.active += 1;
		stats.set(apiModelId, item);
	}
	const apiModelIds = [...stats].sort((left, right) => right[1].active - left[1].active || right[1].total - left[1].total || left[0].localeCompare(right[0])).map(([value]) => value);
	const apiRank = new Map(apiModelIds.map((value, index) => [value, index]));
	const parameterBuckets = new Map<string, { providers: Map<string, { api_provider_id: string; api_provider_name: string }>; parameters: Map<string, Set<string>> }>();
	const providers: Row[] = [];
	for (const row of source.providerModels) {
		const providerModelId = id(row.provider_api_model_id);
		const providerId = id(row.provider_id);
		if (!providerModelId || !providerId) continue;
		const provider = providerById.get(providerId) ?? null;
		for (const cap of capsByProviderModel.get(providerModelId) ?? []) {
			const capabilityId = id(cap.capability_id);
			if (!capabilityId) continue;
			const availabilityStatus = availability(row, cap, provider, now);
			const providerDetails = provider ? {
				...provider,
				api_provider_id: providerId,
				api_provider_name: publicProviderDisplayName(providerId, provider.api_provider_name),
				provider_family_id: id(provider.provider_family_id) ?? providerId,
				offer_label: provider.offer_label ?? null,
				offer_scope: provider.offer_scope ?? "global",
			} : null;
			if (availabilityStatus === "active") for (const endpoint of CAPABILITY_ENDPOINTS[capabilityId] ?? [capabilityId]) {
				const bucket = parameterBuckets.get(endpoint) ?? { providers: new Map(), parameters: new Map() };
				bucket.providers.set(providerId, { api_provider_id: providerId, api_provider_name: id(providerDetails?.api_provider_name) ?? providerId });
				for (const parameter of supportedParameters(cap.params)) {
					const supported = bucket.parameters.get(parameter) ?? new Set<string>();
					supported.add(providerId);
					bucket.parameters.set(parameter, supported);
				}
				parameterBuckets.set(endpoint, bucket);
			}
			providers.push({
				id: providerModelId,
				api_provider_id: providerId,
				provider_model_slug: row.provider_model_slug ?? null,
				quantization_scheme: id(row.quantization_scheme)?.toUpperCase() ?? null,
				context_length: row.context_length ?? null,
				model_id: id(row.api_model_id) ?? modelId,
				endpoint: capabilityId,
				is_active_gateway: Boolean(row.is_active_gateway),
				provider_availability_status: status(row.provider_availability_status),
				phaseo_status: status(row.phaseo_status),
				access_scope: status(row.access_scope) ?? "public",
				availability_status: availabilityStatus,
				availability_reason: availabilityReason(row, cap, provider, now),
				provider_status: status(provider?.status),
				provider_routing_status: status(provider?.routing_status),
				model_routing_status: status(row.routing_status),
				capability_status: status(cap.status),
				input_modalities: stringList(row.input_modalities).join(","),
				output_modalities: stringList(row.output_modalities).join(","),
				max_input_tokens: cap.max_input_tokens ?? null,
				max_output_tokens: cap.max_output_tokens ?? null,
				effective_from: row.effective_from ?? null,
				effective_to: row.effective_to ?? null,
				created_at: row.created_at ?? null,
				updated_at: row.updated_at ?? null,
				provider: providerDetails,
			});
		}
	}
	const supportedParametersByEndpoint = Object.fromEntries([...parameterBuckets].map(([endpoint, bucket]) => {
		const providerRows = [...bucket.providers.values()].sort((a, b) => a.api_provider_name.localeCompare(b.api_provider_name));
		return [endpoint, [...bucket.parameters].map(([param_id, supported]) => ({
			param_id,
			provider_count_supported: supported.size,
			provider_count_total: providerRows.length,
			support_level: supported.size === providerRows.length ? "all_providers" : "some_providers",
			providers: providerRows.map((provider) => ({ ...provider, supported: supported.has(provider.api_provider_id) })).sort((a, b) => Number(b.supported) - Number(a.supported) || a.api_provider_name.localeCompare(b.api_provider_name)),
		})).sort((a, b) => b.provider_count_supported - a.provider_count_supported || a.param_id.localeCompare(b.param_id))];
	}));
	const activeProviders = providers.filter((provider) => provider.availability_status === "active");
	const comingSoonProviders = providers.filter((provider) => provider.availability_status === "coming_soon");
	const inactiveProviders = providers.filter((provider) => provider.availability_status === "inactive");
	const aliasesByApi = new Map<string, string[]>();
	for (const alias of source.aliases) aliasesByApi.set(alias.api_model_id, [...(aliasesByApi.get(alias.api_model_id) ?? []), alias.alias_slug]);
	const ranked = (values: string[]) => [...new Set(values)].sort((left, right) => (apiRank.get(left) ?? Number.MAX_SAFE_INTEGER) - (apiRank.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right));
	const activeApiIds = ranked(activeProviders.map((provider) => id(provider.model_id)).filter((value): value is string => value !== null));
	const aliases = [...new Set(activeApiIds.flatMap((value) => aliasesByApi.get(value) ?? []))];
	const acceptedModelIdentifiers = [...new Set([...(activeApiIds.length ? activeApiIds : apiModelIds), ...aliases])];
	const primaryModelIdentifier = acceptedModelIdentifiers[0] ?? modelId;
	const endpointApiIds = new Map<string, string[]>();
	for (const provider of activeProviders) {
		const endpoint = id(provider.endpoint);
		const apiModelId = id(provider.model_id);
		if (endpoint && apiModelId) endpointApiIds.set(endpoint, [...(endpointApiIds.get(endpoint) ?? []), apiModelId]);
	}
	const acceptedModelIdentifiersByEndpoint: Record<string, string[]> = {};
	const primaryModelIdentifierByEndpoint: Record<string, string> = {};
	for (const [endpoint, values] of endpointApiIds) {
		const sorted = ranked(values);
		const accepted = [...new Set([...sorted, ...sorted.flatMap((value) => aliasesByApi.get(value) ?? [])])];
		acceptedModelIdentifiersByEndpoint[endpoint] = accepted.length ? accepted : acceptedModelIdentifiers;
		primaryModelIdentifierByEndpoint[endpoint] = acceptedModelIdentifiersByEndpoint[endpoint]?.[0] ?? primaryModelIdentifier;
	}
	return { modelId, aliases, apiModelIds, primaryModelIdentifier, acceptedModelIdentifiers, primaryModelIdentifierByEndpoint, acceptedModelIdentifiersByEndpoint, supportedParametersByEndpoint, providers, activeProviders, comingSoonProviders, inactiveProviders };
}
