"use server";

import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";

export interface PaginatedRequestsParams {
	timeRange: { from: string; to: string };
	modelFilter?: string | null;
	providerFilter?: string | null;
	keyFilter?: string | null;
	statusFilter?: "all" | "success" | "error";
	page: number;
	sortField: string;
	sortDirection: "asc" | "desc";
}

export interface RequestRow {
	request_id: string;
	created_at: string;
	model_id: string | null;
	provider: string | null;
	app_id: string | null;
	usage: any;
	cost_nanos: number | null;
	generation_ms: number | null;
	latency_ms: number | null;
	finish_reason: string | null;
	success: boolean;
	status_code: number | null;
	error_code: string | null;
	error_message: string | null;
	key_id: string | null;
}

export interface PaginatedRequestsResult {
	data: RequestRow[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

/**
 * Fetch paginated requests with filters and sorting
 */
export async function fetchPaginatedRequests(
	params: PaginatedRequestsParams
): Promise<PaginatedRequestsResult> {
	const supabase = await createClient();
	const teamId = await getTeamIdFromCookie();

	if (!teamId) {
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
			model_id,
			provider,
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
			key_id
		`,
			{ count: "exact" }
		)
		.eq("team_id", teamId)
		.gte("created_at", params.timeRange.from)
		.lte("created_at", params.timeRange.to);

	// Apply filters
	if (params.modelFilter) {
		query = query.eq("model_id", params.modelFilter);
	}
	if (params.providerFilter) {
		query = query.eq("provider", params.providerFilter);
	}
	if (params.keyFilter) {
		query = query.eq("key_id", params.keyFilter);
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

	if (error) {
		console.error("Error fetching paginated requests:", error);
		return {
			data: [],
			total: 0,
			page: params.page,
			pageSize,
			totalPages: 0,
		};
	}

	return {
		data: (data as RequestRow[]) || [],
		total: count || 0,
		page: params.page,
		pageSize,
		totalPages: Math.ceil((count || 0) / pageSize),
	};
}

/**
 * Fetch organization colors for models
 * Returns a map of model_id -> organization color
 */
export async function fetchOrganizationColors(
	modelIds: string[]
): Promise<Map<string, string>> {
	const supabase = await createClient();

	if (modelIds.length === 0) {
		return new Map();
	}

	const uniqueModelIds = Array.from(new Set(modelIds));
	const colorMap = new Map<string, string>();
	const normalizeApiId = (id: string) => {
		const base = id.split(":")[0];
		const dotToDash = base.replace(/\./g, "-");
		return Array.from(new Set([id, base, dotToDash]));
	};

	// 1) Direct internal model IDs -> org colors
	const { data: models } = await supabase
		.from("data_models")
		.select(
			`
			model_id,
			organisation:data_organisations!data_models_organisation_id_fkey(colour)
		`
		)
		.in("model_id", uniqueModelIds);

	if (models) {
		models.forEach((m: any) => {
			if (!m.organisation?.colour) return;
			const fullId = m.model_id;
			const color = m.organisation.colour;

			colorMap.set(fullId, color);

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

	// 2) API model IDs -> internal model IDs -> org colors
	const apiLookupIds = Array.from(
		new Set(uniqueModelIds.flatMap((id) => normalizeApiId(id))),
	);
	const { data: providerModels } = await supabase
		.from("data_api_provider_models")
		.select(
			`
			api_model_id,
			internal_model_id,
			model:data_models!data_api_provider_models_internal_model_id_fkey(
				model_id,
				organisation:data_organisations!data_models_organisation_id_fkey(colour)
			)
		`
		)
		.in("api_model_id", apiLookupIds);

	const providerApiIds = new Set<string>();
	if (providerModels) {
		providerModels.forEach((pm: any) => {
			const color = pm?.model?.organisation?.colour;
			if (!color) return;
			const apiId = pm.api_model_id ?? null;
			const internalId = pm.internal_model_id ?? pm?.model?.model_id ?? null;

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
			if (internalId) colorMap.set(internalId, color);
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
}

/**
 * Fetch model metadata for filters
 * Returns a map of model_id -> { organisationId, organisationName }
 */
export async function fetchModelMetadata(
	modelIds: string[]
): Promise<Map<string, { organisationId: string; organisationName: string }>> {
	const supabase = await createClient();

	if (modelIds.length === 0) {
		return new Map();
	}

	const uniqueModelIds = Array.from(new Set(modelIds));
	const metadataMap = new Map<
		string,
		{ organisationId: string; organisationName: string }
	>();

	const addMetadata = (
		key: string | null | undefined,
		value: { organisationId: string; organisationName: string },
	) => {
		if (!key) return;
		if (!metadataMap.has(key)) {
			metadataMap.set(key, value);
		}
	};

	const normalizeApiId = (id: string) => {
		const base = id.split(":")[0];
		const dotToDash = base.replace(/\./g, "-");
		return Array.from(new Set([id, base, dotToDash]));
	};

	const { data: models } = await supabase
		.from("data_models")
		.select(
			`
			model_id,
			organisation_id,
			organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, organisation_name)
		`
		)
		.in("model_id", uniqueModelIds);

	if (models) {
		models.forEach((m: any) => {
			if (m.organisation) {
				const value = {
					organisationId: m.organisation.organisation_id,
					organisationName: m.organisation.organisation_name || m.organisation.organisation_id,
				};
				addMetadata(m.model_id, value);
				if (m.model_id.includes("/")) {
					const withoutOrg = m.model_id.split("/").slice(1).join("/");
					addMetadata(withoutOrg, value);
				}
			}
		});
	}

	// Also resolve API model IDs to internal model metadata.
	const apiLookupIds = Array.from(
		new Set(uniqueModelIds.flatMap((id) => normalizeApiId(id))),
	);
	const { data: providerModels } = await supabase
		.from("data_api_provider_models")
		.select(
			`
			api_model_id,
			internal_model_id,
			model:data_models!data_api_provider_models_internal_model_id_fkey(
				model_id,
				organisation:data_organisations!data_models_organisation_id_fkey(organisation_id, organisation_name)
			)
		`
		)
		.in("api_model_id", apiLookupIds);

	if (providerModels) {
		providerModels.forEach((pm: any) => {
			const org = pm?.model?.organisation;
			if (!org) return;
			const value = {
				organisationId: org.organisation_id,
				organisationName: org.organisation_name || org.organisation_id,
			};
			const apiId: string | null = pm.api_model_id ?? null;
			const internalId: string | null =
				pm.internal_model_id ?? pm?.model?.model_id ?? null;

			addMetadata(apiId, value);
			if (apiId && apiId.includes(":")) {
				addMetadata(apiId.split(":")[0], value);
			}
			if (apiId && apiId.includes("/")) {
				addMetadata(apiId.split("/").slice(1).join("/"), value);
			}
			addMetadata(internalId, value);
			if (internalId && internalId.includes("/")) {
				addMetadata(internalId.split("/").slice(1).join("/"), value);
			}
		});
	}

	for (const id of uniqueModelIds) {
		if (metadataMap.has(id)) continue;
		const variants = normalizeApiId(id);
		const match = variants.find((variant) => metadataMap.has(variant));
		if (match) {
			metadataMap.set(id, metadataMap.get(match)!);
		}
	}

	return metadataMap;
}

/**
 * Fetch provider names for display labels
 * Returns a map of provider_id -> provider name
 */
export async function fetchProviderNames(
	providerIds: string[]
): Promise<Map<string, string>> {
	const supabase = await createClient();

	if (providerIds.length === 0) {
		return new Map();
	}

	const uniqueProviderIds = Array.from(new Set(providerIds.filter(Boolean)));
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
}

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
	const teamId = await getTeamIdFromCookie();

	if (!teamId) {
		return {
			topModel: null,
			topProvider: null,
			mostExpensive: null,
			fastestModel: null,
		};
	}

	const { data: rows } = await supabase
		.from("gateway_requests")
		.select("model_id, provider, cost_nanos, generation_ms, latency_ms")
		.eq("team_id", teamId)
		.gte("created_at", timeRange.from)
		.lte("created_at", timeRange.to);

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
		const model = r.model_id || "unknown";
		modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
	});
	const topModelEntry = Array.from(modelCounts.entries()).sort((a, b) => b[1] - a[1])[0];
	const topModel = topModelEntry
		? { name: topModelEntry[0], requests: topModelEntry[1] }
		: null;

	// Top provider by requests
	const providerCounts = new Map<string, number>();
	rows.forEach((r: any) => {
		const provider = r.provider || "unknown";
		providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
	});
	const topProviderEntry = Array.from(providerCounts.entries()).sort((a, b) => b[1] - a[1])[0];
	const topProvider = topProviderEntry
		? { name: topProviderEntry[0], requests: topProviderEntry[1] }
		: null;

	// Most expensive model
	const modelCosts = new Map<string, number>();
	rows.forEach((r: any) => {
		const model = r.model_id || "unknown";
		const cost = Number(r.cost_nanos ?? 0) / 1e9;
		modelCosts.set(model, (modelCosts.get(model) || 0) + cost);
	});
	const mostExpensiveEntry = Array.from(modelCosts.entries()).sort((a, b) => b[1] - a[1])[0];
	const mostExpensive = mostExpensiveEntry
		? { name: mostExpensiveEntry[0], cost: mostExpensiveEntry[1] }
		: null;

	// Fastest model (average latency)
	const modelLatencies = new Map<string, number[]>();
	rows.forEach((r: any) => {
		const model = r.model_id || "unknown";
		const latency = Number(r.generation_ms ?? r.latency_ms ?? 0);
		if (latency > 0) {
			if (!modelLatencies.has(model)) {
				modelLatencies.set(model, []);
			}
			modelLatencies.get(model)!.push(latency);
		}
	});
	const modelAvgLatencies = Array.from(modelLatencies.entries())
		.map(([model, latencies]) => ({
			model,
			avg: latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
		}))
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
	const supabase = await createClient();
	const teamId = await getTeamIdFromCookie();

	if (!teamId || appIds.length === 0) {
		return new Map();
	}

	const { data: apps } = await supabase
		.from("api_apps")
		.select("id, title")
		.eq("team_id", teamId)
		.in("id", appIds);

	const appMap = new Map<string, string>();

	if (apps) {
		apps.forEach((app: any) => {
			appMap.set(app.id, app.title);
		});
	}

	return appMap;
}

/**
 * Investigate a generation by request_id
 * Uses team authentication - no API key required
 */
export async function investigateGeneration(
	requestId: string
): Promise<{ success: boolean; data?: any; error?: string }> {
	const supabase = await createClient();
	const teamId = await getTeamIdFromCookie();

	if (!teamId) {
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

	const { data, error } = await supabase
		.from("gateway_requests")
		.select("*")
		.eq("team_id", teamId)
		.eq("request_id", requestId.trim())
		.single();

	if (error) {
		if (error.code === "PGRST116") {
			return {
				success: false,
				error: "Request not found or not authorized",
			};
		}
		return {
			success: false,
			error: error.message || "Failed to fetch request",
		};
	}

	return {
		success: true,
		data,
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
	const teamId = await getTeamIdFromCookie();

	if (!teamId) {
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

	// Fetch current period data (aggregated)
	const { data: rows, error: rollupError } = await supabase.rpc(
		"get_usage_chart_rollup",
		{
			p_team: teamId,
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
			p_team: teamId,
			p_from: prevFrom,
			p_to: prevTo,
			p_bucket: bucketKey,
			p_key_id: params.keyFilter ?? null,
		},
	);
	if (prevError) {
		console.error("Error fetching usage rollup (prev):", prevError);
	}

	if (!rows) {
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

	// Build provider breakdown and chart data
	const providerBreakdown = new Map<string, ProviderMetrics>();
	const requestsBuckets = new Map<string, Map<string, number>>();
	const tokensBuckets = new Map<string, Map<string, number>>();
	const costBuckets = new Map<string, Map<string, number>>();

	(rows ?? []).forEach((row: any) => {
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
	const currentRequests = (rows ?? []).reduce(
		(sum: number, r: any) => sum + (Number(r.requests ?? 0) || 0),
		0,
	);
	const currentTokens = (rows ?? []).reduce(
		(sum: number, r: any) => sum + (Number(r.tokens ?? 0) || 0),
		0,
	);
	const currentCost = (rows ?? []).reduce(
		(sum: number, r: any) => sum + (Number(r.cost ?? 0) || 0),
		0,
	);

	const previousRequests = (prevRows ?? []).reduce(
		(sum: number, r: any) => sum + (Number(r.requests ?? 0) || 0),
		0,
	);
	const previousTokens = (prevRows ?? []).reduce(
		(sum: number, r: any) => sum + (Number(r.tokens ?? 0) || 0),
		0,
	);
	const previousCost = (prevRows ?? []).reduce(
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
