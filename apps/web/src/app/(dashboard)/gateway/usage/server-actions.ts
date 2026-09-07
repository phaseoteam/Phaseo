"use server";

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

export interface RequestRow {
	id?: string; request_id: string; created_at: string; endpoint: string | null; model_id: string | null; provider: string | null;
	app_id: string | null; session_id: string | null; success: boolean; status_code: number | null; error_code: string | null;
	error_message: string | null; error_payload: Record<string, unknown> | null; usage: any; cost_nanos: number | null;
	client_source_id?: string | null; client_source_name?: string | null; client_source_kind?: string | null;
	client_source_version?: string | null; client_source_detection?: string | null;
	pricing_lines: AsyncJobRequestPricingLine[]; provider_attempts: Array<{
		sequence?: number | null; attempt_number?: number | null; round_number?: number | null;
		internal_attempt_number?: number | null; provider?: string | null; api_model_id?: string | null;
		provider_model_slug?: string | null; outcome?: string | null; status?: number | null;
		status_text?: string | null; duration_ms?: number | null; latency_ms?: number | null;
		generation_ms?: number | null; total_ms?: number | null; cost_nanos?: number | null;
		currency?: string | null; finish_reason?: string | null; provider_finish_reason?: string | null;
		retryable?: boolean | null; fallback_attempted?: boolean; upstream_error_code?: string | null;
		upstream_error_message?: string | null; upstream_error_description?: string | null;
	}>;
	routing_trace?: Record<string, unknown> | null;
	routing_decisions?: Array<{
		routing_decision_id: number | string; decision_order: number; provider_slug: string;
		provider_api_model_id: string | null; decision: "ranked" | "excluded"; rank: number | null;
		score: number | string | null; selected: boolean; attempted: boolean; breaker: string | null;
		provider_status?: string | null; provider_routing_status?: string | null;
		model_routing_status?: string | null; capability_status?: string | null;
		exclusion_stage: string | null; exclusion_reason: string | null;
		score_factors: Record<string, unknown>; score_trace: Record<string, unknown>;
	}>;
	usage_total_tokens?: number | null; usage_input_tokens?: number | null; usage_output_tokens?: number | null;
	[key: string]: any;
}
export interface PaginatedRequestsParams { [key: string]: any; cursor?: { createdAt: string; id: string } | null; page?: number; sortField: string; sortDirection: "asc" | "desc" }
export interface ProviderMetadataEntry { name: string; promptTrainingPolicy: string | null; [key: string]: any }
export interface AppMetadata { id?: string; title: string; imageUrl: string | null; [key: string]: any }
export type GatewayIoLog = { status: string; storage_provider: string | null; bytes: number | null; retention_until: string | null; error: string | null; payload: Record<string, unknown> | null; };
export type ModelMetadataEntry = { organisationId: string; organisationName: string; canonicalModelId?: string; modelName?: string };
export interface InvestigateGenerationResult { request: RequestRow; appName: string | null; modelMetadata: Array<[string, ModelMetadataEntry]>; providerNames: Array<[string, string]>; providerMetadata: Array<[string, ProviderMetadataEntry]>; ioLog?: GatewayIoLog | null; [key: string]: any }
export interface ChartDataResult { requestsChart: any[]; tokensChart: any[]; costChart: any[]; current: any; previous: any; [key: string]: any }
export interface SessionRollupRow { session_id: string; request_count: number; total_cost_nanos: number; total_cost_usd: number; first_request_at: string; last_request_at: string; app_ids: string[] | null; model_ids: string[] | null; provider_ids: string[] | null; end_user_ids: string[] | null; app_counts?: Array<{ app_id: string; request_count: number }>; model_counts?: Array<{ model_id: string; request_count: number }>; [key: string]: any }
export interface SessionRequestRow extends RequestRow { session_id: string | null; end_user_id: string | null }
export interface AsyncJobRow { kind: "video" | "batch"; internal_id: string; request_id: string | null; model: string | null; provider: string | null; app_id: string | null; status: string | null; created_at: string; updated_at: string; job_failure_category: string | null; job_failure_provider: string | null; job_failure_hint: string | null; [key: string]: any }
export interface AsyncJobDetailRow extends AsyncJobRow { batch_pricing_lines: AsyncJobRequestPricingLine[]; request_pricing_lines: AsyncJobRequestPricingLine[]; request_provider_attempts: Array<Record<string, any>>; webhook_attempts: Array<Record<string, any>>; job_failure_sample: Array<Record<string, any>>; [key: string]: any }
export type AsyncJobRequestPricingLine = Record<string, any> | string | number | boolean | null;
export interface JobsRollupRow { [key: string]: any }

async function context() {
	const value = await getServerAccountContext();
	if (!value.accessToken || !value.workspaceId) throw new Error("Unauthorized");
	return value as typeof value & { accessToken: string; workspaceId: string };
}

async function operation<T>(name: string, args: unknown[]): Promise<T> {
	const value = await context();
	const response = await fetchAccountWebApi<{ result: T }>("/api/account/settings/usage/actions", value.accessToken, {
		method: "POST",
		body: JSON.stringify({ workspaceId: value.workspaceId, operation: name, args }),
	});
	return response.result;
}

export async function fetchPaginatedRequests(params: PaginatedRequestsParams) { return operation<{ data: RequestRow[]; hasMore: boolean; nextCursor: { createdAt: string; id: string } | null; pageSize: number }>("paginatedRequests", [params]); }
export async function fetchOrganizationColors(modelIds: string[]) { return new Map<string, string>(await operation<Array<[string, string]>>("organizationColors", [modelIds])); }
export async function fetchModelMetadata(modelIds: string[]) { return new Map<string, ModelMetadataEntry>(await operation<Array<[string, ModelMetadataEntry]>>("modelMetadata", [modelIds])); }
export async function fetchProviderNames(providerIds: string[]) { return new Map<string, string>(await operation<Array<[string, string]>>("providerNames", [providerIds])); }
export async function fetchProviderMetadata(providerIds: string[]) { return new Map<string, ProviderMetadataEntry>(await operation<Array<[string, ProviderMetadataEntry]>>("providerMetadata", [providerIds])); }
export async function fetchFunStats(timeRange: { from: string; to: string }) { return operation<any>("funStats", [timeRange]); }
export async function fetchAppNames(appIds: string[]) { return new Map<string, string>(await operation<Array<[string, string]>>("appNames", [appIds])); }
export async function fetchAppMetadata(appIds: string[]) { return new Map<string, AppMetadata>(await operation<Array<[string, AppMetadata]>>("appMetadata", [appIds])); }
export async function fetchGenerationLog(requestId: string): Promise<{ success: boolean; data?: InvestigateGenerationResult; error?: string }> {
	try {
		const value = await context();
		const response = await fetchAccountWebApi<{ data: InvestigateGenerationResult }>(
			`/api/account/settings/usage/logs/${encodeURIComponent(requestId)}?workspaceId=${encodeURIComponent(value.workspaceId)}`,
			value.accessToken,
		);
		return { success: true, data: response.data };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : "usage_log_detail_unavailable" };
	}
}
export async function investigateGeneration(requestId: string): Promise<{ success: boolean; data?: InvestigateGenerationResult; error?: string }> {
	try {
		return await operation("investigateGeneration", [requestId]);
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "usage_log_detail_unavailable",
		};
	}
}
export async function fetchChartData(params: any): Promise<ChartDataResult> { return operation("chartData", [params]); }
export async function fetchSessionRollups(params: any): Promise<SessionRollupRow[]> { return operation("sessionRollups", [params]); }
export async function fetchSessionRequests(params: any): Promise<SessionRequestRow[]> { return operation("sessionRequests", [params]); }
export async function fetchJobsRollups(params: any = {}): Promise<JobsRollupRow[]> { return operation("jobsRollups", [params]); }
export async function fetchRecentAsyncJobs(params?: any): Promise<AsyncJobRow[]> { return operation("recentAsyncJobs", [params]); }
export async function fetchAsyncJobDetail(input: { kind: "video" | "batch"; internalId: string }): Promise<AsyncJobDetailRow | null> { return operation("asyncJobDetail", [input]); }
