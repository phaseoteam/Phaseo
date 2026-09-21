import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "./serverAccountContext";

async function fetchAdminCatalogPath<T>(path: `/api/account/${string}`): Promise<T> {
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Authentication required");
	return fetchAccountWebApi<T>(path, accessToken);
}

async function postAdminCatalogPath<T>(path: `/api/account/${string}`, body: unknown): Promise<T> {
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Authentication required");
	return fetchAccountWebApi<T>(path, accessToken, {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export function fetchAdminCatalogCounts() {
	return fetchAdminCatalogPath<{ models: number; organisations: number; providers: number; benchmarks: number }>("/api/account/models/catalog/counts");
}

export type AdminCatalogOverview = {
	attention: { hiddenModels: number; modelsWithoutLab: number };
	routes: { total: number; routable: number };
	recentChanges: Array<{ change_id: string; resource_type: string; resource_id: string; action: string; created_at: string }>;
};

export function fetchAdminCatalogOverview() {
	return fetchAdminCatalogPath<AdminCatalogOverview>("/api/account/models/catalog/overview");
}

export function fetchAdminCatalogList(resource: "models" | "organisations" | "providers" | "benchmarks", args: { q?: string; page?: number; pageSize?: number; attention?: string } = {}) {
	const query = new URLSearchParams({ resource, page: String(args.page ?? 1), pageSize: String(args.pageSize ?? 100) });
	if (args.q) query.set("q", args.q);
	if (args.attention) query.set("attention", args.attention);
	return fetchAdminCatalogPath<{ rows: any[]; count: number }>(`/api/account/models/catalog/list?${query.toString()}`);
}

export function fetchAdminCatalogRecord(resource: "organisation" | "provider" | "benchmark" | "model", id: string) {
	return fetchAdminCatalogPath<{ row: any | null; links?: any[] }>(`/api/account/models/catalog/record?resource=${resource}&id=${encodeURIComponent(id)}`);
}

export function recordAdminModelAnnouncement(modelId: string) {
	return postAdminCatalogPath<{ success: boolean }>("/api/account/models/catalog/model-announcements", { modelId });
}

export function sendAdminModelAnnouncement(modelId: string, payload: unknown, webhookUrl?: string) {
	return postAdminCatalogPath<{ success: boolean; stateRecorded?: boolean; message?: string }>(
		"/api/account/models/catalog/model-announcements",
		{ modelId, payload, webhookUrl },
	);
}

export function sendAdminModelAnnouncementTest(payload: unknown, webhookUrl?: string, modelIds?: string[]) {
	return postAdminCatalogPath<{ success: boolean; stateRecorded?: boolean }>(
		"/api/account/models/catalog/model-announcements/test",
		{ payload, webhookUrl, modelIds },
	);
}

export function fetchAdminModelFormOptions() {
	return fetchAdminCatalogPath<{ organisations: any[]; providers: any[]; families: any[]; benchmarks: any[]; previousModels: any[]; subscriptionPlans: any[] }>("/api/account/models/catalog/model-form-options");
}

export type ProviderFormOptions = {
  providers: Array<{ provider_slug: string; name: string; provider_family_slug: string | null; offer_scope: string; offer_label: string | null }>;
  regions: Array<{ provider_slug: string; region_code: string; display_name: string | null }>;
};
export function fetchAdminProviderFormOptions() {
  return fetchAdminCatalogPath<ProviderFormOptions>("/api/account/models/catalog/provider-form-options");
}
