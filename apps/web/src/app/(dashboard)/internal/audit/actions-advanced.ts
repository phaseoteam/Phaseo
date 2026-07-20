"use server";

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export interface CompleteModelData {
	model_id: string; name: string; organisation_id: string | null; status: string | null; hidden: boolean;
	release_date: string | null; retirement_date: string | null; announcement_date: string | null; deprecation_date: string | null;
	license: string | null; family_id: string | null; previous_model_id: string | null; input_types: string[]; output_types: string[];
	details: Array<{ detail_name: string; detail_value: string }>;
	links: Array<{ platform: string; kind: string; title: string; url: string }>;
	aliases: Array<{ alias_slug: string; is_enabled: boolean }>;
	provider_models: Array<{ provider_api_model_id: string; provider_id: string; api_model_id: string; is_active_gateway: boolean; input_modalities: string[]; output_modalities: string[]; effective_from: string | null; effective_to: string | null }>;
	benchmarks: Array<{ id: string; benchmark_id: string; benchmark_name: string; score: string; is_self_reported: boolean; other_info: string | null; source_link: string | null; rank: number | null }>;
	[key: string]: unknown;
}
type Result<T = undefined> = { success: boolean; error?: string; data?: T };

async function token() {
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	return accessToken;
}

async function mutation(path: `/api/account/models/${string}`, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<Result> {
	try {
		const response = await fetchAccountWebApi<Record<string, any>>(path, await token(), { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
		return { success: true, ...response };
	} catch (error) { return { success: false, error: error instanceof Error ? error.message : "Request failed" }; }
}

async function graph(modelId: string, body: Record<string, unknown>) {
	const result = await mutation(`/api/account/models/${encodeURIComponent(modelId)}/graph`, "PUT", { modelId, ...body });
	return result.success ? { success: true } : result;
}

export async function updateModelDetails(input: any) {
	return graph(input.modelId, { model_details: (input.details ?? []).map((row: any) => ({ detail_name: row.name, detail_value: row.value })) });
}

export async function updateModelOrganization(input: any) {
	return graph(input.modelId, { organisation_id: input.organisationId });
}

export async function updateModelLinks(input: any) {
	return graph(input.modelId, { links: (input.links ?? []).map((row: any) => ({ platform: row.type, kind: row.type, title: row.title, url: row.url })) });
}

export async function updateModelAliases(input: any) {
	return graph(input.modelId, { aliases: (input.aliases ?? []).map((row: any) => ({ alias_slug: row.alias, is_enabled: row.enabled })) });
}

export async function createProviderModel(input: any) {
	return mutation("/api/account/models/catalog/provider-models", "POST", input);
}

export async function updateProviderModel(input: any) {
	return mutation(`/api/account/models/catalog/provider-models/${encodeURIComponent(input.providerApiModelId)}`, "PATCH", input);
}

export async function deleteProviderModel(providerApiModelId: string) {
	return mutation(`/api/account/models/catalog/provider-models/${encodeURIComponent(providerApiModelId)}`, "DELETE");
}

export async function createBenchmarkResult(input: any) {
	return mutation("/api/account/models/catalog/benchmark-results", "POST", input);
}

export async function updateBenchmarkResult(input: any) {
	return mutation(`/api/account/models/catalog/benchmark-results/${encodeURIComponent(input.resultId)}`, "PATCH", input);
}

export async function deleteBenchmarkResult(resultId: string) {
	return mutation(`/api/account/models/catalog/benchmark-results/${encodeURIComponent(resultId)}`, "DELETE");
}

export async function deleteModel(modelId: string) {
	return mutation(`/api/account/models/catalog/models/${encodeURIComponent(modelId)}`, "DELETE");
}

export async function fetchCompleteModelData(modelId: string): Promise<Result<CompleteModelData>> {
	try {
		const response = await fetchAccountWebApi<{ source: Record<string, any> }>(`/api/account/models/${encodeURIComponent(modelId)}/source`, await token());
		const source = response.source;
		const model = source.model;
		if (!model) return { success: false, error: "Model not found", data: undefined };
		const data: CompleteModelData = {
			...model,
			input_types: Array.isArray(model.input_types) ? model.input_types : String(model.input_types ?? "").split(",").filter(Boolean),
			output_types: Array.isArray(model.output_types) ? model.output_types : String(model.output_types ?? "").split(",").filter(Boolean),
			details: (model.model_details ?? []).map((row: any) => ({ detail_name: row.detail_name, detail_value: String(row.detail_value ?? "") })),
			links: model.model_links ?? [],
			aliases: (source.aliases ?? []).map((row: any) => ({ alias_slug: row.alias_slug, is_enabled: true })),
			provider_models: (source.providerRows ?? []).map((row: any) => ({ ...row, input_modalities: Array.isArray(row.input_modalities) ? row.input_modalities : [], output_modalities: Array.isArray(row.output_modalities) ? row.output_modalities : [] })),
			benchmarks: (model.benchmark_results ?? []).map((row: any) => ({ ...row, benchmark_name: (Array.isArray(row.benchmark) ? row.benchmark[0] : row.benchmark)?.name ?? row.benchmark_id, score: String(row.score ?? "") })),
		};
		return { success: true, data };
	} catch (error) { return { success: false, error: error instanceof Error ? error.message : "Model unavailable", data: undefined }; }
}

async function options() {
	return fetchAccountWebApi<Record<string, any>>("/api/account/models/catalog/model-form-options", await token());
}

export async function fetchOrganisations() {
	try { const value = await options(); return { success: true, data: (value.organisations ?? []).map((row: any) => ({ id: row.organisation_id, name: row.name })) }; } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Unavailable", data: [] }; }
}

export async function fetchProviders() {
	try { const value = await options(); return { success: true, data: (value.providers ?? []).map((row: any) => ({ id: row.api_provider_id, name: row.api_provider_name ?? row.api_provider_id })) }; } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Unavailable", data: [] }; }
}

export async function fetchBenchmarks() {
	try { const value = await options(); return { success: true, data: (value.benchmarks ?? []).map((row: any) => ({ id: row.id, name: row.name ?? row.id })) }; } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Unavailable", data: [] }; }
}
