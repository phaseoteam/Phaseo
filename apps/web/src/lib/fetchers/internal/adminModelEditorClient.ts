import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";

const inFlight = new Map<string, Promise<any>>();

function coalesced<T>(key: string, load: () => Promise<T>): Promise<T> {
	const existing = inFlight.get(key) as Promise<T> | undefined;
	if (existing) return existing;
	const promise = load().finally(() => inFlight.delete(key));
	inFlight.set(key, promise);
	return promise;
}

export function fetchAdminModelEditorSource(modelId: string) {
	const path = `/api/account/models/${encodeURIComponent(modelId)}/source` as const;
	return coalesced(path, async () => {
		const response = await fetchAccountWebApi<{ source: Record<string, any> }>(path, await getBrowserAccessToken());
		return response.source;
	});
}

export function fetchAdminModelFormOptions() {
	const path = "/api/account/models/catalog/model-form-options" as const;
	return coalesced(path, async () => fetchAccountWebApi<Record<string, any>>(path, await getBrowserAccessToken()));
}

export async function createAdminBenchmark(input: { id: string; name: string }) {
	return fetchAccountWebApi<{ benchmark: { id: string; name: string } }>(
		"/api/account/models/catalog/benchmarks",
		await getBrowserAccessToken(),
		{ method: "POST", body: JSON.stringify(input) },
	);
}

export async function createAdminSubscriptionPlan(input: Record<string, unknown>) {
	return fetchAccountWebApi<{ plan: Record<string, unknown> }>(
		"/api/account/models/catalog/subscription-plans",
		await getBrowserAccessToken(),
		{ method: "POST", body: JSON.stringify(input) },
	);
}

export type AdminPricingEditorSource = {
	model: { model_slug: string; name: string | null; lab_slug: string };
	routes: Array<{
		provider_model_id: string;
		provider_slug: string;
		provider_model_slug: string;
		status: string;
		provider_availability_status: "unknown" | "coming_soon" | "preview" | "available" | "limited_access" | "deprecated" | "removed";
		phaseo_status: "unsupported" | "planned" | "implementing" | "testing" | "enabled" | "disabled" | "blocked";
		access_scope: "public" | "internal";
		routing_enabled: boolean;
		regions: string[];
		input_modalities: string[];
		output_modalities: string[];
		context_length: number | null;
		max_output_tokens: number | null;
		effective_from: string | null;
		effective_to: string | null;
		metadata: Record<string, unknown>;
	}>;
	skus: Array<Record<string, any> & { sku_id: string; provider_model_id: string }>;
	meters: Array<Record<string, any> & { sku_id: string; meter_key: string }>;
	serviceTiers: Array<{ service_tier_slug: string; display_name: string; status: string }>;
	regions: Array<{ provider_slug: string; region_code: string; display_name: string | null; status: string }>;
	capabilities: Array<{ provider_model_id: string; capability_id: string; status: string }>;
	meterDefinitions: Array<{ meter_key: string; display_name: string; modality: string; direction: "input" | "output" | null; unit: string; default_unit_quantity: number; status: string }>;
	providers: Array<{ provider_slug: string; name: string; status: string; routing_enabled: boolean; routable: boolean; base_url: string | null; metadata: Record<string, unknown> }>;
};

export async function fetchAdminPricingEditorSource(modelId: string) {
	const path = `/api/account/models/${encodeURIComponent(modelId)}/pricing-editor` as const;
	return fetchAccountWebApi<AdminPricingEditorSource>(path, await getBrowserAccessToken());
}

export async function saveAdminPricingSku(modelId: string, sku: Record<string, unknown>) {
	return fetchAccountWebApi<{ pricing: Record<string, unknown> }>(
		`/api/account/models/${encodeURIComponent(modelId)}/pricing-editor`,
		await getBrowserAccessToken(),
		{ method: "PUT", body: JSON.stringify(sku) },
	);
}

export async function saveAdminProviderRoute(modelId: string, route: Record<string, unknown>) {
	return fetchAccountWebApi<{ route: Record<string, unknown> }>(
		`/api/account/models/${encodeURIComponent(modelId)}/provider-routes`,
		await getBrowserAccessToken(),
		{ method: "PUT", body: JSON.stringify(route) },
	);
}

export async function saveAdminModelNotice(modelId: string, notice: { tone: "info" | "warning" | "critical"; markdown: string } | null) {
	return fetchAccountWebApi<{ notice: { tone: string; markdown: string } | null }>(
		`/api/account/models/${encodeURIComponent(modelId)}/notice`,
		await getBrowserAccessToken(),
		{ method: "PUT", body: JSON.stringify(notice) },
	);
}

export async function saveAdminModelAliases(modelId: string, aliases: Array<Record<string, unknown>>) {
	return fetchAccountWebApi<{ aliases: Array<Record<string, unknown>> }>(
		`/api/account/models/${encodeURIComponent(modelId)}/aliases`,
		await getBrowserAccessToken(),
		{ method: "PUT", body: JSON.stringify(aliases) },
	);
}

export async function deleteAdminPricingSku(modelId: string, skuId: string) {
	return fetchAccountWebApi<{ pricing: Record<string, unknown> }>(
		`/api/account/models/${encodeURIComponent(modelId)}/pricing-editor/${encodeURIComponent(skuId)}`,
		await getBrowserAccessToken(),
		{ method: "DELETE" },
	);
}
