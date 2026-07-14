"use server";

import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import {
	LONG_RUNNING_REQUEST_ENDPOINTS,
	buildNotInFilter,
} from "@/lib/gateway/usage/logFilters";
import {
	requireAuthenticatedUser,
	requireWorkspaceMembership,
} from "@/utils/serverActionAuth";
import {
	parseAsyncJobFailureDiagnostics,
	type AsyncJobFailureSampleRow,
	type AsyncJobProviderFailureDiagnosticsRow,
	type AsyncJobUpstreamErrorRow,
} from "@/lib/gateway/usage/asyncJobFailureDiagnostics";

// Raw fallback can pull large request windows; keep it opt-in to protect DB egress.
const ENABLE_GATEWAY_USAGE_RAW_FALLBACK =
	process.env.ENABLE_GATEWAY_USAGE_RAW_FALLBACK === "1";

async function requireAuthedTeamContext(
	supabase: Awaited<ReturnType<typeof createClient>>
) {
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();
	if (error || !user?.id) throw new Error("Unauthorized");

	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) throw new Error("Missing team id");

	await requireWorkspaceMembership(supabase, user.id, workspaceId);
	return { user, workspaceId };
}

function normalizeLookupIds(ids: string[]): string[] {
	return Array.from(
		new Set(
			ids
				.map((id) => (typeof id === "string" ? id.trim() : ""))
				.filter((id) => id.length > 0),
		),
	).sort((a, b) => a.localeCompare(b));
}

function toLookupCacheKey(ids: string[]): string {
	return normalizeLookupIds(ids).join("\n");
}

export interface PaginatedRequestsParams {
	timeRange: { from: string; to: string };
	modelFilter?: string | null;
	providerFilter?: string | null;
	appFilter?: string | null;
	endpointFilter?: string | null;
	finishReasonFilter?: string | null;
	streamFilter?: "all" | "streaming" | "non_streaming";
	errorCodeFilter?: string | null;
	statusCodeFilter?: number | null;
	keyFilter?: string | null;
	statusFilter?: "all" | "success" | "error";
	requestFilter?: string | null;
	sessionFilter?: string | null;
	page: number;
	sortField: string;
	sortDirection: "asc" | "desc";
}

export interface RequestDetailMetadata {
	provider_candidate_diagnostics?: unknown;
	provider_enablement_diagnostics?: unknown;
	routing_diagnostics?: unknown;
	[key: string]: unknown;
}

export interface NormalizedRequestUsageColumns {
	usage_total_tokens?: number | string | null;
	usage_input_tokens?: number | string | null;
	usage_output_tokens?: number | string | null;
	usage_reasoning_tokens?: number | string | null;
	usage_input_text_tokens?: number | string | null;
	usage_output_text_tokens?: number | string | null;
	usage_input_image_tokens?: number | string | null;
	usage_output_image_tokens?: number | string | null;
	usage_input_audio_tokens?: number | string | null;
	usage_output_audio_tokens?: number | string | null;
	usage_input_video_tokens?: number | string | null;
	usage_output_video_tokens?: number | string | null;
	usage_image_inputs?: number | string | null;
	usage_image_outputs?: number | string | null;
	usage_audio_inputs?: number | string | null;
	usage_audio_outputs?: number | string | null;
	usage_video_inputs?: number | string | null;
	usage_video_outputs?: number | string | null;
	usage_cached_read_tokens?: number | string | null;
	usage_cached_write_tokens?: number | string | null;
	usage_cached_read_text_tokens?: number | string | null;
	usage_cached_write_text_tokens?: number | string | null;
	usage_cached_write_text_tokens_5m?: number | string | null;
	usage_cached_write_text_tokens_1h?: number | string | null;
	usage_cached_read_image_tokens?: number | string | null;
	usage_cached_write_image_tokens?: number | string | null;
	usage_cached_read_audio_tokens?: number | string | null;
	usage_cached_write_audio_tokens?: number | string | null;
	usage_cached_read_video_tokens?: number | string | null;
	usage_cached_write_video_tokens?: number | string | null;
	usage_input_quad_tokens?: number | string | null;
	usage_output_quad_tokens?: number | string | null;
	usage_total_quad_tokens?: number | string | null;
	usage_text_quad_tokens?: number | string | null;
	usage_rerank_quad_tokens?: number | string | null;
	usage_embedding_quad_tokens?: number | string | null;
	usage_moderation_quad_tokens?: number | string | null;
	usage_ocr_quad_tokens?: number | string | null;
	usage_image_megapixels?: number | string | null;
	usage_audio_seconds?: number | string | null;
	usage_video_pixel_seconds?: number | string | null;
	usage_input_characters?: number | string | null;
	usage_output_characters?: number | string | null;
	usage_total_characters?: number | string | null;
	usage_normalized_at?: string | null;
}

export interface RequestRow extends NormalizedRequestUsageColumns {
	request_id: string;
	created_at: string;
	endpoint: string | null;
	model_id: string | null;
	requested_model_id: string | null;
	routed_model_id: string | null;
	provider: string | null;
	native_response_id: string | null;
	stream: boolean;
	session_id: string | null;
	app_id: string | null;
	app_key: string | null;
	app_title: string | null;
	app_image_url: string | null;
	usage: any;
	cost_nanos: number | null;
	generation_ms: number | null;
	latency_ms: number | null;
	// PostgREST often returns `numeric` as string; treat as number-like in the UI.
	throughput: number | string | null;
	finish_reason: string | null;
	success: boolean;
	status_code: number | null;
	error_code: string | null;
	error_message: string | null;
	error_payload: Record<string, unknown> | null;
	detail_metadata: RequestDetailMetadata | null;
	key_id: string | null;
	pricing_lines: AsyncJobRequestPricingLine[];
	provider_attempts: Array<{
		attempt_number: number | null;
		provider: string | null;
		api_model_id: string | null;
		provider_model_slug: string | null;
		outcome: string | null;
		status: number | null;
		status_text: string | null;
		duration_ms: number | null;
		upstream_error_code: string | null;
		upstream_error_message: string | null;
		upstream_error_description: string | null;
	}>;
}

export type SerializableModelMetadataEntry = {
	organisationId: string;
	organisationName: string;
	modelName?: string;
};

export interface InvestigateGenerationResult {
	request: RequestRow;
	appName: string | null;
	modelMetadata: Array<[string, SerializableModelMetadataEntry]>;
	providerNames: Array<[string, string]>;
	providerMetadata: Array<[string, ProviderMetadataEntry]>;
}

export interface PaginatedRequestsResult {
	data: RequestRow[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

const NORMALIZED_REQUEST_USAGE_SELECT = `
	usage_total_tokens,
	usage_input_tokens,
	usage_output_tokens,
	usage_reasoning_tokens,
	usage_input_text_tokens,
	usage_output_text_tokens,
	usage_input_image_tokens,
	usage_output_image_tokens,
	usage_input_audio_tokens,
	usage_output_audio_tokens,
	usage_input_video_tokens,
	usage_output_video_tokens,
	usage_image_inputs,
	usage_image_outputs,
	usage_audio_inputs,
	usage_audio_outputs,
	usage_video_inputs,
	usage_video_outputs,
	usage_cached_read_tokens,
	usage_cached_write_tokens,
	usage_cached_read_text_tokens,
	usage_cached_write_text_tokens,
	usage_cached_write_text_tokens_5m,
	usage_cached_write_text_tokens_1h,
	usage_cached_read_image_tokens,
	usage_cached_write_image_tokens,
	usage_cached_read_audio_tokens,
	usage_cached_write_audio_tokens,
	usage_cached_read_video_tokens,
	usage_cached_write_video_tokens,
	usage_input_quad_tokens,
	usage_output_quad_tokens,
	usage_total_quad_tokens,
	usage_text_quad_tokens,
	usage_rerank_quad_tokens,
	usage_embedding_quad_tokens,
	usage_moderation_quad_tokens,
	usage_ocr_quad_tokens,
	usage_image_megapixels,
	usage_audio_seconds,
	usage_video_pixel_seconds,
	usage_input_characters,
	usage_output_characters,
	usage_total_characters,
	usage_normalized_at
`;

function normalizeProviderAttempts(
	value: unknown,
): RequestRow["provider_attempts"] {
	if (!Array.isArray(value)) return [];
	return value.map((attempt: any) => ({
		attempt_number:
			typeof attempt?.attempt_number === "number"
				? attempt.attempt_number
				: typeof attempt?.attempt_number === "string"
					? Number(attempt.attempt_number)
					: null,
		provider:
			typeof attempt?.provider === "string" ? attempt.provider : null,
		api_model_id:
			typeof attempt?.api_model_id === "string" ? attempt.api_model_id : null,
		provider_model_slug:
			typeof attempt?.provider_model_slug === "string"
				? attempt.provider_model_slug
				: null,
		outcome:
			typeof attempt?.outcome === "string" ? attempt.outcome : null,
		status:
			typeof attempt?.status === "number"
				? attempt.status
				: typeof attempt?.status === "string"
					? Number(attempt.status)
					: null,
		status_text:
			typeof attempt?.status_text === "string"
				? attempt.status_text
				: null,
		duration_ms:
			typeof attempt?.duration_ms === "number"
				? attempt.duration_ms
				: typeof attempt?.duration_ms === "string"
					? Number(attempt.duration_ms)
					: null,
		upstream_error_code:
			typeof attempt?.upstream_error_code === "string"
				? attempt.upstream_error_code
				: null,
		upstream_error_message:
			typeof attempt?.upstream_error_message === "string"
				? attempt.upstream_error_message
				: null,
		upstream_error_description:
			typeof attempt?.upstream_error_description === "string"
				? attempt.upstream_error_description
				: null,
	}));
}

function normalizePlainObject(
	value: unknown,
): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function toRequestRow(row: any): RequestRow {
	const appRow = Array.isArray(row?.app) ? row.app[0] : row?.app;
	const appTitle =
		typeof appRow?.title === "string" && appRow.title.trim().length > 0
			? appRow.title.trim()
			: null;
	const appKey =
		typeof appRow?.app_key === "string" && appRow.app_key.trim().length > 0
			? appRow.app_key.trim()
			: null;
	const appImageUrl =
		typeof appRow?.image_url === "string" && appRow.image_url.trim().length > 0
			? appRow.image_url.trim()
			: null;

	return {
		...row,
		endpoint:
			typeof row?.endpoint === "string" && row.endpoint.trim().length > 0
				? row.endpoint.trim()
				: null,
		requested_model_id:
			typeof row?.requested_model_id === "string" &&
			row.requested_model_id.trim().length > 0
				? row.requested_model_id.trim()
				: null,
		routed_model_id:
			typeof row?.routed_model_id === "string" &&
			row.routed_model_id.trim().length > 0
				? row.routed_model_id.trim()
				: null,
		native_response_id:
			typeof row?.native_response_id === "string" &&
			row.native_response_id.trim().length > 0
				? row.native_response_id.trim()
				: null,
		stream: row?.stream === true,
		session_id:
			typeof row?.session_id === "string" && row.session_id.trim().length > 0
				? row.session_id.trim()
				: null,
		app_title: appTitle,
		app_key: appKey,
		app_image_url: appImageUrl,
		pricing_lines: normalizePricingLines(row?.pricing_lines),
		error_payload: normalizePlainObject(row?.error_payload),
		detail_metadata: normalizePlainObject(row?.detail_metadata) as RequestDetailMetadata | null,
		provider_attempts: normalizeProviderAttempts(row?.provider_attempts),
	} as RequestRow;
}

/**
 * Fetch paginated requests with filters and sorting
 */
export async function fetchPaginatedRequests(
	params: PaginatedRequestsParams
): Promise<PaginatedRequestsResult> {
	const supabase = await createClient();
	const { workspaceId } = await requireAuthedTeamContext(supabase);

	if (!workspaceId) {
		return {
			data: [],
			total: 0,
			page: params.page,
			pageSize: 100,
			totalPages: 0,
		};
	}

	const pageSize = 25;
	const offset = (params.page - 1) * pageSize;

	// Build query
	let query = supabase
		.from("gateway_requests")
		.select(
			`
                        request_id,
                        created_at,
                        endpoint,
                        model_id,
                        requested_model_id,
                        routed_model_id,
                        provider,
                        native_response_id,
                        stream,
                        session_id,
                        app_id,
			app:api_apps!gateway_requests_app_id_fkey (
				id,
				app_key,
				title,
				image_url
			),
			usage,
			${NORMALIZED_REQUEST_USAGE_SELECT},
			cost_nanos,
			generation_ms,
			latency_ms,
			finish_reason,
			pricing_lines,
			provider_attempts,
                        success,
                        status_code,
                        error_code,
                        error_message,
                        error_payload,
                        detail_metadata,
                        key_id,
                        throughput
                `,
			{ count: "exact" }
		)
		.eq("workspace_id", workspaceId)
		.gte("created_at", params.timeRange.from)
		.lte("created_at", params.timeRange.to)
		.not("endpoint", "in", buildNotInFilter(LONG_RUNNING_REQUEST_ENDPOINTS));

	// Apply filters
	if (params.modelFilter) {
		query = query.eq("model_id", params.modelFilter);
	}
	if (params.providerFilter) {
		query = query.eq("provider", params.providerFilter);
	}
	if (params.appFilter) {
		query = query.eq("app_id", params.appFilter);
	}
	if (params.endpointFilter) {
		query = query.eq("endpoint", params.endpointFilter);
	}
	if (params.finishReasonFilter) {
		query = query.eq("finish_reason", params.finishReasonFilter);
	}
	if (params.streamFilter === "streaming") {
		query = query.eq("stream", true);
	} else if (params.streamFilter === "non_streaming") {
		query = query.eq("stream", false);
	}
	if (params.errorCodeFilter) {
		query = query.eq("error_code", params.errorCodeFilter);
	}
	if (typeof params.statusCodeFilter === "number") {
		query = query.eq("status_code", params.statusCodeFilter);
	}
	if (params.keyFilter) {
		query = query.eq("key_id", params.keyFilter);
	}
	if (params.requestFilter) {
		query = query.eq("request_id", params.requestFilter);
	}
	if (params.sessionFilter) {
		query = query.eq("session_id", params.sessionFilter);
	}
	if (params.statusFilter === "success") {
		query = query.eq("success", true);
	} else if (params.statusFilter === "error") {
		query = query.eq("success", false);
	}

	// Apply sorting
	const sortColumn = params.sortField || "created_at";
	query = query.order(sortColumn, { ascending: params.sortDirection === "asc" });

	// Apply pagination
	query = query.range(offset, offset + pageSize - 1);

	const { data, error, count } = await query;
	let rows = data as any[] | null;
	let totalCount = count ?? 0;
	if (error) {
		console.warn("Falling back after request app join failed:", error);
		// Fallback: retry without api_apps embedded relation.
		let fallback = supabase
			.from("gateway_requests")
			.select(
				`
                                request_id,
                                created_at,
                                endpoint,
                                model_id,
                                requested_model_id,
                                routed_model_id,
                                provider,
                                native_response_id,
                                stream,
                                session_id,
                                app_id,
				usage,
				${NORMALIZED_REQUEST_USAGE_SELECT},
				cost_nanos,
				generation_ms,
				latency_ms,
				finish_reason,
				pricing_lines,
				provider_attempts,
                                success,
                                status_code,
                                error_code,
                                error_message,
                                error_payload,
                                detail_metadata,
                                key_id,
                                throughput
                        `,
				{ count: "exact" },
			)
			.eq("workspace_id", workspaceId)
			.gte("created_at", params.timeRange.from)
			.lte("created_at", params.timeRange.to)
			.not("endpoint", "in", buildNotInFilter(LONG_RUNNING_REQUEST_ENDPOINTS));

		if (params.modelFilter) fallback = fallback.eq("model_id", params.modelFilter);
		if (params.providerFilter) fallback = fallback.eq("provider", params.providerFilter);
		if (params.appFilter) fallback = fallback.eq("app_id", params.appFilter);
		if (params.endpointFilter) fallback = fallback.eq("endpoint", params.endpointFilter);
		if (params.finishReasonFilter) {
			fallback = fallback.eq("finish_reason", params.finishReasonFilter);
		}
		if (params.streamFilter === "streaming") fallback = fallback.eq("stream", true);
		else if (params.streamFilter === "non_streaming") fallback = fallback.eq("stream", false);
		if (params.errorCodeFilter) fallback = fallback.eq("error_code", params.errorCodeFilter);
		if (typeof params.statusCodeFilter === "number") {
			fallback = fallback.eq("status_code", params.statusCodeFilter);
		}
		if (params.keyFilter) fallback = fallback.eq("key_id", params.keyFilter);
		if (params.requestFilter) fallback = fallback.eq("request_id", params.requestFilter);
		if (params.sessionFilter) fallback = fallback.eq("session_id", params.sessionFilter);
		if (params.statusFilter === "success") fallback = fallback.eq("success", true);
		else if (params.statusFilter === "error") fallback = fallback.eq("success", false);

		fallback = fallback
			.order(sortColumn, { ascending: params.sortDirection === "asc" })
			.range(offset, offset + pageSize - 1);

		const {
			data: fallbackData,
			error: fallbackError,
			count: fallbackCount,
		} = await fallback;
		if (fallbackError) {
			console.warn("Falling back after normalized request select failed:", fallbackError);
			let legacyFallback = supabase
				.from("gateway_requests")
				.select(
					`
					request_id,
                                        created_at,
                                        endpoint,
                                        model_id,
                                        requested_model_id,
                                        routed_model_id,
                                        provider,
                                        native_response_id,
                                        stream,
                                        session_id,
                                        app_id,
					usage,
					cost_nanos,
					generation_ms,
					latency_ms,
					finish_reason,
					pricing_lines,
					provider_attempts,
                                        success,
                                        status_code,
                                        error_code,
                                        error_message,
                                        error_payload,
                                        key_id,
                                        throughput
                                `,
					{ count: "exact" },
				)
				.eq("workspace_id", workspaceId)
				.gte("created_at", params.timeRange.from)
				.lte("created_at", params.timeRange.to)
				.not("endpoint", "in", buildNotInFilter(LONG_RUNNING_REQUEST_ENDPOINTS));
			if (params.modelFilter) legacyFallback = legacyFallback.eq("model_id", params.modelFilter);
			if (params.providerFilter) legacyFallback = legacyFallback.eq("provider", params.providerFilter);
			if (params.appFilter) legacyFallback = legacyFallback.eq("app_id", params.appFilter);
			if (params.endpointFilter) legacyFallback = legacyFallback.eq("endpoint", params.endpointFilter);
			if (params.finishReasonFilter) {
				legacyFallback = legacyFallback.eq("finish_reason", params.finishReasonFilter);
			}
			if (params.streamFilter === "streaming") {
				legacyFallback = legacyFallback.eq("stream", true);
			} else if (params.streamFilter === "non_streaming") {
				legacyFallback = legacyFallback.eq("stream", false);
			}
			if (params.errorCodeFilter) {
				legacyFallback = legacyFallback.eq("error_code", params.errorCodeFilter);
			}
			if (typeof params.statusCodeFilter === "number") {
				legacyFallback = legacyFallback.eq("status_code", params.statusCodeFilter);
			}
			if (params.keyFilter) legacyFallback = legacyFallback.eq("key_id", params.keyFilter);
			if (params.requestFilter) legacyFallback = legacyFallback.eq("request_id", params.requestFilter);
			if (params.sessionFilter) legacyFallback = legacyFallback.eq("session_id", params.sessionFilter);
			if (params.statusFilter === "success") legacyFallback = legacyFallback.eq("success", true);
			else if (params.statusFilter === "error") legacyFallback = legacyFallback.eq("success", false);
			const {
				data: legacyData,
				error: legacyError,
				count: legacyCount,
			} = await legacyFallback
				.order(sortColumn, { ascending: params.sortDirection === "asc" })
				.range(offset, offset + pageSize - 1);
			if (legacyError) {
				console.warn("Falling back after legacy request select failed:", legacyError);
				let minimalFallback = supabase
					.from("gateway_requests")
					.select(
						`
						request_id,
						created_at,
						endpoint,
						model_id,
						provider,
						stream,
						app_id,
						usage,
						cost_nanos,
						generation_ms,
						latency_ms,
						finish_reason,
						success,
						key_id
					`,
						{ count: "exact" },
					)
					.eq("workspace_id", workspaceId)
					.gte("created_at", params.timeRange.from)
					.lte("created_at", params.timeRange.to)
					.not("endpoint", "in", buildNotInFilter(LONG_RUNNING_REQUEST_ENDPOINTS));
				if (params.modelFilter) minimalFallback = minimalFallback.eq("model_id", params.modelFilter);
				if (params.providerFilter) minimalFallback = minimalFallback.eq("provider", params.providerFilter);
				if (params.appFilter) minimalFallback = minimalFallback.eq("app_id", params.appFilter);
				if (params.endpointFilter) minimalFallback = minimalFallback.eq("endpoint", params.endpointFilter);
				if (params.finishReasonFilter) {
					minimalFallback = minimalFallback.eq("finish_reason", params.finishReasonFilter);
				}
				if (params.streamFilter === "streaming") {
					minimalFallback = minimalFallback.eq("stream", true);
				} else if (params.streamFilter === "non_streaming") {
					minimalFallback = minimalFallback.eq("stream", false);
				}
				if (params.keyFilter) minimalFallback = minimalFallback.eq("key_id", params.keyFilter);
				if (params.requestFilter) minimalFallback = minimalFallback.eq("request_id", params.requestFilter);
				if (params.statusFilter === "success") minimalFallback = minimalFallback.eq("success", true);
				else if (params.statusFilter === "error") minimalFallback = minimalFallback.eq("success", false);

				let minimalData: any[] | null = null;
				let minimalError: unknown = null;
				let minimalCount: number | null = 0;
				try {
					const minimalResult = await minimalFallback
						.order(sortColumn, { ascending: params.sortDirection === "asc" })
						.range(offset, offset + pageSize - 1);
					minimalData = minimalResult.data as any[] | null;
					minimalError = minimalResult.error;
					minimalCount = minimalResult.count ?? 0;
				} catch (error) {
					minimalError = error;
				}
				if (minimalError) {
					console.warn("Unable to fetch paginated requests:", minimalError);
					return {
						data: [],
						total: 0,
						page: params.page,
						pageSize,
						totalPages: 0,
					};
				}
				rows = (minimalData as any[]) ?? [];
				totalCount = minimalCount ?? 0;
			} else {
				rows = (legacyData as any[]) ?? [];
				totalCount = legacyCount ?? 0;
			}
		} else {
			rows = (fallbackData as any[]) ?? [];
			totalCount = fallbackCount ?? 0;
		}
	}

	return {
		data: (rows ?? []).map((row) => toRequestRow(row)) ?? [],
		total: totalCount,
		page: params.page,
		pageSize,
		totalPages: Math.ceil((totalCount || 0) / pageSize),
	};
}

/**
 * Fetch organization colors for models
 * Returns a map of model_id -> organization color
 */
export async function fetchOrganizationColors(
	modelIds: string[]
): Promise<Map<string, string>> {
	return fetchOrganizationColorsCached(toLookupCacheKey(modelIds));
}

const fetchOrganizationColorsCached = cache(async (
	modelIdsKey: string
): Promise<Map<string, string>> => {
	const { supabase } = await requireAuthenticatedUser();
	const modelIds = modelIdsKey ? modelIdsKey.split("\n") : [];

	if (modelIds.length === 0) {
		return new Map();
	}

	const uniqueModelIds = normalizeLookupIds(modelIds);
	const colorMap = new Map<string, string>();
	const normalizeApiId = (id: string) => {
		const base = id.split(":")[0];
		const dotToDash = base.replace(/\./g, "-");
		const withoutOrg = id.includes("/") ? id.split("/").slice(1).join("/") : id;
		return Array.from(new Set([id, base, dotToDash, withoutOrg])).filter(Boolean);
	};

	// 1) Direct canonical model IDs -> org colors
	const { data: models } = await supabase
		.from("data_models")
		.select(
			`
			model_id,
			organisation_id,
			organisation:data_organisations!data_models_organisation_id_fkey(colour)
		`
		)
		.in("model_id", uniqueModelIds);

	if (models) {
		models.forEach((m: any) => {
			if (!m.organisation?.colour) return;
			const fullId = m.model_id;
			const color = m.organisation.colour;
			const organisationId =
				typeof m?.organisation_id === "string" && m.organisation_id.trim().length > 0
					? m.organisation_id.trim()
					: null;

			colorMap.set(fullId, color);
			if (organisationId) {
				colorMap.set(organisationId, color);
				colorMap.set(organisationId.toLowerCase(), color);
			}

			if (fullId.includes("/")) {
				const withoutOrg = fullId.split("/")[1];
				colorMap.set(withoutOrg, color);

				const baseName = withoutOrg.split("-").slice(0, -3).join("-");
				if (baseName && baseName !== withoutOrg) {
					colorMap.set(baseName, color);
				}
			}
		});
	}

	// 2) API model IDs -> canonical model IDs -> org colors
	const apiLookupIds = Array.from(
		new Set(uniqueModelIds.flatMap((id) => normalizeApiId(id))),
	);
	const { data: providerModels } = await supabase
		.from("data_api_provider_models")
		.select("api_model_id, model_id")
		.in("api_model_id", apiLookupIds);

	const providerModelIds = Array.from(
		new Set((providerModels ?? []).map((pm: any) => pm?.model_id).filter(Boolean)),
	);
	const { data: providerCanonicalModels } = providerModelIds.length
		? await supabase
				.from("data_models")
				.select(
					`
					model_id,
					organisation_id,
					organisation:data_organisations!data_models_organisation_id_fkey(colour)
				`,
				)
				.in("model_id", providerModelIds)
		: { data: [] as any[] };

	const colorByCanonicalModelId = new Map<string, string>();
	for (const model of providerCanonicalModels ?? []) {
		if (typeof model?.model_id !== "string") continue;
		const color =
			typeof model?.organisation?.colour === "string" ? model.organisation.colour : null;
		if (!color) continue;
		colorByCanonicalModelId.set(model.model_id, color);
		const organisationId =
			typeof model?.organisation_id === "string" && model.organisation_id.trim().length > 0
				? model.organisation_id.trim()
				: null;
		if (organisationId) {
			colorMap.set(organisationId, color);
			colorMap.set(organisationId.toLowerCase(), color);
		}
	}

	const providerApiIds = new Set<string>();
	if (providerModels) {
		providerModels.forEach((pm: any) => {
			const canonicalId =
				typeof pm?.model_id === "string" && pm.model_id.trim().length > 0
					? pm.model_id
					: null;
			const color = canonicalId ? colorByCanonicalModelId.get(canonicalId) ?? null : null;
			if (!color) return;
			const apiId = pm.api_model_id ?? null;

			if (apiId) {
				providerApiIds.add(apiId);
				colorMap.set(apiId, color);
			}
			if (apiId && apiId.includes(":")) {
				colorMap.set(apiId.split(":")[0], color);
			}
			if (apiId && apiId.includes("/")) {
				const withoutOrg = apiId.split("/")[1];
				if (withoutOrg) {
					colorMap.set(withoutOrg, color);
					if (withoutOrg.includes(":")) {
						colorMap.set(withoutOrg.split(":")[0], color);
					}
				}
			}
			if (canonicalId) colorMap.set(canonicalId, color);
		});
	}

	for (const id of uniqueModelIds) {
		if (colorMap.has(id)) continue;
		const variants = normalizeApiId(id);
		const match = variants.find((v) => colorMap.has(v));
		if (match) {
			colorMap.set(id, colorMap.get(match)!);
		}
	}

	void providerApiIds;

	return colorMap;
});

/**
 * Fetch model metadata for filters
 * Returns a map of model_id -> { organisationId, organisationName, modelName? }
 */
export async function fetchModelMetadata(
	modelIds: string[]
): Promise<
	Map<
		string,
		{
			organisationId: string;
			organisationName: string;
			modelName?: string;
		}
	>
> {
	return fetchModelMetadataCached(toLookupCacheKey(modelIds));
}

const fetchModelMetadataCached = cache(async (
	modelIdsKey: string
): Promise<
	Map<
		string,
		{
			organisationId: string;
			organisationName: string;
			modelName?: string;
		}
	>
> => {
	const { supabase } = await requireAuthenticatedUser();
	const metadataDebugEnabled =
		process.env.USAGE_MODEL_METADATA_DEBUG === "1" ||
		process.env.NEXT_PUBLIC_USAGE_MODEL_METADATA_DEBUG === "1";
	const metadataDebugEvents: Array<Record<string, unknown>> = [];
	const metadataDebugLog = (event: Record<string, unknown>) => {
		if (!metadataDebugEnabled) return;
		if (metadataDebugEvents.length < 300) {
			metadataDebugEvents.push(event);
		}
	};

	const modelIds = modelIdsKey ? modelIdsKey.split("\n") : [];

	if (modelIds.length === 0) {
		return new Map();
	}

	const uniqueModelIds = normalizeLookupIds(modelIds);
	const metadataMap = new Map<
		string,
		{
			organisationId: string;
			organisationName: string;
			modelName?: string;
		}
	>();

	const addMetadata = (
		key: string | null | undefined,
		value: {
			organisationId: string;
			organisationName: string;
			modelName?: string;
		},
		source?: string,
	) => {
		if (!key) return;
		const existing = metadataMap.get(key);
		if (!existing) {
			metadataMap.set(key, value);
			metadataDebugLog({
				stage: "add",
				source: source ?? "unknown",
				key,
				organisationId: value.organisationId,
				organisationName: value.organisationName,
				modelName: value.modelName ?? null,
				replaced: false,
			});
			return;
		}
		if (!existing.modelName && value.modelName) {
			metadataMap.set(key, { ...existing, modelName: value.modelName });
			metadataDebugLog({
				stage: "add",
				source: source ?? "unknown",
				key,
				organisationId: existing.organisationId,
				organisationName: existing.organisationName,
				modelName: value.modelName,
				replaced: true,
			});
		}
	};

	const normalizeApiId = (id: string) => {
		const variants = new Set<string>();
		const queue: string[] = [];

		const add = (value: string | null | undefined) => {
			const v = value?.trim();
			if (!v || variants.has(v)) return;
			variants.add(v);
			queue.push(v);
		};

		add(id);

		while (queue.length > 0) {
			const current = queue.shift()!;
			add(current.toLowerCase());
			add(current.replace(/\./g, "-"));
			if (current.includes("/")) {
				add(current.split("/").slice(1).join("/"));
			}
			if (current.includes(":")) {
				const parts = current.split(":");
				add(parts[0]);
			}
			if (/:free$/i.test(current)) {
				add(current.replace(/:free$/i, ""));
				add(current.replace(/:free$/i, "-free"));
			} else if (/-free$/i.test(current)) {
				add(current.replace(/-free$/i, ""));
				add(current.replace(/-free$/i, ":free"));
			} else {
				add(`${current}:free`);
				add(`${current}-free`);
			}
		}

		return Array.from(variants);
	};

	const deriveOrganisationId = (modelId: string | null | undefined) => {
		if (!modelId) return "unknown";
		const slashIndex = modelId.indexOf("/");
		if (slashIndex > 0) return modelId.slice(0, slashIndex);
		return modelId;
	};

	const { data: models } = await supabase
		.from("data_models")
		.select(
			`
			model_id,
			name,
			organisation_id,
			organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name)
		`
		)
		.in("model_id", uniqueModelIds);
	if (!models) {
		console.warn(
			"Usage metadata debug: no direct model metadata rows found for unique model IDs",
		);
	}

	if (models) {
		models.forEach((m: any) => {
			const organisationId =
				typeof m?.organisation?.organisation_id === "string" && m.organisation.organisation_id
					? m.organisation.organisation_id
					: typeof m?.organisation_id === "string" && m.organisation_id
						? m.organisation_id
						: deriveOrganisationId(m?.model_id);

			const organisationName =
				typeof m?.organisation?.name === "string" && m.organisation.name
					? m.organisation.name
					: organisationId;

			const value = {
				organisationId,
				organisationName,
				modelName: typeof m?.name === "string" ? m.name : undefined,
			};

			addMetadata(m?.model_id, value, "data_models:model_id");
			if (typeof m?.model_id === "string" && m.model_id.includes("/")) {
				const withoutOrg = m.model_id.split("/").slice(1).join("/");
				addMetadata(withoutOrg, value, "data_models:without_org");
			}
		});
	}

	// Resolve API model IDs -> canonical model IDs -> names/organisation metadata.
	const apiLookupIds = Array.from(
		new Set(uniqueModelIds.flatMap((id) => normalizeApiId(id))),
	);

	const { data: apiModels, error: apiModelsError } = await supabase
		.from("data_models")
		.select(
			`
			model_id,
			api_model_id,
			name,
			organisation_id,
			organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name)
		`,
		)
		.in("api_model_id", apiLookupIds);
	if (apiModelsError) {
		console.error(
			"Usage metadata debug: failed loading data_models by api_model_id",
			apiModelsError,
		);
	}

	for (const apiModel of apiModels ?? []) {
		const apiModelId =
			typeof apiModel?.api_model_id === "string" ? apiModel.api_model_id : null;
		if (!apiModelId) continue;
		const organisationRow = Array.isArray(apiModel?.organisation)
			? apiModel.organisation[0]
			: apiModel?.organisation;
		const organisationId =
			typeof organisationRow?.organisation_id === "string" &&
			organisationRow.organisation_id.trim().length > 0
				? organisationRow.organisation_id
				: typeof apiModel?.organisation_id === "string" &&
					  apiModel.organisation_id.trim().length > 0
				? apiModel.organisation_id
				: deriveOrganisationId(apiModelId);
		const organisationName =
			typeof organisationRow?.name === "string" &&
			organisationRow.name.trim().length > 0
				? organisationRow.name
				: organisationId;
		const modelName =
			typeof apiModel?.name === "string" && apiModel.name.trim().length > 0
				? apiModel.name
				: undefined;
		const value = { organisationId, organisationName, modelName };
		for (const variant of normalizeApiId(apiModelId)) {
			addMetadata(variant, value, `data_models:api_model_id:${apiModelId}`);
		}
		if (typeof apiModel?.model_id === "string" && apiModel.model_id.trim().length > 0) {
			addMetadata(apiModel.model_id, value, `data_models:model_id_from_api:${apiModelId}`);
		}
	}

	const providerModelSelect =
		"provider_api_model_id, api_model_id, model_id, internal_model_id, provider_model_slug";
	const [
		providerModelsByApiId,
		providerModelsByCanonicalId,
		providerModelsByInternalId,
		providerModelsBySlug,
	] = await Promise.all([
		supabase
			.from("data_api_provider_models")
			.select(providerModelSelect)
			.in("api_model_id", apiLookupIds),
		supabase
			.from("data_api_provider_models")
			.select(providerModelSelect)
			.in("model_id", apiLookupIds),
		supabase
			.from("data_api_provider_models")
			.select(providerModelSelect)
			.in("internal_model_id", apiLookupIds),
		supabase
			.from("data_api_provider_models")
			.select(providerModelSelect)
			.in("provider_model_slug", apiLookupIds),
	]);
	if (providerModelsByApiId.error) {
		console.error(
			"Usage metadata debug: failed loading provider models by api_model_id",
			providerModelsByApiId.error,
		);
	}
	if (providerModelsByCanonicalId.error) {
		console.error(
			"Usage metadata debug: failed loading provider models by model_id",
			providerModelsByCanonicalId.error,
		);
	}
	if (providerModelsByInternalId.error) {
		console.error(
			"Usage metadata debug: failed loading provider models by internal_model_id",
			providerModelsByInternalId.error,
		);
	}
	if (providerModelsBySlug.error) {
		console.error(
			"Usage metadata debug: failed loading provider models by provider_model_slug",
			providerModelsBySlug.error,
		);
	}

	const providerModelsMap = new Map<string, any>();
	for (const row of [
		...(providerModelsByApiId.data ?? []),
		...(providerModelsByCanonicalId.data ?? []),
		...(providerModelsByInternalId.data ?? []),
		...(providerModelsBySlug.data ?? []),
	]) {
		const id =
			typeof row?.provider_api_model_id === "string" && row.provider_api_model_id.trim().length > 0
				? row.provider_api_model_id
				: `${row?.api_model_id ?? ""}::${row?.model_id ?? ""}::${row?.provider_model_slug ?? ""}`;
		if (!providerModelsMap.has(id)) {
			providerModelsMap.set(id, row);
		}
	}
	const providerModels = Array.from(providerModelsMap.values());

	const canonicalIds = Array.from(
		new Set((providerModels ?? []).map((pm: any) => pm?.model_id).filter(Boolean)),
	);
	const canonicalInternalIds = Array.from(
		new Set((providerModels ?? []).map((pm: any) => pm?.internal_model_id).filter(Boolean)),
	);
	const canonicalApiIds = Array.from(
		new Set((providerModels ?? []).map((pm: any) => pm?.api_model_id).filter(Boolean)),
	);
	const canonicalModelIds = Array.from(
		new Set([...canonicalIds, ...canonicalInternalIds].filter(Boolean)),
	);
	const [canonicalModelsByIdResult, canonicalModelsByApiResult] = await Promise.all([
		canonicalModelIds.length
			? supabase
					.from("data_models")
					.select(
						`
						model_id,
						api_model_id,
						name,
						organisation_id,
						organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name)
					`,
					)
					.in("model_id", canonicalModelIds)
			: Promise.resolve({ data: [] as any[], error: null }),
		canonicalApiIds.length
			? supabase
					.from("data_models")
					.select(
						`
						model_id,
						api_model_id,
						name,
						organisation_id,
						organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, name)
					`,
					)
					.in("api_model_id", canonicalApiIds)
			: Promise.resolve({ data: [] as any[], error: null }),
	]);
	if (canonicalModelsByIdResult.error) {
		console.error(
			"Usage metadata debug: failed loading canonical models by model_id",
			canonicalModelsByIdResult.error,
		);
	}
	if (canonicalModelsByApiResult.error) {
		console.error(
			"Usage metadata debug: failed loading canonical models by api_model_id",
			canonicalModelsByApiResult.error,
		);
	}
	const canonicalModelMap = new Map<string, any>();
	for (const model of [
		...(canonicalModelsByIdResult.data ?? []),
		...(canonicalModelsByApiResult.data ?? []),
	]) {
		if (typeof model?.model_id === "string") {
			for (const variant of normalizeApiId(model.model_id)) {
				if (!canonicalModelMap.has(variant)) {
					canonicalModelMap.set(variant, model);
				}
			}
		}
		if (typeof model?.api_model_id === "string") {
			for (const variant of normalizeApiId(model.api_model_id)) {
				if (!canonicalModelMap.has(variant)) {
					canonicalModelMap.set(variant, model);
				}
			}
		}
	}

	if (providerModels.length > 0) {
		providerModels.forEach((pm: any) => {
			const apiId: string | null = typeof pm?.api_model_id === "string" ? pm.api_model_id : null;
			const canonicalId: string | null =
				typeof pm?.model_id === "string" ? pm.model_id : null;
			const internalModelId: string | null =
				typeof pm?.internal_model_id === "string" ? pm.internal_model_id : null;
			const providerModelSlug: string | null =
				typeof pm?.provider_model_slug === "string" ? pm.provider_model_slug : null;
			const metadataCandidates = [
				apiId,
				canonicalId,
				internalModelId,
				providerModelSlug,
			].filter(Boolean) as string[];
			if (metadataCandidates.length === 0) return;
			const canonicalModel =
				metadataCandidates
					.flatMap((candidate) => normalizeApiId(candidate))
					.map((candidate) => canonicalModelMap.get(candidate))
					.find(Boolean) ?? null;

			const matchedMetadataKey = metadataCandidates
				.flatMap((candidate) => normalizeApiId(candidate))
				.find((candidate) => metadataMap.has(candidate));
			const matchedMetadata = matchedMetadataKey
				? metadataMap.get(matchedMetadataKey)
				: null;
			const fallbackSourceId =
				canonicalId ?? internalModelId ?? apiId ?? providerModelSlug;
			const hasTrustedOrigin = Boolean(canonicalModel || matchedMetadata);
			const isUntrustedDerivedOrigin =
				!hasTrustedOrigin &&
				typeof fallbackSourceId === "string" &&
				!fallbackSourceId.includes("/");
			if (isUntrustedDerivedOrigin) {
				metadataDebugLog({
					stage: "provider_resolution_skipped",
					apiId,
					canonicalId,
					internalModelId,
					providerModelSlug,
					reason: "untrusted_derived_origin",
				});
				return;
			}

			const organisationId =
				typeof canonicalModel?.organisation?.organisation_id === "string" &&
				canonicalModel.organisation.organisation_id
					? canonicalModel.organisation.organisation_id
					: matchedMetadata?.organisationId ??
						deriveOrganisationId(fallbackSourceId);

			const organisationName =
				typeof canonicalModel?.organisation?.name === "string" &&
				canonicalModel.organisation.name
					? canonicalModel.organisation.name
					: matchedMetadata?.organisationName ?? organisationId;

			const value = {
				organisationId,
				organisationName,
				modelName:
					typeof canonicalModel?.name === "string" && canonicalModel.name.trim().length > 0
						? canonicalModel.name
						: matchedMetadata?.modelName,
			};

			for (const candidate of metadataCandidates) {
				for (const variant of normalizeApiId(candidate)) {
					addMetadata(
						variant,
						value,
						`provider_models:${apiId ?? "null"}:${canonicalId ?? "null"}:${providerModelSlug ?? "null"}`,
					);
				}
			}
			metadataDebugLog({
				stage: "provider_resolution",
				apiId,
				canonicalId,
				internalModelId,
				providerModelSlug,
				matchedMetadataKey: matchedMetadataKey ?? null,
				chosenOrganisationId: value.organisationId,
				chosenOrganisationName: value.organisationName,
				chosenModelName: value.modelName ?? null,
				candidates: metadataCandidates,
			});
		});
	}

	for (const id of uniqueModelIds) {
		if (metadataMap.has(id)) continue;
		const variants = normalizeApiId(id);
		const match = variants.find((variant) => metadataMap.has(variant));
		if (match) {
			metadataMap.set(id, metadataMap.get(match)!);
			metadataDebugLog({
				stage: "finalize",
				modelId: id,
				matchedVariant: match,
				resolution: metadataMap.get(match) ?? null,
			});
		} else {
			metadataDebugLog({
				stage: "finalize",
				modelId: id,
				matchedVariant: null,
				resolution: null,
			});
		}
	}

	if (metadataDebugEnabled) {
		const summary = uniqueModelIds.map((id) => {
			const variants = normalizeApiId(id);
			const matchedVariant = variants.find((variant) => metadataMap.has(variant)) ?? null;
			const resolved = matchedVariant ? metadataMap.get(matchedVariant) ?? null : null;
			return {
				modelId: id,
				matchedVariant,
				organisationId: resolved?.organisationId ?? null,
				organisationName: resolved?.organisationName ?? null,
				modelName: resolved?.modelName ?? null,
			};
		});
		console.log(
			"Usage metadata debug summary",
			JSON.stringify(
				{
					inputCount: uniqueModelIds.length,
					apiLookupCount: apiLookupIds.length,
					apiModelsCount: apiModels?.length ?? 0,
					providerModelsCount: providerModels.length,
					summary,
					events: metadataDebugEvents,
				},
				null,
				2,
			),
		);
	}

	return metadataMap;
});
/**
 * Fetch provider names for display labels
 * Returns a map of provider_id -> provider name
 */
export async function fetchProviderNames(
	providerIds: string[]
): Promise<Map<string, string>> {
	return fetchProviderNamesCached(toLookupCacheKey(providerIds));
}

const fetchProviderNamesCached = cache(async (
	providerIdsKey: string
): Promise<Map<string, string>> => {
	const { supabase } = await requireAuthenticatedUser();
	const providerIds = providerIdsKey ? providerIdsKey.split("\n") : [];

	if (providerIds.length === 0) {
		return new Map();
	}

	const uniqueProviderIds = normalizeLookupIds(providerIds);
	const { data: providers } = await supabase
		.from("data_api_providers")
		.select("api_provider_id, api_provider_name")
		.in("api_provider_id", uniqueProviderIds);

	const providerNameMap = new Map<string, string>();

	if (providers) {
		providers.forEach((provider: any) => {
			if (!provider?.api_provider_id) return;
			providerNameMap.set(
				provider.api_provider_id,
				provider.api_provider_name || provider.api_provider_id
			);
		});
	}

	return providerNameMap;
});

export type ProviderMetadataEntry = {
	name: string;
	promptTrainingPolicy: string | null;
};

export async function fetchProviderMetadata(
	providerIds: string[]
): Promise<Map<string, ProviderMetadataEntry>> {
	return fetchProviderMetadataCached(toLookupCacheKey(providerIds));
}

const fetchProviderMetadataCached = cache(async (
	providerIdsKey: string
): Promise<Map<string, ProviderMetadataEntry>> => {
	const { supabase } = await requireAuthenticatedUser();
	const providerIds = providerIdsKey ? providerIdsKey.split("\n") : [];

	if (providerIds.length === 0) {
		return new Map();
	}

	const uniqueProviderIds = normalizeLookupIds(providerIds);
	const { data: providers } = await supabase
		.from("data_api_providers")
		.select("api_provider_id, api_provider_name, prompt_training_policy")
		.in("api_provider_id", uniqueProviderIds);

	const providerMetadataMap = new Map<string, ProviderMetadataEntry>();

	if (providers) {
		providers.forEach((provider: any) => {
			if (!provider?.api_provider_id) return;
			providerMetadataMap.set(provider.api_provider_id, {
				name: provider.api_provider_name || provider.api_provider_id,
				promptTrainingPolicy:
					typeof provider.prompt_training_policy === "string"
						? provider.prompt_training_policy
						: null,
			});
		});
	}

	return providerMetadataMap;
});

/**
 * Fetch fun stats and insights
 */
export interface FunStatsResult {
	topModel: { name: string; requests: number } | null;
	topProvider: { name: string; requests: number } | null;
	mostExpensive: { name: string; cost: number } | null;
	fastestModel: { name: string; speedMs: number } | null;
}

export async function fetchFunStats(
	timeRange: { from: string; to: string }
): Promise<FunStatsResult> {
	const supabase = await createClient();
	const { workspaceId } = await requireAuthedTeamContext(supabase);

	if (!workspaceId) {
		return {
			topModel: null,
			topProvider: null,
			mostExpensive: null,
			fastestModel: null,
		};
	}

	const { data: rows } = await supabase
		.from("gateway_usage_rollup_15m_workspace_provider_model")
		.select(
			"canonical_model_id, provider, requests, total_cost_nanos, latency_sum_ms, latency_samples",
		)
		.eq("workspace_id", workspaceId)
		.gte("bucket_15m", timeRange.from)
		.lte("bucket_15m", timeRange.to);

	if (!rows || rows.length === 0) {
		return {
			topModel: null,
			topProvider: null,
			mostExpensive: null,
			fastestModel: null,
		};
	}

	// Top model by requests
	const modelCounts = new Map<string, number>();
	rows.forEach((r: any) => {
		const model = r.canonical_model_id || "unknown";
		const requests = Number(r.requests ?? 0) || 0;
		modelCounts.set(model, (modelCounts.get(model) || 0) + requests);
	});
	const topModelEntry = Array.from(modelCounts.entries()).sort((a, b) => b[1] - a[1])[0];
	const topModel = topModelEntry
		? { name: topModelEntry[0], requests: topModelEntry[1] }
		: null;

	// Top provider by requests
	const providerCounts = new Map<string, number>();
	rows.forEach((r: any) => {
		const provider = r.provider || "unknown";
		const requests = Number(r.requests ?? 0) || 0;
		providerCounts.set(provider, (providerCounts.get(provider) || 0) + requests);
	});
	const topProviderEntry = Array.from(providerCounts.entries()).sort((a, b) => b[1] - a[1])[0];
	const topProvider = topProviderEntry
		? { name: topProviderEntry[0], requests: topProviderEntry[1] }
		: null;

	// Most expensive model
	const modelCosts = new Map<string, number>();
	rows.forEach((r: any) => {
		const model = r.canonical_model_id || "unknown";
		const cost = Number(r.total_cost_nanos ?? 0) / 1e9;
		modelCosts.set(model, (modelCosts.get(model) || 0) + cost);
	});
	const mostExpensiveEntry = Array.from(modelCosts.entries()).sort((a, b) => b[1] - a[1])[0];
	const mostExpensive = mostExpensiveEntry
		? { name: mostExpensiveEntry[0], cost: mostExpensiveEntry[1] }
		: null;

	// Fastest model (average latency)
	const modelLatencySums = new Map<string, { sum: number; samples: number }>();
	rows.forEach((r: any) => {
		const model = r.canonical_model_id || "unknown";
		const latencySum = Number(r.latency_sum_ms ?? 0) || 0;
		const latencySamples = Number(r.latency_samples ?? 0) || 0;
		if (latencySamples <= 0 || latencySum <= 0) return;
		const current = modelLatencySums.get(model) ?? { sum: 0, samples: 0 };
		current.sum += latencySum;
		current.samples += latencySamples;
		modelLatencySums.set(model, current);
	});
	const modelAvgLatencies = Array.from(modelLatencySums.entries())
		.map(([model, values]) => ({
			model,
			avg: values.samples > 0 ? values.sum / values.samples : Number.POSITIVE_INFINITY,
		}))
		.filter((entry) => Number.isFinite(entry.avg) && entry.avg > 0)
		.sort((a, b) => a.avg - b.avg);
	const fastestModel = modelAvgLatencies[0]
		? { name: modelAvgLatencies[0].model, speedMs: Math.round(modelAvgLatencies[0].avg) }
		: null;

	return {
		topModel,
		topProvider,
		mostExpensive,
		fastestModel,
	};
}

/**
 * Fetch app names
 * Returns a map of app_id -> app title
 */
export async function fetchAppNames(appIds: string[]): Promise<Map<string, string>> {
	return fetchAppNamesCached(toLookupCacheKey(appIds));
}

const fetchAppNamesCached = cache(async (
	appIdsKey: string
): Promise<Map<string, string>> => {
	const supabase = await createClient();
	const { workspaceId } = await requireAuthedTeamContext(supabase);
	const appIds = appIdsKey ? appIdsKey.split("\n") : [];

	if (!workspaceId || appIds.length === 0) {
		return new Map();
	}

	const uniqueAppIds = normalizeLookupIds(appIds);
	const { data: apps } = await supabase
		.from("api_apps")
		.select("id, title")
		.eq("workspace_id", workspaceId)
		.in("id", uniqueAppIds);

	const appMap = new Map<string, string>();

	if (apps) {
		apps.forEach((app: any) => {
			appMap.set(app.id, app.title);
		});
	}

	return appMap;
});

/**
 * Investigate a generation by request_id
 * Uses team authentication - no API key required
 */
export async function investigateGeneration(
	requestId: string
): Promise<{
	success: boolean;
	data?: InvestigateGenerationResult;
	error?: string;
}> {
	const supabase = await createClient();
	const { workspaceId } = await requireAuthedTeamContext(supabase);

	if (!workspaceId) {
		return {
			success: false,
			error: "Not authenticated",
		};
	}

	if (!requestId.trim()) {
		return {
			success: false,
			error: "Request ID required",
		};
	}

	const trimmedRequestId = requestId.trim();
	const requestSelect = `
		request_id,
		created_at,
		endpoint,
		model_id,
		provider,
		native_response_id,
		stream,
		session_id,
		app_id,
		app:api_apps!gateway_requests_app_id_fkey (
			id,
			app_key,
			title,
			image_url
		),
		usage,
		${NORMALIZED_REQUEST_USAGE_SELECT},
		cost_nanos,
		generation_ms,
		latency_ms,
		finish_reason,
		success,
		status_code,
		error_code,
		error_message,
		key_id,
		pricing_lines,
		throughput,
		provider_attempts
	`;

	const { data, error } = await supabase
		.from("gateway_requests")
		.select(requestSelect)
		.eq("workspace_id", workspaceId)
		.eq("request_id", trimmedRequestId)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) {
		console.error("Error fetching investigated request (with app join):", error);
		const { data: fallbackData, error: fallbackError } = await supabase
			.from("gateway_requests")
			.select(
				`
				request_id,
				created_at,
				endpoint,
				model_id,
				provider,
				native_response_id,
				stream,
				session_id,
				app_id,
				usage,
				cost_nanos,
				generation_ms,
				latency_ms,
				finish_reason,
				success,
				status_code,
				error_code,
				error_message,
				key_id,
				pricing_lines,
				throughput,
				provider_attempts
			`,
			)
			.eq("workspace_id", workspaceId)
			.eq("request_id", trimmedRequestId)
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle();

		if (fallbackError) {
			if (fallbackError.code === "PGRST116") {
				return {
					success: false,
					error: "Request not found or not authorized",
				};
			}
			return {
				success: false,
				error: fallbackError.message || "Failed to fetch request",
			};
		}

		if (!fallbackData) {
			return {
				success: false,
				error: "Request not found or not authorized",
			};
		}

		const request = toRequestRow(fallbackData);
		const providerIds = Array.from(
			new Set(
				[
					request.provider,
					...request.provider_attempts.map((attempt) => attempt.provider),
				].filter(
					(value): value is string =>
					typeof value === "string" && value.trim().length > 0,
				),
			),
		);
		const [appMetadata, modelMetadata, providerNames, providerMetadata] =
			await Promise.all([
				request.app_id
					? fetchAppMetadata([request.app_id])
					: Promise.resolve(new Map<string, { title: string }>()),
				request.model_id
					? fetchModelMetadata([request.model_id])
					: Promise.resolve(new Map<string, SerializableModelMetadataEntry>()),
				fetchProviderNames(providerIds),
				fetchProviderMetadata(providerIds),
			]);
		const appName = request.app_id
			? appMetadata.get(request.app_id)?.title ?? null
			: null;

		return {
			success: true,
			data: {
				request,
				appName,
				modelMetadata: Array.from(modelMetadata.entries()),
				providerNames: Array.from(providerNames.entries()),
				providerMetadata: Array.from(providerMetadata.entries()),
			},
		};
	}

	if (!data) {
		return {
			success: false,
			error: "Request not found or not authorized",
		};
	}

	const request = toRequestRow(data);
	const providerIds = Array.from(
		new Set(
			[
				request.provider,
				...request.provider_attempts.map((attempt) => attempt.provider),
			].filter(
				(value): value is string =>
				typeof value === "string" && value.trim().length > 0,
			),
		),
	);
	const [appMetadata, modelMetadata, providerNames, providerMetadata] =
		await Promise.all([
			typeof request.app_title === "string" && request.app_title.trim().length > 0
				? Promise.resolve(new Map<string, { title: string }>())
				: request.app_id
					? fetchAppMetadata([request.app_id])
					: Promise.resolve(new Map<string, { title: string }>()),
			request.model_id
				? fetchModelMetadata([request.model_id])
				: Promise.resolve(new Map<string, SerializableModelMetadataEntry>()),
			fetchProviderNames(providerIds),
			fetchProviderMetadata(providerIds),
		]);
	const resolvedAppName =
		typeof request.app_title === "string" && request.app_title.trim().length > 0
			? request.app_title.trim()
			: request.app_id
				? appMetadata.get(request.app_id)?.title ?? null
				: null;

	return {
		success: true,
		data: {
			request,
			appName: resolvedAppName,
			modelMetadata: Array.from(modelMetadata.entries()),
			providerNames: Array.from(providerNames.entries()),
			providerMetadata: Array.from(providerMetadata.entries()),
		},
	};
}

/**
 * Fetch chart data grouped by provider
 * Returns data for requests, tokens, and cost metrics
 */
export interface ChartDataParams {
	timeRange: { from: string; to: string };
	range: "1h" | "1d" | "1w" | "1m" | "1y";
	keyFilter?: string | null;
	forceLive?: boolean;
}

export interface ProviderMetrics {
	requests: number;
	tokens: number;
	cost: number;
	models: Map<string, { requests: number; tokens: number; cost: number }>;
}

export interface ChartDataPoint {
	bucket: string;
	[provider: string]: number | string;
}

export interface ChartDataResult {
	// Chart data grouped by provider
	requestsChart: ChartDataPoint[];
	tokensChart: ChartDataPoint[];
	costChart: ChartDataPoint[];
	// Provider breakdown with model details
	providerBreakdown: Map<string, ProviderMetrics>;
	// Totals and averages
	totals: {
		requests: { current: number; previous: number; avg: number };
		tokens: { current: number; previous: number; avg: number };
		cost: { current: number; previous: number; avg: number };
	};
}

export async function fetchChartData(
	params: ChartDataParams
): Promise<ChartDataResult> {
	const supabase = await createClient();
	const { workspaceId } = await requireAuthedTeamContext(supabase);

	if (!workspaceId) {
		return {
			requestsChart: [],
			tokensChart: [],
			costChart: [],
			providerBreakdown: new Map(),
			totals: {
				requests: { current: 0, previous: 0, avg: 0 },
				tokens: { current: 0, previous: 0, avg: 0 },
				cost: { current: 0, previous: 0, avg: 0 },
			},
		};
	}

	const bucketKey = (() => {
		if (params.range === "1h") return "5min";
		if (params.range === "1d") return "hour";
		if (params.range === "1y") return "month";
		return "day";
	})();

	const toFiniteNumber = (value: unknown): number => {
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string" && value.trim().length > 0) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
		return 0;
	};

	const usageTokens = (usage: unknown): number => {
		if (!usage || typeof usage !== "object" || Array.isArray(usage)) return 0;
		const usageRecord = usage as Record<string, unknown>;
		const totalTokens = toFiniteNumber(usageRecord.total_tokens);
		if (totalTokens > 0) return totalTokens;
		const inputTokens = toFiniteNumber(
			usageRecord.input_tokens ?? usageRecord.input_text_tokens ?? usageRecord.prompt_tokens,
		);
		const outputTokens = toFiniteNumber(
			usageRecord.output_tokens ??
				usageRecord.output_text_tokens ??
				usageRecord.completion_tokens,
		);
		return inputTokens + outputTokens;
	};

	const floorToRollupBucket = (date: Date, bucket: string): Date => {
		const d = new Date(date);
		if (bucket === "5min") {
			d.setSeconds(0, 0);
			d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
			return d;
		}
		if (bucket === "hour") {
			d.setMinutes(0, 0, 0);
			return d;
		}
		if (bucket === "day") {
			d.setHours(0, 0, 0, 0);
			return d;
		}
		d.setDate(1);
		d.setHours(0, 0, 0, 0);
		return d;
	};

	const fetchGatewayRequestFallbackRows = async (
		fromIso: string,
		toIso: string,
	): Promise<any[]> => {
		const pageSize = 1000;
		const maxPages = 20;
		const merged = new Map<
			string,
			{
				bucket: string;
				provider: string;
				model_id: string;
				requests: number;
				tokens: number;
				cost: number;
			}
		>();

		for (let page = 0; page < maxPages; page += 1) {
			const from = page * pageSize;
			const to = from + pageSize - 1;
			let query = supabase
				.from("gateway_requests")
				.select("created_at, provider, model_id, usage, cost_nanos")
				.eq("workspace_id", workspaceId)
				.eq("success", true)
				.gte("created_at", fromIso)
				.lte("created_at", toIso)
				.order("created_at", { ascending: true })
				.range(from, to);

			if (params.keyFilter) {
				query = query.eq("key_id", params.keyFilter);
			}

			const { data, error } = await query;
			if (error) {
				console.error("Error fetching gateway request usage fallback:", error);
				return [];
			}

			const batch = data ?? [];
			for (const row of batch as any[]) {
				const createdAt =
					typeof row?.created_at === "string" ? new Date(row.created_at) : null;
				if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
				const bucketDate = floorToRollupBucket(createdAt, bucketKey);
				const bucketIso = bucketDate.toISOString();
				const provider =
					typeof row?.provider === "string" && row.provider.trim().length > 0
						? row.provider.trim()
						: "unknown";
				const modelId =
					typeof row?.model_id === "string" && row.model_id.trim().length > 0
						? row.model_id.trim()
						: "unknown";
				const rowTokens = usageTokens(row?.usage);
				const rowCost = toFiniteNumber(row?.cost_nanos) / 1e9;
				const key = `${bucketIso}::${provider}::${modelId}`;
				const existing = merged.get(key);
				if (!existing) {
					merged.set(key, {
						bucket: bucketIso,
						provider,
						model_id: modelId,
						requests: 1,
						tokens: rowTokens,
						cost: rowCost,
					});
					continue;
				}
				existing.requests += 1;
				existing.tokens += rowTokens;
				existing.cost += rowCost;
			}

			if (batch.length < pageSize) {
				break;
			}
		}

		return Array.from(merged.values()).sort(
			(a, b) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime(),
		);
	};

	const mergeUsageRows = (baseRows: any[], liveRows: any[]): any[] => {
		const toKey = (row: any) =>
			`${row?.bucket ?? ""}::${row?.provider ?? "unknown"}::${row?.model_id ?? "unknown"}`;
		const merged = new Map<string, any>();
		for (const row of baseRows) {
			merged.set(toKey(row), row);
		}
		for (const row of liveRows) {
			// Prefer live values for overlapping bucket/provider/model keys.
			merged.set(toKey(row), row);
		}
		return Array.from(merged.values()).sort(
			(a, b) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime(),
		);
	};

	// Fetch current period data (aggregated)
	const { data: rows, error: rollupError } = await supabase.rpc(
		"get_usage_chart_rollup",
		{
			p_team: workspaceId,
			p_from: params.timeRange.from,
			p_to: params.timeRange.to,
			p_bucket: bucketKey,
			p_key_id: params.keyFilter ?? null,
		},
	);
	if (rollupError) {
		console.error("Error fetching usage rollup:", rollupError);
	}

	// Fetch previous period for comparison (aggregated)
	const fromDate = new Date(params.timeRange.from);
	const toDate = new Date(params.timeRange.to);
	const windowMs = toDate.getTime() - fromDate.getTime();
	const prevFrom = new Date(fromDate.getTime() - windowMs).toISOString();
	const prevTo = fromDate.toISOString();
	const { data: prevRows, error: prevError } = await supabase.rpc(
		"get_usage_chart_rollup",
		{
			p_team: workspaceId,
			p_from: prevFrom,
			p_to: prevTo,
			p_bucket: bucketKey,
			p_key_id: params.keyFilter ?? null,
		},
	);
	if (prevError) {
		console.error("Error fetching usage rollup (prev):", prevError);
	}
	let currentRows = (rows ?? []) as any[];
	if (params.forceLive) {
		const liveRows = await fetchGatewayRequestFallbackRows(
			params.timeRange.from,
			params.timeRange.to,
		);
		if (liveRows.length > 0) {
			currentRows = mergeUsageRows(currentRows, liveRows);
		} else if (ENABLE_GATEWAY_USAGE_RAW_FALLBACK && currentRows.length === 0) {
			currentRows = liveRows;
		}
	} else if (ENABLE_GATEWAY_USAGE_RAW_FALLBACK && currentRows.length === 0) {
		currentRows = await fetchGatewayRequestFallbackRows(
			params.timeRange.from,
			params.timeRange.to,
		);
	}
	let previousRows = (prevRows ?? []) as any[];
	if (ENABLE_GATEWAY_USAGE_RAW_FALLBACK && previousRows.length === 0) {
		previousRows = await fetchGatewayRequestFallbackRows(prevFrom, prevTo);
	}


	// Helper functions
	function bucketFor(d: Date, range: string): string {
		const pad = (n: number) => String(n).padStart(2, "0");
		if (range === "1h") {
			const minutes = Math.floor(d.getMinutes() / 5) * 5;
			return `${pad(d.getHours())}:${pad(minutes)}`;
		}
		if (range === "1d") return `${pad(d.getHours())}:00`;
		if (range === "1m" || range === "1w")
			return d.toLocaleDateString(undefined, {
				month: "short",
				day: "2-digit",
			});
		return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
	}

	function floorToBucketStart(date: Date, range: string): Date {
		const d = new Date(date);
		if (range === "1h") {
			d.setSeconds(0, 0);
			d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
			return d;
		}
		if (range === "1d") {
			d.setMinutes(0, 0, 0);
			return d;
		}
		if (range === "1m" || range === "1w") {
			d.setHours(0, 0, 0, 0);
			return d;
		}
		d.setDate(1);
		d.setHours(0, 0, 0, 0);
		return d;
	}

	function advanceBucket(date: Date, range: string) {
		if (range === "1h") {
			date.setMinutes(date.getMinutes() + 5);
			return;
		}
		if (range === "1d") {
			date.setHours(date.getHours() + 1);
			return;
		}
		if (range === "1m" || range === "1w") {
			date.setDate(date.getDate() + 1);
			return;
		}
		date.setMonth(date.getMonth() + 1);
	}

	function buildExpectedBuckets(fromIso: string, toIso: string, range: string): string[] {
		const from = new Date(fromIso);
		const to = new Date(toIso);
		const cursor = floorToBucketStart(from, range);
		const labels: string[] = [];
		let safety = 0;
		while (cursor.getTime() <= to.getTime() && safety < 10000) {
			labels.push(bucketFor(cursor, range));
			advanceBucket(cursor, range);
			safety += 1;
		}
		return labels;
	}

	// Build provider breakdown and chart data
	const providerBreakdown = new Map<string, ProviderMetrics>();
	const requestsBuckets = new Map<string, Map<string, number>>();
	const tokensBuckets = new Map<string, Map<string, number>>();
	const costBuckets = new Map<string, Map<string, number>>();
	const expectedBuckets = buildExpectedBuckets(
		params.timeRange.from,
		params.timeRange.to,
		params.range,
	);

	for (const bucket of expectedBuckets) {
		requestsBuckets.set(bucket, new Map());
		tokensBuckets.set(bucket, new Map());
		costBuckets.set(bucket, new Map());
	}

	currentRows.forEach((row: any) => {
		const provider = row.provider || "unknown";
		const modelId = row.model_id || "unknown";
		const bucket = bucketFor(new Date(row.bucket), params.range);
		const requests = Number(row.requests ?? 0) || 0;
		const tokens = Number(row.tokens ?? 0) || 0;
		const cost = Number(row.cost ?? 0) || 0;

		// Update provider breakdown
		if (!providerBreakdown.has(provider)) {
			providerBreakdown.set(provider, {
				requests: 0,
				tokens: 0,
				cost: 0,
				models: new Map(),
			});
		}

		const providerMetrics = providerBreakdown.get(provider)!;
		providerMetrics.requests += requests;
		providerMetrics.tokens += tokens;
		providerMetrics.cost += cost;

		if (!providerMetrics.models.has(modelId)) {
			providerMetrics.models.set(modelId, { requests: 0, tokens: 0, cost: 0 });
		}

		const modelMetrics = providerMetrics.models.get(modelId)!;
		modelMetrics.requests += requests;
		modelMetrics.tokens += tokens;
		modelMetrics.cost += cost;

		// Update chart buckets (group by MODEL instead of provider for correct colors)
		if (!requestsBuckets.has(bucket)) requestsBuckets.set(bucket, new Map());
		if (!tokensBuckets.has(bucket)) tokensBuckets.set(bucket, new Map());
		if (!costBuckets.has(bucket)) costBuckets.set(bucket, new Map());

		const reqBucket = requestsBuckets.get(bucket)!;
		const tokBucket = tokensBuckets.get(bucket)!;
		const costBucket = costBuckets.get(bucket)!;

		reqBucket.set(modelId, (reqBucket.get(modelId) || 0) + requests);
		tokBucket.set(modelId, (tokBucket.get(modelId) || 0) + tokens);
		costBucket.set(modelId, (costBucket.get(modelId) || 0) + cost);
	});

	// Convert to chart format (now using model_id as keys for correct org colors)
	const requestsChart = Array.from(requestsBuckets.entries()).map(([bucket, models]) => {
		const row: any = { bucket };
		models.forEach((value, modelId) => {
			row[modelId] = value;
		});
		return row;
	});

	const tokensChart = Array.from(tokensBuckets.entries()).map(([bucket, models]) => {
		const row: any = { bucket };
		models.forEach((value, modelId) => {
			row[modelId] = value;
		});
		return row;
	});

	const costChart = Array.from(costBuckets.entries()).map(([bucket, models]) => {
		const row: any = { bucket };
		models.forEach((value, modelId) => {
			row[modelId] = value;
		});
		return row;
	});

	// Calculate totals
	const currentRequests = currentRows.reduce(
		(sum: number, r: any) => sum + (Number(r.requests ?? 0) || 0),
		0,
	);
	const currentTokens = currentRows.reduce(
		(sum: number, r: any) => sum + (Number(r.tokens ?? 0) || 0),
		0,
	);
	const currentCost = currentRows.reduce(
		(sum: number, r: any) => sum + (Number(r.cost ?? 0) || 0),
		0,
	);

	const previousRequests = previousRows.reduce(
		(sum: number, r: any) => sum + (Number(r.requests ?? 0) || 0),
		0,
	);
	const previousTokens = previousRows.reduce(
		(sum: number, r: any) => sum + (Number(r.tokens ?? 0) || 0),
		0,
	);
	const previousCost = previousRows.reduce(
		(sum: number, r: any) => sum + (Number(r.cost ?? 0) || 0),
		0,
	);

	const bucketCount = requestsChart.length || 1;
	const avgRequests = currentRequests / bucketCount;
	const avgTokens = currentTokens / bucketCount;
	const avgCost = currentCost / bucketCount;

	return {
		requestsChart,
		tokensChart,
		costChart,
		providerBreakdown,
		totals: {
			requests: { current: currentRequests, previous: previousRequests, avg: avgRequests },
			tokens: { current: currentTokens, previous: previousTokens, avg: avgTokens },
			cost: { current: currentCost, previous: previousCost, avg: avgCost },
		},
	};
}

export interface SessionRollupParams {
	timeRange: { from: string; to: string };
	limit?: number;
	offset?: number;
	appId?: string | null;
	modelId?: string | null;
	provider?: string | null;
	sessionId?: string | null;
}

export interface SessionRollupRow {
	session_id: string;
	request_count: number;
	total_cost_nanos: number;
	total_cost_usd: number;
	first_request_at: string;
	last_request_at: string;
	app_ids: string[] | null;
	model_ids: string[] | null;
	provider_ids: string[] | null;
	end_user_ids: string[] | null;
	app_counts?: Array<{ app_id: string; request_count: number }>;
	model_counts?: Array<{ model_id: string; request_count: number }>;
}

type SessionRollupSourceRow = {
	session_id: string | null;
	created_at: string | null;
	cost_nanos: number | string | null;
	app_id: string | null;
	model_id: string | null;
	provider: string | null;
	end_user_id: string | null;
};

async function fetchSessionRollupsFallback(args: {
	supabase: Awaited<ReturnType<typeof createClient>>;
	workspaceId: string;
	params: SessionRollupParams;
}): Promise<SessionRollupRow[]> {
	const { supabase, workspaceId, params } = args;
	const requestedLimit = Math.max(1, Math.min(params.limit ?? 100, 500));
	const requestedOffset = Math.max(0, params.offset ?? 0);
	const rowLimit = Math.max(2000, Math.min((requestedOffset + requestedLimit) * 50, 5000));

	let query = supabase
		.from("gateway_requests")
		.select(
			"session_id, created_at, cost_nanos, app_id, model_id, provider, end_user_id",
		)
		.eq("workspace_id", workspaceId)
		.not("session_id", "is", null)
		.gte("created_at", params.timeRange.from)
		.lte("created_at", params.timeRange.to)
		.order("created_at", { ascending: false })
		.limit(rowLimit);

	if (params.appId) {
		query = query.eq("app_id", params.appId);
	}
	if (params.modelId) {
		query = query.eq("model_id", params.modelId);
	}
	if (params.provider) {
		query = query.eq("provider", params.provider);
	}
	if (params.sessionId) {
		query = query.eq("session_id", params.sessionId);
	}

	const { data, error } = await query;
	if (error) {
		console.error("Error fetching session rollups fallback:", error);
		return [];
	}

	const grouped = new Map<
		string,
		{
			session_id: string;
			request_count: number;
			total_cost_nanos: number;
			first_request_at: string;
			last_request_at: string;
			app_ids: Set<string>;
			model_ids: Set<string>;
			provider_ids: Set<string>;
			end_user_ids: Set<string>;
		}
	>();

	for (const row of (data ?? []) as SessionRollupSourceRow[]) {
		const sessionId =
			typeof row.session_id === "string" ? row.session_id.trim() : "";
		const createdAt =
			typeof row.created_at === "string" ? row.created_at.trim() : "";
		if (!sessionId || !createdAt) continue;

		const existing = grouped.get(sessionId) ?? {
			session_id: sessionId,
			request_count: 0,
			total_cost_nanos: 0,
			first_request_at: createdAt,
			last_request_at: createdAt,
			app_ids: new Set<string>(),
			model_ids: new Set<string>(),
			provider_ids: new Set<string>(),
			end_user_ids: new Set<string>(),
		};

		existing.request_count += 1;
		existing.total_cost_nanos += Number(row.cost_nanos ?? 0) || 0;
		if (createdAt < existing.first_request_at) {
			existing.first_request_at = createdAt;
		}
		if (createdAt > existing.last_request_at) {
			existing.last_request_at = createdAt;
		}

		if (typeof row.app_id === "string" && row.app_id.trim()) {
			existing.app_ids.add(row.app_id.trim());
		}
		if (typeof row.model_id === "string" && row.model_id.trim()) {
			existing.model_ids.add(row.model_id.trim());
		}
		if (typeof row.provider === "string" && row.provider.trim()) {
			existing.provider_ids.add(row.provider.trim());
		}
		if (typeof row.end_user_id === "string" && row.end_user_id.trim()) {
			existing.end_user_ids.add(row.end_user_id.trim());
		}

		grouped.set(sessionId, existing);
	}

	return Array.from(grouped.values())
		.sort((a, b) => {
			const aTime = Date.parse(a.last_request_at);
			const bTime = Date.parse(b.last_request_at);
			return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
		})
		.slice(requestedOffset, requestedOffset + requestedLimit)
		.map((row) => ({
			session_id: row.session_id,
			request_count: row.request_count,
			total_cost_nanos: row.total_cost_nanos,
			total_cost_usd: row.total_cost_nanos / 1e9,
			first_request_at: row.first_request_at,
			last_request_at: row.last_request_at,
			app_ids: row.app_ids.size ? Array.from(row.app_ids) : null,
			model_ids: row.model_ids.size ? Array.from(row.model_ids) : null,
			provider_ids: row.provider_ids.size ? Array.from(row.provider_ids) : null,
			end_user_ids: row.end_user_ids.size ? Array.from(row.end_user_ids) : null,
		}));
}

async function enrichSessionRollups(args: {
	supabase: Awaited<ReturnType<typeof createClient>>;
	workspaceId: string;
	timeRange: { from: string; to: string };
	sessions: SessionRollupRow[];
}): Promise<SessionRollupRow[]> {
	const { supabase, workspaceId, timeRange, sessions } = args;
	if (sessions.length === 0) return sessions;

	const sessionIds = sessions
		.map((session) => session.session_id?.trim())
		.filter((sessionId): sessionId is string => Boolean(sessionId));
	if (sessionIds.length === 0) return sessions;

	const { data, error } = await supabase
		.from("gateway_requests")
		.select("session_id, app_id, model_id")
		.eq("workspace_id", workspaceId)
		.in("session_id", sessionIds)
		.gte("created_at", timeRange.from)
		.lte("created_at", timeRange.to)
		.limit(5000);

	if (error) {
		console.error("Error enriching session rollups:", error);
		return sessions;
	}

	const appCountsBySession = new Map<string, Map<string, number>>();
	const modelCountsBySession = new Map<string, Map<string, number>>();

	for (const row of (data ?? []) as Array<{
		session_id: string | null;
		app_id: string | null;
		model_id: string | null;
	}>) {
		const sessionId =
			typeof row.session_id === "string" ? row.session_id.trim() : "";
		if (!sessionId) continue;

		if (typeof row.app_id === "string" && row.app_id.trim()) {
			const appId = row.app_id.trim();
			const appCounts = appCountsBySession.get(sessionId) ?? new Map<string, number>();
			appCounts.set(appId, (appCounts.get(appId) ?? 0) + 1);
			appCountsBySession.set(sessionId, appCounts);
		}

		if (typeof row.model_id === "string" && row.model_id.trim()) {
			const modelId = row.model_id.trim();
			const modelCounts =
				modelCountsBySession.get(sessionId) ?? new Map<string, number>();
			modelCounts.set(modelId, (modelCounts.get(modelId) ?? 0) + 1);
			modelCountsBySession.set(sessionId, modelCounts);
		}
	}

	const sortCounts = (counts: Map<string, number>) =>
		Array.from(counts.entries())
			.map(([id, request_count]) => ({ id, request_count }))
			.sort((a, b) => {
				if (b.request_count !== a.request_count) {
					return b.request_count - a.request_count;
				}
				return a.id.localeCompare(b.id);
			});

	return sessions.map((session) => {
		const appCounts = appCountsBySession.get(session.session_id);
		const modelCounts = modelCountsBySession.get(session.session_id);
		return {
			...session,
			app_counts: appCounts
				? sortCounts(appCounts).map(({ id, request_count }) => ({
						app_id: id,
						request_count,
					}))
				: [],
			model_counts: modelCounts
				? sortCounts(modelCounts).map(({ id, request_count }) => ({
						model_id: id,
						request_count,
					}))
				: [],
		};
	});
}

export async function fetchSessionRollups(
	params: SessionRollupParams,
): Promise<SessionRollupRow[]> {
	const supabase = await createClient();
	const { workspaceId } = await requireAuthedTeamContext(supabase);

	if (params.sessionId) {
		const fallbackSessions = await fetchSessionRollupsFallback({
			supabase,
			workspaceId,
			params,
		});
		return enrichSessionRollups({
			supabase,
			workspaceId,
			timeRange: params.timeRange,
			sessions: fallbackSessions,
		});
	}

	const { data, error } = await supabase.rpc("get_gateway_sessions_rollup", {
		p_team: workspaceId,
		p_from: params.timeRange.from,
		p_to: params.timeRange.to,
		p_limit: params.limit ?? 100,
		p_offset: params.offset ?? 0,
		p_app_id: params.appId ?? null,
		p_model_id: params.modelId ?? null,
		p_provider: params.provider ?? null,
	});

	if (error) {
		console.error("Error fetching session rollups:", error);
		const fallbackSessions = await fetchSessionRollupsFallback({
			supabase,
			workspaceId,
			params,
		});
		return enrichSessionRollups({
			supabase,
			workspaceId,
			timeRange: params.timeRange,
			sessions: fallbackSessions,
		});
	}

	return enrichSessionRollups({
		supabase,
		workspaceId,
		timeRange: params.timeRange,
		sessions: (data ?? []) as SessionRollupRow[],
	});
}

export interface AppMetadata {
	title: string;
	imageUrl: string | null;
}

export async function fetchAppMetadata(
	appIds: string[],
): Promise<Map<string, AppMetadata>> {
	return fetchAppMetadataCached(toLookupCacheKey(appIds));
}

const fetchAppMetadataCached = cache(async (
	appIdsKey: string,
): Promise<Map<string, AppMetadata>> => {
	const supabase = await createClient();
	const { workspaceId } = await requireAuthedTeamContext(supabase);
	const appIds = appIdsKey ? appIdsKey.split("\n") : [];

	if (!workspaceId || appIds.length === 0) {
		return new Map();
	}

	const uniqueAppIds = normalizeLookupIds(appIds);
	const { data: apps } = await supabase
		.from("api_apps")
		.select("id, title, image_url")
		.eq("workspace_id", workspaceId)
		.in("id", uniqueAppIds);

	const appMap = new Map<string, AppMetadata>();

	if (apps) {
		apps.forEach((app: any) => {
			if (!app?.id) return;
			appMap.set(app.id, {
				title: app.title,
				imageUrl:
					typeof app.image_url === "string" && app.image_url.trim().length > 0
						? app.image_url.trim()
						: null,
			});
		});
	}

	return appMap;
});

export interface SessionRequestRow extends RequestRow {
	session_id: string | null;
	endpoint: string | null;
	end_user_id: string | null;
}

export async function fetchSessionRequests(params: {
	sessionId: string;
	timeRange?: { from: string; to: string } | null;
}): Promise<SessionRequestRow[]> {
	const supabase = await createClient();
	const { workspaceId } = await requireAuthedTeamContext(supabase);

	const sessionId = params.sessionId.trim();
	if (!workspaceId || sessionId.length === 0) {
		return [];
	}

	let query = supabase
		.from("gateway_requests")
		.select(
			`
			request_id,
			created_at,
			model_id,
			provider,
			native_response_id,
			stream,
			session_id,
			app_id,
			app:api_apps!gateway_requests_app_id_fkey (
				id,
				app_key,
				title,
				image_url
			),
			usage,
			${NORMALIZED_REQUEST_USAGE_SELECT},
			cost_nanos,
			generation_ms,
			latency_ms,
			finish_reason,
			success,
			status_code,
			error_code,
			error_message,
			error_payload,
			key_id,
			pricing_lines,
			throughput,
			provider_attempts,
			session_id,
			endpoint,
			end_user_id
		`
		)
		.eq("workspace_id", workspaceId)
		.eq("session_id", sessionId)
		.order("created_at", { ascending: true })
		.limit(500);

	if (params.timeRange?.from) {
		query = query.gte("created_at", params.timeRange.from);
	}
	if (params.timeRange?.to) {
		query = query.lte("created_at", params.timeRange.to);
	}

	const { data, error } = await query;
	if (error) {
		console.error("Error fetching session requests:", error);
		let fallback = supabase
			.from("gateway_requests")
			.select(
				`
			request_id,
			created_at,
			model_id,
			provider,
			native_response_id,
			stream,
			session_id,
			app_id,
			app:api_apps!gateway_requests_app_id_fkey (
				id,
				app_key,
				title,
				image_url
			),
			usage,
			cost_nanos,
			generation_ms,
			latency_ms,
			finish_reason,
			success,
			status_code,
			error_code,
			error_message,
			error_payload,
			key_id,
			pricing_lines,
			throughput,
			provider_attempts,
			session_id,
			endpoint,
			end_user_id
		`
			)
			.eq("workspace_id", workspaceId)
			.eq("session_id", sessionId)
			.order("created_at", { ascending: true })
			.limit(500);

		if (params.timeRange?.from) {
			fallback = fallback.gte("created_at", params.timeRange.from);
		}
		if (params.timeRange?.to) {
			fallback = fallback.lte("created_at", params.timeRange.to);
		}

		const { data: fallbackData, error: fallbackError } = await fallback;
		if (fallbackError) {
			console.error("Error fetching session requests fallback:", fallbackError);
			return [];
		}
		return (
			(fallbackData as any[] | null)?.map((row) => {
				return {
					...toRequestRow(row),
				} as SessionRequestRow;
			}) ?? []
		);
	}

	return (
		(data as any[] | null)?.map((row) => {
			return {
				...toRequestRow(row),
			} as SessionRequestRow;
		}) ?? []
	);
}

export interface JobsRollupParams {
	limit?: number;
	offset?: number;
	kind?: "video" | "batch" | "music" | null;
	status?: string | null;
	sessionId?: string | null;
	provider?: string | null;
}

export interface JobsRollupRow {
	job_id: string;
	kind: string;
	internal_id: string;
	request_id: string | null;
	session_id: string | null;
	app_id: string | null;
	provider: string | null;
	model: string | null;
	status: string | null;
	billed_at: string | null;
	created_at: string;
	updated_at: string;
	request_created_at: string | null;
	request_endpoint: string | null;
	request_model_id: string | null;
	request_cost_nanos: number | null;
	request_cost_usd: number | null;
}

export async function fetchJobsRollups(
	params: JobsRollupParams = {},
): Promise<JobsRollupRow[]> {
	const supabase = await createClient();
	const { workspaceId } = await requireAuthedTeamContext(supabase);

	const { data, error } = await supabase.rpc("get_gateway_jobs_rollup", {
		p_team: workspaceId,
		p_limit: params.limit ?? 100,
		p_offset: params.offset ?? 0,
		p_kind: params.kind ?? null,
		p_status: params.status ?? null,
		p_session_id: params.sessionId ?? null,
		p_provider: params.provider ?? null,
	});

	if (error) {
		console.error("Error fetching jobs rollups:", error);
		return [];
	}

	return (data ?? []) as JobsRollupRow[];
}

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeIsoDate(value: unknown): string | null {
	const text = normalizeText(value);
	if (!text) return null;
	const parsed = Date.parse(text);
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function isInternalBatchFileRecord(args: {
	kind: string | null;
	internalId: string | null;
	meta: Record<string, unknown> | null;
}): boolean {
	if (args.kind !== "batch") return false;
	if (args.internalId?.startsWith("__file__:")) return true;
	return normalizeText(args.meta?.resource) === "file";
}

type AsyncWebhookAttemptStatus =
	| "delivered"
	| "scheduled_retry"
	| "failed_permanently";

export interface AsyncJobWebhookAttemptRow {
	id: string;
	delivery_key: string;
	event_type: string;
	status: AsyncWebhookAttemptStatus;
	attempt_number: number;
	max_attempts: number;
	tried_at: string;
	delivered_at: string | null;
	next_retry_at: string | null;
	response_status: number | null;
	error_message: string | null;
	response_body_preview: string | null;
}

export interface AsyncJobWebhookSummaryRow {
	configured: boolean;
	url: string | null;
	events: string[];
	delivered_events: number;
	delivered_event_types: string[];
	attempt_count: number;
	pending_retries: number;
	next_retry_at: string | null;
	last_attempt_at: string | null;
	last_attempt_status: AsyncWebhookAttemptStatus | null;
	last_response_status: number | null;
	last_delivered_at: string | null;
	last_failure_at: string | null;
	last_error_message: string | null;
	has_secret: boolean;
}

export interface AsyncJobRequestCounts {
	total: number | null;
	completed: number | null;
	failed: number | null;
}

export interface AsyncJobPricingBreakdown {
	total_nanos: number | null;
	total_usd_str: string | null;
	total_cents: number | null;
	completed_requests: number | null;
	failed_requests: number | null;
	total_requests: number | null;
}

export type AsyncJobRequestPricingLine =
	| Record<string, unknown>
	| string
	| number
	| boolean
	| null;

export interface AsyncJobRow {
	kind: "video" | "batch";
	internal_id: string;
	request_id: string | null;
	session_id: string | null;
	app_id: string | null;
	provider: string | null;
	model: string | null;
	status: string | null;
	lifecycle_status: string | null;
	billed_at: string | null;
	created_at: string;
	updated_at: string;
	request_created_at: string | null;
	request_cost_nanos: number | null;
	settled_cost_nanos: number | null;
	settled_cost_usd: number | null;
	charged: boolean | null;
	billing_reason: string | null;
	job_failure_category: string | null;
	job_failure_provider: string | null;
	job_failure_hint: string | null;
	request_counts: AsyncJobRequestCounts | null;
	webhook: AsyncJobWebhookSummaryRow;
}

export interface AsyncJobDetailRow extends AsyncJobRow {
	native_id: string | null;
	endpoint: string | null;
	completion_window: string | null;
	resolution: string | null;
	duration_seconds: number | null;
	output_access: string | null;
	key_source: string | null;
	byok_key_id: string | null;
	reservation_id: string | null;
	reservation_status: string | null;
	next_webhook_retry_at: string | null;
	last_webhook_progress: number | null;
	last_webhook_progress_at: string | null;
	last_webhook_dispatched_at: string | null;
	finalized_at: string | null;
	last_polled_at: string | null;
	polled_status: string | null;
	last_reconciled_at: string | null;
	total_duration_ms: number | null;
	latency_ms: number | null;
	generation_ms: number | null;
	request_native_response_id: string | null;
	request_endpoint: string | null;
	request_model_id: string | null;
	request_success: boolean | null;
	request_status_code: number | null;
	request_error_code: string | null;
	request_error_message: string | null;
	request_error_payload: Record<string, unknown> | null;
	request_finish_reason: string | null;
	request_latency_ms: number | null;
	request_generation_ms: number | null;
	request_provider_attempts: RequestRow["provider_attempts"];
	request_pricing_lines: AsyncJobRequestPricingLine[];
	job_upstream_error: AsyncJobUpstreamErrorRow | null;
	job_provider_failure_diagnostics: AsyncJobProviderFailureDiagnosticsRow | null;
	job_failure_sample: AsyncJobFailureSampleRow[];
	job_routing_diagnostics: Record<string, unknown> | null;
	job_provider_enablement: Record<string, unknown> | null;
	job_provider_candidate_diagnostics: Record<string, unknown> | null;
	content_url: string | null;
	cancel_url: string | null;
	output_file_id: string | null;
	error_file_id: string | null;
	request_created_at: string | null;
	request_cost_nanos: number | null;
	batch_pricing_lines: AsyncJobRequestPricingLine[];
	pricing_breakdown: AsyncJobPricingBreakdown | null;
	webhook_attempts: AsyncJobWebhookAttemptRow[];
}

function parseAsyncJobRequestCounts(meta: Record<string, unknown> | null | undefined): AsyncJobRequestCounts | null {
	const counts =
		meta?.requestCounts && typeof meta.requestCounts === "object" && !Array.isArray(meta.requestCounts)
			? (meta.requestCounts as Record<string, unknown>)
			: meta?.request_counts && typeof meta.request_counts === "object" && !Array.isArray(meta.request_counts)
				? (meta.request_counts as Record<string, unknown>)
				: null;
	if (!counts) return null;
	return {
		total: normalizeFiniteNumber(counts.total),
		completed: normalizeFiniteNumber(counts.completed),
		failed: normalizeFiniteNumber(counts.failed),
	};
}

function parseAsyncJobPricingBreakdown(meta: Record<string, unknown> | null | undefined): AsyncJobPricingBreakdown | null {
	const pricing =
		meta?.pricingBreakdown && typeof meta.pricingBreakdown === "object" && !Array.isArray(meta.pricingBreakdown)
			? (meta.pricingBreakdown as Record<string, unknown>)
			: meta?.pricing_breakdown && typeof meta.pricing_breakdown === "object" && !Array.isArray(meta.pricing_breakdown)
				? (meta.pricing_breakdown as Record<string, unknown>)
				: null;
	if (!pricing) return null;
	return {
		total_nanos: normalizeFiniteNumber(pricing.total_nanos),
		total_usd_str: normalizeText(pricing.total_usd_str),
		total_cents: normalizeFiniteNumber(pricing.total_cents),
		completed_requests: normalizeFiniteNumber(pricing.completed_requests),
		failed_requests: normalizeFiniteNumber(pricing.failed_requests),
		total_requests: normalizeFiniteNumber(pricing.total_requests),
	};
}

function parseAsyncJobBatchPricingLines(
	meta: Record<string, unknown> | null | undefined,
): AsyncJobRequestPricingLine[] {
	if (!meta) return [];
	const directLines = normalizePricingLines(meta.pricingLines ?? meta.pricing_lines);
	if (directLines.length > 0) return directLines;

	const pricedUsage =
		meta.pricedUsage && typeof meta.pricedUsage === "object" && !Array.isArray(meta.pricedUsage)
			? (meta.pricedUsage as Record<string, unknown>)
			: meta.priced_usage && typeof meta.priced_usage === "object" && !Array.isArray(meta.priced_usage)
				? (meta.priced_usage as Record<string, unknown>)
				: null;
	const pricedUsagePricing =
		pricedUsage?.pricing && typeof pricedUsage.pricing === "object" && !Array.isArray(pricedUsage.pricing)
			? (pricedUsage.pricing as Record<string, unknown>)
			: null;
	const pricedUsageLines = normalizePricingLines(pricedUsagePricing?.lines);
	if (pricedUsageLines.length > 0) return pricedUsageLines;

	const totalNanos = normalizeFiniteNumber(meta.costNanos ?? meta.cost_nanos);
	if (totalNanos == null) return [];
	const counts = parseAsyncJobRequestCounts(meta);
	const pricingBreakdown = parseAsyncJobPricingBreakdown(meta);
	return [
		{
			dimension: "batch_requests",
			pricing_plan: "batch",
			service_tier: "batch",
			endpoint: normalizeText(meta.endpoint),
			units: counts?.completed ?? counts?.total ?? null,
			total_nanos: totalNanos,
			total_usd_str: pricingBreakdown?.total_usd_str ?? null,
		},
	];
}

function parseWebhookAttempts(value: unknown): AsyncJobWebhookAttemptRow[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry, index) => {
			if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
			const record = entry as Record<string, unknown>;
			const eventType = normalizeText(record.event_type);
			const status = normalizeText(record.status) as AsyncWebhookAttemptStatus | null;
			const triedAt = normalizeIsoDate(record.tried_at);
			const attemptNumber = normalizeFiniteNumber(record.attempt_number);
			const maxAttempts = normalizeFiniteNumber(record.max_attempts);
			if (!eventType || !status || !triedAt || attemptNumber == null || maxAttempts == null) {
				return null;
			}
			return {
				id: normalizeText(record.id) ?? `${eventType}:${triedAt}:${index}`,
				delivery_key: normalizeText(record.delivery_key) ?? eventType,
				event_type: eventType,
				status,
				attempt_number: Math.max(1, Math.trunc(attemptNumber)),
				max_attempts: Math.max(1, Math.trunc(maxAttempts)),
				tried_at: triedAt,
				delivered_at: normalizeIsoDate(record.delivered_at),
				next_retry_at: normalizeIsoDate(record.next_retry_at),
				response_status: normalizeFiniteNumber(record.response_status),
				error_message: normalizeText(record.error_message),
				response_body_preview: normalizeText(record.response_body_preview),
			};
		})
		.filter((entry): entry is AsyncJobWebhookAttemptRow => Boolean(entry))
		.sort((a, b) => b.tried_at.localeCompare(a.tried_at));
}

function parseWebhookRetryQueue(value: unknown): Array<{ next_retry_at: string | null }> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return [];
	return Object.values(value as Record<string, unknown>)
		.map((entry) => {
			if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
			const record = entry as Record<string, unknown>;
			return {
				next_retry_at: normalizeIsoDate(record.nextRetryAt ?? record.next_retry_at),
			};
		})
		.filter((entry): entry is { next_retry_at: string | null } => Boolean(entry));
}

function buildWebhookSummary(meta: Record<string, unknown> | null | undefined): AsyncJobWebhookSummaryRow {
	const webhook =
		meta?.webhook && typeof meta.webhook === "object" && !Array.isArray(meta.webhook)
			? (meta.webhook as Record<string, unknown>)
			: null;
	const attempts = parseWebhookAttempts(meta?.webhookAttempts ?? meta?.webhook_attempts);
	const retryQueue = parseWebhookRetryQueue(meta?.webhookRetryQueue ?? meta?.webhook_retry_queue);
	const lastAttempt = attempts[0] ?? null;
	const deliveredEvents =
		meta?.webhookDeliveries && typeof meta.webhookDeliveries === "object" && !Array.isArray(meta.webhookDeliveries)
			? Object.keys(meta.webhookDeliveries as Record<string, unknown>).length
			: meta?.webhook_deliveries && typeof meta.webhook_deliveries === "object" && !Array.isArray(meta.webhook_deliveries)
				? Object.keys(meta.webhook_deliveries as Record<string, unknown>).length
				: 0;
	const nextRetryAt = retryQueue
		.map((entry) => entry.next_retry_at)
		.filter((entry): entry is string => Boolean(entry))
		.sort((a, b) => a.localeCompare(b))[0] ?? null;
	const deliveredAttempts = attempts.filter((attempt) => attempt.status === "delivered");
	const failureAttempts = attempts.filter((attempt) => attempt.status !== "delivered");
	const events = Array.isArray(webhook?.events)
		? webhook.events
				.map((event) => normalizeText(event))
				.filter((event): event is string => Boolean(event))
		: [];
	const deliveredEventTypes = Array.from(
		new Set(deliveredAttempts.map((attempt) => attempt.event_type).filter(Boolean)),
	).sort((a, b) => a.localeCompare(b));
	return {
		configured: Boolean(webhook),
		url: normalizeText(webhook?.url),
		events,
		delivered_events: deliveredEvents,
		delivered_event_types: deliveredEventTypes,
		attempt_count: attempts.length,
		pending_retries: retryQueue.length,
		next_retry_at: nextRetryAt,
		last_attempt_at: lastAttempt?.tried_at ?? null,
		last_attempt_status: lastAttempt?.status ?? null,
		last_response_status: lastAttempt?.response_status ?? null,
		last_delivered_at: deliveredAttempts[0]?.delivered_at ?? null,
		last_failure_at: failureAttempts[0]?.tried_at ?? null,
		last_error_message: lastAttempt?.error_message ?? null,
		has_secret: Boolean(
			webhook?.secret ??
				webhook?.has_secret ??
				webhook?.signing_secret ??
				webhook?.secret_present,
		),
	};
}

function toAsyncJobRow(
	row: Record<string, unknown>,
	options?: { includeWithoutWebhook?: boolean },
): AsyncJobRow | null {
	const kind = normalizeText(row.kind) as "video" | "batch" | null;
	const internalId = normalizeText(row.internal_id);
	const createdAt = normalizeIsoDate(row.created_at);
	const updatedAt = normalizeIsoDate(row.updated_at);
	if (!kind || !internalId || !createdAt || !updatedAt) return null;
	const meta =
		row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
			? (row.meta as Record<string, unknown>)
			: null;
	if (isInternalBatchFileRecord({ kind, internalId, meta })) return null;
	const failureDiagnostics = parseAsyncJobFailureDiagnostics(meta);
	const webhook = buildWebhookSummary(meta);
	if (
		!options?.includeWithoutWebhook &&
		!webhook.configured &&
		webhook.attempt_count === 0 &&
		webhook.pending_retries === 0
	) {
		return null;
	}
	return {
		kind,
		internal_id: internalId,
		request_id: normalizeText(row.request_id),
		session_id: normalizeText(row.session_id),
		app_id: normalizeText(row.app_id),
		provider: normalizeText(row.provider),
		model: normalizeText(row.model),
		status: normalizeText(row.status),
		lifecycle_status: normalizeText(meta?.lifecycleStatus ?? meta?.lifecycle_status),
		billed_at: normalizeIsoDate(row.billed_at),
		created_at: createdAt,
		updated_at: updatedAt,
		request_created_at: null,
		request_cost_nanos: null,
		settled_cost_nanos: normalizeFiniteNumber(meta?.costNanos ?? meta?.cost_nanos),
		settled_cost_usd: normalizeFiniteNumber(meta?.costUsd ?? meta?.cost_usd),
		charged:
			typeof meta?.charged === "boolean"
				? meta.charged
				: typeof meta?.charged === "string"
					? ["1", "true", "yes", "on"].includes(meta.charged.toLowerCase())
					: null,
		billing_reason: normalizeText(meta?.billingReason ?? meta?.billing_reason),
		job_failure_category:
			failureDiagnostics.job_provider_failure_diagnostics?.category ?? null,
		job_failure_provider:
			failureDiagnostics.job_provider_failure_diagnostics?.provider ?? null,
		job_failure_hint:
			failureDiagnostics.job_provider_failure_diagnostics?.hint ?? null,
		request_counts: parseAsyncJobRequestCounts(meta),
		webhook,
	};
}

function normalizePricingLines(value: unknown): AsyncJobRequestPricingLine[] {
	if (!Array.isArray(value)) return [];
	return value.map((entry) => {
		if (
			entry == null ||
			typeof entry === "string" ||
			typeof entry === "number" ||
			typeof entry === "boolean"
		) {
			return entry;
		}
		if (typeof entry === "object" && !Array.isArray(entry)) {
			return entry as Record<string, unknown>;
		}
		return JSON.stringify(entry);
	});
}

export async function fetchRecentAsyncJobs(params?: {
	limit?: number;
	includeWithoutWebhook?: boolean;
	timeRange?: { from: string; to: string };
	kind?: "video" | "batch" | null;
	status?: string | null;
	provider?: string | null;
}): Promise<AsyncJobRow[]> {
	const supabase = await createClient();
	const { workspaceId } = await requireAuthedTeamContext(supabase);
	const admin = createAdminClient();
	const limit = Number.isFinite(params?.limit)
		? Math.max(1, Math.min(50, Math.trunc(params!.limit!)))
		: 20;

	let query = admin
		.from("gateway_async_operations")
		.select("kind,internal_id,request_id,session_id,app_id,provider,model,status,billed_at,created_at,updated_at,meta")
		.eq("workspace_id", workspaceId)
		.in("kind", ["video", "batch"])
		.not("internal_id", "like", "__file__:%");

	if (params?.kind) {
		query = query.eq("kind", params.kind);
	}
	if (params?.status) {
		query = query.eq("status", params.status);
	}
	if (params?.provider) {
		query = query.eq("provider", params.provider);
	}

	if (params?.timeRange?.from) {
		query = query.gte("created_at", params.timeRange.from);
	}
	if (params?.timeRange?.to) {
		query = query.lte("created_at", params.timeRange.to);
	}

	const { data, error } = await query
		.order("updated_at", { ascending: false })
		.limit(Math.max(limit * 3, 30));

	if (error) {
		console.error("Error fetching async jobs:", error);
		return [];
	}

	const jobs = (data ?? [])
		.map((row) =>
			toAsyncJobRow(row as Record<string, unknown>, {
				includeWithoutWebhook: params?.includeWithoutWebhook === true,
			}),
		)
		.filter((row): row is AsyncJobRow => Boolean(row))
		.slice(0, limit);

	const requestIds = Array.from(
		new Set(
			jobs
				.map((row) => row.request_id)
				.filter((value): value is string => typeof value === "string" && value.trim().length > 0),
		),
	);

	if (requestIds.length === 0) return jobs;

	const { data: requestRows, error: requestError } = await admin
		.from("gateway_requests")
		.select("request_id,created_at,cost_nanos")
		.eq("workspace_id", workspaceId)
		.in("request_id", requestIds)
		.order("created_at", { ascending: false });

	if (requestError) {
		console.error("Error fetching async job request rows:", requestError);
		return jobs;
	}

	const requestMap = new Map<
		string,
		{
			created_at: string | null;
			cost_nanos: number | null;
		}
	>();
	for (const row of requestRows ?? []) {
		const requestId = normalizeText((row as Record<string, unknown>).request_id);
		if (!requestId || requestMap.has(requestId)) continue;
		requestMap.set(requestId, {
			created_at: normalizeIsoDate((row as Record<string, unknown>).created_at),
			cost_nanos: normalizeFiniteNumber((row as Record<string, unknown>).cost_nanos),
		});
	}

	return jobs.map((job) => {
		const requestMeta = job.request_id ? requestMap.get(job.request_id) : null;
		if (!requestMeta) return job;
		return {
			...job,
			request_created_at: requestMeta.created_at,
			request_cost_nanos: requestMeta.cost_nanos,
		};
	});
}

export async function fetchAsyncJobDetail(input: {
	kind: "video" | "batch";
	internalId: string;
}): Promise<AsyncJobDetailRow | null> {
	const supabase = await createClient();
	const { workspaceId } = await requireAuthedTeamContext(supabase);
	const admin = createAdminClient();

	const { data, error } = await admin
		.from("gateway_async_operations")
		.select("kind,internal_id,request_id,session_id,app_id,provider,native_id,model,status,billed_at,created_at,updated_at,meta")
		.eq("workspace_id", workspaceId)
		.eq("kind", input.kind)
		.eq("internal_id", input.internalId)
		.maybeSingle();

	if (error) {
		console.error("Error fetching async job detail:", error);
		return null;
	}
	if (!data) return null;

	const base = toAsyncJobRow(data as Record<string, unknown>, {
		includeWithoutWebhook: true,
	});
	if (!base) return null;
	const meta =
		data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
			? (data.meta as Record<string, unknown>)
			: null;
	const webhookAttempts = parseWebhookAttempts(meta?.webhookAttempts ?? meta?.webhook_attempts);
	const failureDiagnostics = parseAsyncJobFailureDiagnostics(meta);

	let requestCreatedAt: string | null = null;
	let requestCostNanos: number | null = null;
	let requestNativeResponseId: string | null = null;
	let requestEndpoint: string | null = null;
	let requestModelId: string | null = null;
	let requestSuccess: boolean | null = null;
	let requestStatusCode: number | null = null;
	let requestErrorCode: string | null = null;
	let requestErrorMessage: string | null = null;
	let requestErrorPayload: Record<string, unknown> | null = null;
	let requestFinishReason: string | null = null;
	let requestLatencyMs: number | null = null;
	let requestGenerationMs: number | null = null;
	let requestProviderAttempts: RequestRow["provider_attempts"] = [];
	let requestPricingLines: AsyncJobRequestPricingLine[] = [];
	if (base.request_id) {
		const { data: requestData } = await admin
			.from("gateway_requests")
			.select("created_at,cost_nanos,native_response_id,endpoint,model_id,success,status_code,error_code,error_message,error_payload,finish_reason,latency_ms,generation_ms,provider_attempts,pricing_lines")
			.eq("workspace_id", workspaceId)
			.eq("request_id", base.request_id)
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle();
		requestCreatedAt = normalizeIsoDate(requestData?.created_at);
		requestCostNanos = normalizeFiniteNumber(requestData?.cost_nanos);
		requestNativeResponseId = normalizeText(requestData?.native_response_id);
		requestEndpoint = normalizeText(requestData?.endpoint);
		requestModelId = normalizeText(requestData?.model_id);
		requestSuccess = typeof requestData?.success === "boolean" ? requestData.success : null;
		requestStatusCode = normalizeFiniteNumber(requestData?.status_code);
		requestErrorCode = normalizeText(requestData?.error_code);
		requestErrorMessage = normalizeText(requestData?.error_message);
		requestErrorPayload = normalizePlainObject(requestData?.error_payload);
		requestFinishReason = normalizeText(requestData?.finish_reason);
		requestLatencyMs = normalizeFiniteNumber(requestData?.latency_ms);
		requestGenerationMs = normalizeFiniteNumber(requestData?.generation_ms);
		requestProviderAttempts = normalizeProviderAttempts(requestData?.provider_attempts);
		requestPricingLines = normalizePricingLines(requestData?.pricing_lines);
	}

	return {
		...base,
		native_id: normalizeText((data as Record<string, unknown>).native_id),
		endpoint: normalizeText(meta?.endpoint),
		completion_window: normalizeText(meta?.completionWindow ?? meta?.completion_window),
		resolution: normalizeText(meta?.resolution),
		duration_seconds: normalizeFiniteNumber(meta?.seconds),
		output_access: normalizeText(meta?.outputAccess ?? meta?.output_access),
		key_source: normalizeText(meta?.keySource ?? meta?.key_source),
		byok_key_id: normalizeText(meta?.byokKeyId ?? meta?.byok_key_id),
		reservation_id: normalizeText(meta?.reservationId ?? meta?.reservation_id),
		reservation_status: normalizeText(meta?.reservationStatus ?? meta?.reservation_status),
		next_webhook_retry_at: normalizeIsoDate(meta?.nextWebhookRetryAt ?? meta?.next_webhook_retry_at),
		last_webhook_progress: normalizeFiniteNumber(meta?.lastWebhookProgress ?? meta?.last_webhook_progress),
		last_webhook_progress_at: normalizeIsoDate(meta?.lastWebhookProgressAt ?? meta?.last_webhook_progress_at),
		last_webhook_dispatched_at: normalizeIsoDate(meta?.lastWebhookDispatchedAt ?? meta?.last_webhook_dispatched_at),
		finalized_at: normalizeIsoDate(meta?.finalizedAt ?? meta?.finalized_at),
		last_polled_at: normalizeIsoDate(meta?.lastPolledAt ?? meta?.last_polled_at),
		polled_status: normalizeText(meta?.polledStatus ?? meta?.polled_status),
		last_reconciled_at: normalizeIsoDate(meta?.lastReconciledAt ?? meta?.last_reconciled_at),
		total_duration_ms: normalizeFiniteNumber(meta?.totalDurationMs ?? meta?.total_duration_ms ?? meta?.durationMs ?? meta?.duration_ms),
		latency_ms: normalizeFiniteNumber(meta?.latencyMs ?? meta?.latency_ms),
		generation_ms: normalizeFiniteNumber(meta?.generationMs ?? meta?.generation_ms),
		content_url: normalizeText(meta?.googleVideoUri ?? meta?.google_video_uri ?? meta?.downloadUrl ?? meta?.download_url),
		cancel_url: input.kind === "batch" && ["pending", "in_progress"].includes((base.status ?? "").toLowerCase())
			? `/v1/batches/${encodeURIComponent(base.internal_id)}/cancel`
			: null,
		output_file_id: normalizeText(meta?.outputFileId ?? meta?.output_file_id),
		error_file_id: normalizeText(meta?.errorFileId ?? meta?.error_file_id),
		request_created_at: requestCreatedAt,
		request_cost_nanos: requestCostNanos,
		batch_pricing_lines: parseAsyncJobBatchPricingLines(meta),
		request_native_response_id: requestNativeResponseId,
		request_endpoint: requestEndpoint,
		request_model_id: requestModelId,
		request_success: requestSuccess,
		request_status_code: requestStatusCode,
		request_error_code: requestErrorCode,
		request_error_message: requestErrorMessage,
		request_error_payload: requestErrorPayload,
		request_finish_reason: requestFinishReason,
		request_latency_ms: requestLatencyMs,
		request_generation_ms: requestGenerationMs,
		request_provider_attempts: requestProviderAttempts,
		request_pricing_lines: requestPricingLines,
		job_upstream_error: failureDiagnostics.job_upstream_error,
		job_provider_failure_diagnostics:
			failureDiagnostics.job_provider_failure_diagnostics,
		job_failure_sample: failureDiagnostics.job_failure_sample,
		job_routing_diagnostics: failureDiagnostics.job_routing_diagnostics,
		job_provider_enablement: failureDiagnostics.job_provider_enablement,
		job_provider_candidate_diagnostics:
			failureDiagnostics.job_provider_candidate_diagnostics,
		pricing_breakdown: parseAsyncJobPricingBreakdown(meta),
		webhook_attempts: webhookAttempts,
	};
}

