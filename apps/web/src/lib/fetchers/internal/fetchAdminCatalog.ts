import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "./serverAccountContext";

async function fetchAdminCatalogPath<T>(path: `/api/account/${string}`): Promise<T> {
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Authentication required");
	return fetchAccountWebApi<T>(path, accessToken);
}

export function fetchAdminCatalogCounts() {
	return fetchAdminCatalogPath<{ models: number; organisations: number; providers: number; benchmarks: number }>("/api/account/models/catalog/counts");
}

export function fetchAdminCatalogList(resource: "models" | "organisations" | "providers" | "benchmarks", args: { q?: string; page?: number; pageSize?: number } = {}) {
	const query = new URLSearchParams({ resource, page: String(args.page ?? 1), pageSize: String(args.pageSize ?? 100) });
	if (args.q) query.set("q", args.q);
	return fetchAdminCatalogPath<{ rows: any[]; count: number }>(`/api/account/models/catalog/list?${query.toString()}`);
}

export function fetchAdminCatalogRecord(resource: "organisation" | "provider" | "benchmark" | "model", id: string) {
	return fetchAdminCatalogPath<{ row: any | null; links?: any[] }>(`/api/account/models/catalog/record?resource=${resource}&id=${encodeURIComponent(id)}`);
}

export function fetchAdminModelFormOptions() {
	return fetchAdminCatalogPath<{ organisations: any[]; providers: any[]; families: any[]; benchmarks: any[]; previousModels: any[]; subscriptionPlans: any[] }>("/api/account/models/catalog/model-form-options");
}
