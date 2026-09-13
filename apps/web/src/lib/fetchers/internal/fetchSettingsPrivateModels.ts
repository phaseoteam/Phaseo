import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export type PrivateModelSetting = {
	id: string; model_id: string; name: string; description?: string | null; base_url: string;
	local_slug?: string; catalog_model_id?: string | null; host_provider_id?: string | null; custom_provider_name?: string | null; custom_provider_url?: string | null; routing_policy?: "preferred" | "balanced" | "fallback";
	upstream_model_id: string; supports_responses: boolean; enabled: boolean;
	context_length?: number | null; max_output_tokens?: number | null;
	credential_prefix?: string | null; credential_suffix?: string | null; updated_at?: string | null;
};

export async function fetchSettingsPrivateModels() {
	const context = await getServerAccountContext();
	if (!context.accessToken || !context.workspaceId) return { workspaceId: context.workspaceId, workspaceNamespace: null, workspaceName: "Workspace", workspaceLogoUrl: null, canManage: false, models: [] as PrivateModelSetting[] };
	return fetchAccountWebApi<{ workspaceId: string; workspaceNamespace: string; workspaceName: string; workspaceLogoUrl: string | null; canManage: boolean; models: PrivateModelSetting[] }>(
		`/api/account/private-models?workspaceId=${encodeURIComponent(context.workspaceId)}`, context.accessToken,
	);
}

export async function fetchPrivateModelOverview(modelId: string): Promise<ModelOverviewPage | null> {
	const data = await fetchSettingsPrivateModels().catch(() => null);
	const model = data?.models.find((candidate) => candidate.model_id === modelId && candidate.enabled);
	if (!model) return null;
	return {
		model_id: model.model_id,
		name: model.name,
		organisation_id: model.model_id.split("/")[0] ?? "private",
		description: model.description ?? null,
		aliases: [],
		variants: [],
		status: "Available",
		announcement_date: null,
		release_date: null,
		deprecation_date: null,
		retirement_date: null,
		license: null,
		input_types: "text",
		output_types: "text",
		previous_model_id: null,
		family_id: null,
		updated_at: model.updated_at ?? null,
		organisation: { name: data?.workspaceName ?? "Workspace", logo_url: data?.workspaceLogoUrl ?? null },
		is_private: true,
		model_links: [],
		model_details: [
			{ detail_name: "hosting provider", detail_value: model.host_provider_id ?? model.custom_provider_name ?? "Private endpoint" },
			{ detail_name: "routing policy", detail_value: model.routing_policy ?? "preferred" },
			...(model.context_length ? [{ detail_name: "context length", detail_value: model.context_length }] : []),
			...(model.max_output_tokens ? [{ detail_name: "max output tokens", detail_value: model.max_output_tokens }] : []),
			{ detail_name: "visibility", detail_value: "Workspace only" },
			{ detail_name: "endpoint compatibility", detail_value: model.supports_responses ? "Chat Completions, Messages, Responses" : "Chat Completions, Messages" },
		],
	};
}

export type PrivateModelPerformance = { requests: number; successfulRequests: number; successRate: number | null; averageLatencyMs: number | null; averageGenerationMs: number | null; averageThroughput: number | null; lastRequestAt: string | null };
export async function fetchPrivateModelPerformance(modelId: string): Promise<PrivateModelPerformance | null> {
	const context = await getServerAccountContext();
	if (!context.accessToken || !context.workspaceId) return null;
	return fetchAccountWebApi<PrivateModelPerformance>(`/api/account/private-models/performance?workspaceId=${encodeURIComponent(context.workspaceId)}&modelId=${encodeURIComponent(modelId)}`, context.accessToken).catch(() => null);
}
