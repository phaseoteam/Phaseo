import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireUser } from "@/auth/requireUser";
import { requireAccountWorkspace } from "./context";

type Warning = {
	modelId: string; modelName: string | null; organisationId: string | null;
	lastUsedAt: string | null; deprecationDate: string | null; retirementDate: string | null;
	deprecationDaysUntil: number | null; retirementDaysUntil: number | null;
	replacementModelId: string | null; previousModelId: string | null;
	countAsAlert: boolean; severity: "fyi" | "notice" | "warning" | "critical";
};

function daysUntil(value: string | null): number | null {
	if (!value) return null;
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return null;
	const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
	const now = new Date();
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	return Math.ceil((target - today) / 86_400_000);
}

export const accountSettingsUsageRouter = new Hono<{ Bindings: Env }>();

function usageTimeRange(request: Request) {
	const url = new URL(request.url);
	const now = new Date();
	const customFrom = url.searchParams.get("usage_from");
	const customTo = url.searchParams.get("usage_to");
	if (customFrom && customTo && Number.isFinite(Date.parse(customFrom)) && Number.isFinite(Date.parse(customTo))) {
		return { from: new Date(customFrom).toISOString(), to: new Date(customTo).toISOString() };
	}
	const preset = (url.searchParams.get("usage_preset") ?? "past_24h").toLowerCase();
	const from = new Date(now);
	const relative = preset.match(/^(?:rel:)?(\d+)(mo|m|h|d|w|y)$/);
	if (relative) {
		const amount = Number(relative[1]);
		const unit = relative[2];
		if (unit === "m") from.setMinutes(from.getMinutes() - amount);
		else if (unit === "h") from.setHours(from.getHours() - amount);
		else if (unit === "d") from.setDate(from.getDate() - amount);
		else if (unit === "w") from.setDate(from.getDate() - amount * 7);
		else if (unit === "mo") from.setMonth(from.getMonth() - amount);
		else from.setFullYear(from.getFullYear() - amount);
	} else {
		const durations: Record<string, number> = { live: 5 / 60, past_15m: .25, past_30m: .5, past_hour: 1, past_3h: 3, past_24h: 24, past_2d: 48, last_7d: 168, last_30d: 720, last_90d: 2160, past_1y: 8760 };
		from.setTime(now.getTime() - (durations[preset] ?? 24) * 3_600_000);
	}
	return { from: from.toISOString(), to: now.toISOString() };
}

export async function metadataForIds(context: Awaited<ReturnType<typeof requireAccountWorkspace>>, args: { models?: string[]; providers?: string[]; apps?: string[] }) {
	if (!context) return { modelMetadataEntries: [], providerNameEntries: [], providerMetadataEntries: [], appMetadataEntries: [], appNameEntries: [] };
	const modelIds = Array.from(new Set(args.models ?? [])).filter(Boolean);
	const providerIds = Array.from(new Set(args.providers ?? [])).filter(Boolean);
	const appIds = Array.from(new Set(args.apps ?? [])).filter(Boolean);
	const [modelsResult, mappingsResult, providersResult, appsResult] = await Promise.all([
		modelIds.length ? context.client.from("v2_models").select("model_id:model_slug,name,organisation_id:lab_slug,organisation:v2_labs(name,metadata)").in("model_slug", modelIds) : Promise.resolve({ data: [], error: null }),
		modelIds.length ? context.client.from("v2_model_provider_routes").select("api_model_id:model_slug,model_id:model_slug").in("model_slug", modelIds) : Promise.resolve({ data: [], error: null }),
		providerIds.length ? context.client.from("v2_providers").select("api_provider_id:provider_slug,api_provider_name:name,provider_family_id:provider_family_slug,offer_label,offer_scope,prompt_training_policy,metadata").in("provider_slug", providerIds) : Promise.resolve({ data: [], error: null }),
		appIds.length ? context.client.from("api_apps").select("id,title,app_key,image_url").in("id", appIds) : Promise.resolve({ data: [], error: null }),
	]);
	const canonicalIds = Array.from(new Set((mappingsResult.data ?? []).map((row) => row.model_id).filter(Boolean)));
	const mappedModelsResult = canonicalIds.length ? await context.client.from("v2_models").select("model_id:model_slug,name,organisation_id:lab_slug,organisation:v2_labs(name,metadata)").in("model_slug", canonicalIds) : { data: [], error: null };
	const canonical = new Map<string, Record<string, unknown>>();
	for (const row of [...(modelsResult.data ?? []), ...(mappedModelsResult.data ?? [])]) canonical.set(row.model_id, row);
	const modelMetadata = new Map<string, Record<string, unknown>>();
	const addModel = (key: string, row: Record<string, any>) => {
		const organisation = Array.isArray(row.organisation) ? row.organisation[0] : row.organisation;
		modelMetadata.set(key, { organisationId: row.organisation_id ?? "", organisationName: organisation?.name ?? row.organisation_id ?? "", organisationColour: organisation?.metadata?.colour ?? null, modelName: row.name ?? key });
	};
	for (const [id, row] of canonical) addModel(id, row);
	for (const mapping of mappingsResult.data ?? []) {
		const row = canonical.get(mapping.model_id);
		if (row && mapping.api_model_id) addModel(mapping.api_model_id, row);
	}
	const providerNames = new Map<string, string>();
	const providerMetadata = new Map<string, Record<string, unknown>>();
	for (const provider of providersResult.data ?? []) {
		providerNames.set(provider.api_provider_id, provider.api_provider_name ?? provider.api_provider_id);
		providerMetadata.set(provider.api_provider_id, { id: provider.api_provider_id, name: provider.api_provider_name ?? provider.api_provider_id, colour: provider.metadata?.colour ?? null, providerFamilyId: provider.provider_family_id ?? null, offerLabel: provider.offer_label ?? null, offerScope: provider.offer_scope ?? null, promptTrainingPolicy: provider.prompt_training_policy ?? null });
	}
	const appMetadata = new Map<string, Record<string, unknown>>();
	const appNames = new Map<string, string>();
	for (const app of appsResult.data ?? []) {
		appMetadata.set(app.id, { id: app.id, title: app.title ?? app.app_key ?? app.id, appKey: app.app_key ?? null, imageUrl: app.image_url ?? null });
		appNames.set(app.id, app.title ?? app.app_key ?? app.id);
	}
	return { modelMetadataEntries: Array.from(modelMetadata.entries()), providerNameEntries: Array.from(providerNames.entries()), providerMetadataEntries: Array.from(providerMetadata.entries()), appMetadataEntries: Array.from(appMetadata.entries()), appNameEntries: Array.from(appNames.entries()) };
}

function stringParam(url: URL, name: string) { return url.searchParams.get(name)?.trim() || null; }

const REQUEST_LABEL_KEY = /^[A-Za-z0-9_.:-]+$/;

function requestLabelFilter(url: URL): { key: string; value: string } | { error: string } | null {
	const key = stringParam(url, "label_key");
	const value = stringParam(url, "label_value");
	if (!key && !value) return null;
	if (!key || !value) return { error: "label_key and label_value must be provided together" };
	if (key.length > 64 || !REQUEST_LABEL_KEY.test(key)) return { error: "label_key is invalid" };
	if (value.length > 256) return { error: "label_value is too long" };
	return { key, value };
}

function extractRequestLabels(value: unknown): Array<{ key: string; value: string }> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return [];
	const labels = (value as Record<string, unknown>).labels;
	if (!Array.isArray(labels)) return [];
	return labels.flatMap((label) => {
		if (!label || typeof label !== "object" || Array.isArray(label)) return [];
		const key = (label as Record<string, unknown>).key;
		const labelValue = (label as Record<string, unknown>).value;
		return typeof key === "string" && typeof labelValue === "string" ? [{ key, value: labelValue }] : [];
	});
}

const OBSERVABILITY_SELECT = "created_at,model_id,provider,app_id,key_id,usage,cost_nanos,success,error_payload,error_message,pricing_lines";
const OBSERVABILITY_EXCLUDED_ENDPOINTS = '("video.generation","batch","music.generate")';

export function sortUpstreamRequestsNewestFirst<
	T extends { attempt_number?: number | null; created_at?: string | null; request_id?: string | null },
>(rows: T[]): T[] {
	return rows.sort((left, right) => {
		const startedAtDifference = Date.parse(right.created_at ?? "") - Date.parse(left.created_at ?? "");
		if (Number.isFinite(startedAtDifference) && startedAtDifference !== 0) return startedAtDifference;
		const requestDifference = String(left.request_id ?? "").localeCompare(String(right.request_id ?? ""));
		if (requestDifference !== 0) return requestDifference;
		return Number(right.attempt_number ?? 0) - Number(left.attempt_number ?? 0);
	});
}

accountSettingsUsageRouter.get("/usage/metadata", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const url = new URL(c.req.url);
	const workspaceId = stringParam(url, "workspaceId");
	if (!workspaceId) return c.json({ error: "workspace_required" }, 400, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const split = (name: string) => (url.searchParams.get(name) ?? "").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 500);
	try {
		const metadata = await metadataForIds(context, { models: split("models"), providers: split("providers"), apps: split("apps") });
		return c.json(metadata, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/settings] usage metadata failed", error);
		return c.json({ error: "usage_metadata_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});


accountSettingsUsageRouter.get("/usage/geography", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ signedIn: false, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const url = new URL(c.req.url);
	const workspaceId = stringParam(url, "workspaceId");
	if (!workspaceId) return c.json({ signedIn: true, workspaceId: null, data: [] }, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const { from, to } = usageTimeRange(c.req.raw);
	try {
		const { data, error } = await getDataClient(c.env).rpc("get_private_geography_usage", {
			p_workspace_id: workspaceId,
			p_from: from,
			p_to: to,
		});
		if (error) throw error;
		return c.json({ data: data ?? [], from, to, signedIn: true, workspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/settings] geography failed", error);
		return c.json({ error: "usage_geography_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsUsageRouter.get("/usage/observability", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ signedIn: false, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const url = new URL(c.req.url);
	const workspaceId = stringParam(url, "workspaceId");
	if (!workspaceId) return c.json({ signedIn: true, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const from = stringParam(url, "from");
	const to = stringParam(url, "to");
	const previousFrom = stringParam(url, "previousFrom");
	const previousTo = stringParam(url, "previousTo");
	if (![from, to, previousFrom, previousTo].every((value) => value && Number.isFinite(Date.parse(value)))) {
		return c.json({ error: "invalid_time_range" }, 400, PRIVATE_NO_STORE_HEADERS);
	}
	const labelFilterResult = requestLabelFilter(url);
	if (labelFilterResult && "error" in labelFilterResult) return c.json({ error: "invalid_label_filter", description: labelFilterResult.error }, 400, PRIVATE_NO_STORE_HEADERS);
	const labelFilter = labelFilterResult && "key" in labelFilterResult ? labelFilterResult : null;
	const limit = 5000;
	const loadWindow = async (start: string, end: string) => {
		const pageSize = 1000;
		const rows: any[] = [];
		for (let offset = 0; rows.length <= limit; offset += pageSize) {
			let query = context.client.from("v2_web_gateway_requests").select(OBSERVABILITY_SELECT)
				.eq("workspace_id", workspaceId).gte("created_at", start).lte("created_at", end)
				.not("endpoint", "in", OBSERVABILITY_EXCLUDED_ENDPOINTS);
			if (labelFilter) query = query.contains("detail_metadata", { labels: [{ key: labelFilter.key, value: labelFilter.value }] });
			const result = await query.order("created_at", { ascending: true }).range(offset, offset + pageSize - 1);
			if (result.error) throw result.error;
			const page = result.data ?? [];
			rows.push(...page);
			if (page.length < pageSize) break;
		}
		return { rows: rows.slice(0, limit), isSampled: rows.length > limit, limit };
	};
	try {
		const labelFacetFactsQuery = context.client.from("v2_request_facts").select("safe_metadata", { count: "exact" }).eq("workspace_id", workspaceId).gte("occurred_at", from!).lte("occurred_at", to!).limit(5000);
		const labelSummaryFactsQuery = labelFilter
			? context.client.from("v2_request_facts").select("cost_nanos", { count: "exact" }).eq("workspace_id", workspaceId).gte("occurred_at", from!).lte("occurred_at", to!).contains("safe_metadata", { labels: [{ key: labelFilter.key, value: labelFilter.value }] }).limit(5000)
			: null;
		const [keysResult, current, previous, labelFacetFactsResult, labelSummaryFactsResult] = await Promise.all([
			context.client.from("keys").select("id,name,prefix").eq("workspace_id", workspaceId)
				.neq("status", "deleted").neq("name", "__chat_route_managed_key__").order("created_at", { ascending: true }),
			loadWindow(from!, to!),
			loadWindow(previousFrom!, previousTo!),
			labelFacetFactsQuery,
			labelSummaryFactsQuery,
		]);
		if (keysResult.error) throw keysResult.error;
		const labelFacetFacts = labelFacetFactsResult.error ? [] : (labelFacetFactsResult.data ?? []);
		const labelSummaryFacts = labelSummaryFactsResult?.error ? [] : (labelSummaryFactsResult?.data ?? []);
		const labelFacetMap = new Map<string, { key: string; value: string }>();
		for (const row of labelFacetFacts) for (const label of extractRequestLabels(row.safe_metadata)) {
			const identity = `${label.key}\u0000${label.value}`;
			if (!labelFacetMap.has(identity)) labelFacetMap.set(identity, label);
		}
		const labelFacets = Array.from(labelFacetMap.values()).sort((left, right) => left.key.localeCompare(right.key) || left.value.localeCompare(right.value)).slice(0, 500);
		const labelSummary = labelFilter ? {
			key: labelFilter.key,
			value: labelFilter.value,
			requestCount: labelSummaryFactsResult?.count ?? labelSummaryFacts.length,
			totalCostNanos: labelSummaryFacts.reduce((total, row) => total + Number(row.cost_nanos ?? 0), 0),
			isSampled: (labelSummaryFactsResult?.count ?? labelSummaryFacts.length) > labelSummaryFacts.length,
		} : null;
		const rows = [...current.rows, ...previous.rows];
		const models = Array.from(new Set(rows.map((row) => String(row.model_id ?? "").trim()).filter(Boolean)));
		const apps = Array.from(new Set(rows.map((row) => String(row.app_id ?? "").trim()).filter(Boolean)));
		const metadata = await metadataForIds(context, { models, apps });
		return c.json({
			appMetadataEntries: metadata.appMetadataEntries,
			appNameEntries: metadata.appNameEntries,
			current,
			keys: keysResult.data ?? [],
			labelFacets,
			labelSummary,
			modelMetadataEntries: metadata.modelMetadataEntries,
			previous,
			signedIn: true,
			workspaceId,
		}, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("[web-api/settings] observability failed", error);
		return c.json({ error: "usage_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});

accountSettingsUsageRouter.get("/usage/logs", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	const url = new URL(c.req.url);
	const view = ["upstream", "jobs", "sessions"].includes(url.searchParams.get("view") ?? "") ? url.searchParams.get("view")! : "logs";
	if (!user) return c.json({ data: null, signedIn: false, view, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const workspaceId = stringParam(url, "workspaceId");
	if (!workspaceId) return c.json({ data: null, signedIn: true, view, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const timeRange = usageTimeRange(c.req.raw);
	if (view === "upstream") {
		const v2Result = await context.client
			.from("v2_request_facts")
			.select("request_event_id,occurred_at,request_id,key_id,endpoint,requested_model_input,requested_model_slug,routed_model_slug,provider_model_id,status_code,success,error_code,byok,latency_ms,generation_ms,gateway_total_ms,upstream_attempt_count,throughput,cost_nanos,currency,client_source_id,client_source_name,client_source_kind,client_source_version,client_source_detection,v2_request_attempts(attempt_id,attempt_number,provider_model_id,started_at,completed_at,status_code,success,error_code,failure_class,upstream_response_id,latency_ms,safe_metadata)")
			.eq("workspace_id", workspaceId)
			.gte("occurred_at", timeRange.from)
			.lte("occurred_at", timeRange.to)
			.order("occurred_at", { ascending: false })
			.limit(500);
		const v2UpstreamRequests = sortUpstreamRequestsNewestFirst((v2Result.data ?? []).flatMap((fact: any) => {
			const attempts = Array.isArray(fact.v2_request_attempts) ? fact.v2_request_attempts : [];
			const newestAttemptsFirst = [...attempts].sort((left: any, right: any) => {
				const startedAtDifference = Date.parse(right.started_at ?? "") - Date.parse(left.started_at ?? "");
				if (Number.isFinite(startedAtDifference) && startedAtDifference !== 0) return startedAtDifference;
				return Number(right.attempt_number ?? 0) - Number(left.attempt_number ?? 0);
			});
			return newestAttemptsFirst.map((attempt: any) => {
				const safeMetadata = attempt.safe_metadata && typeof attempt.safe_metadata === "object" && !Array.isArray(attempt.safe_metadata)
					? attempt.safe_metadata as Record<string, unknown>
					: {};
				const providerModelId = String(attempt.provider_model_id ?? fact.provider_model_id ?? "").trim();
				const routeSeparator = providerModelId.indexOf(":");
				const metadataProvider = typeof safeMetadata.provider === "string" ? safeMetadata.provider.trim() : "";
				const provider = metadataProvider || (routeSeparator > 0 ? providerModelId.slice(0, routeSeparator) : null);
				const providerModelSlug = routeSeparator > 0 ? providerModelId.slice(routeSeparator + 1) : null;
				const keySource = safeMetadata.key_source === "byok" || fact.byok === true ? "byok" : "gateway";
				return {
					id: attempt.attempt_id,
					created_at: attempt.started_at ?? fact.occurred_at,
					gateway_request_id: fact.request_event_id,
					request_id: fact.request_id,
					sequence: attempt.attempt_number,
					round_number: 1,
					attempt_number: attempt.attempt_number,
					attempt_count: fact.upstream_attempt_count,
					internal_attempt_number: null,
					stage: "upstream",
					endpoint: fact.endpoint,
					model_id: fact.routed_model_slug ?? fact.requested_model_slug ?? fact.requested_model_input,
					provider,
					api_model_id: providerModelSlug,
					provider_model_slug: providerModelSlug,
					status_code: attempt.status_code,
					status_text: null,
					success: attempt.success === true,
					outcome: attempt.success === true ? "success" : attempt.failure_class ?? "error",
					retryable: typeof safeMetadata.retryable === "boolean" ? safeMetadata.retryable : null,
					fallback_attempted: Number(attempt.attempt_number ?? 1) > 1,
					was_probe: safeMetadata.was_probe === true,
					key_source: keySource,
					key_id: fact.key_id ?? null,
					native_response_id: attempt.upstream_response_id,
					provider_finish_reason: null,
					finish_reason: null,
					duration_ms: attempt.latency_ms,
					latency_ms: attempt.latency_ms,
					generation_ms: fact.generation_ms,
					total_ms: fact.gateway_total_ms,
					usage: {},
					cost_nanos: fact.cost_nanos,
					currency: fact.currency,
					client_source_id: fact.client_source_id ?? null,
					client_source_name: fact.client_source_name ?? null,
					client_source_kind: fact.client_source_kind ?? null,
					client_source_version: fact.client_source_version ?? null,
					client_source_detection: fact.client_source_detection ?? null,
					error_code: attempt.error_code ?? fact.error_code,
					error_type: attempt.failure_class,
					error_message: null,
					request_payload: null,
					response_payload: null,
					metadata: { ...safeMetadata, throughput: fact.throughput },
				};
			});
		}));
		let upstreamRequests: any[] = v2UpstreamRequests;
		if (upstreamRequests.length === 0) {
			const legacyResult = await context.client
				.from("gateway_upstream_requests")
				.select("id,created_at,gateway_request_id,request_id,sequence,round_number,attempt_number,internal_attempt_number,stage,endpoint,model_id,provider,api_model_id,provider_model_slug,status_code,status_text,success,outcome,retryable,fallback_attempted,was_probe,key_source,key_id,native_response_id,provider_finish_reason,finish_reason,duration_ms,latency_ms,generation_ms,total_ms,request_build_ms,upstream_headers_ms,retry_delay_ms,usage,cost_nanos,currency,error_code,error_type,error_message,error_description,error_param,request_payload,response_payload,metadata")
				.eq("workspace_id", workspaceId)
				.gte("created_at", timeRange.from)
				.lte("created_at", timeRange.to)
				.order("created_at", { ascending: false })
				.order("sequence", { ascending: true })
				.limit(500);
			if (legacyResult.error && v2Result.error) return c.json({ error: "usage_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
			upstreamRequests = legacyResult.data ?? [];
		}
		const models = Array.from(new Set(upstreamRequests.map((row) => String(row.model_id ?? "").trim()).filter(Boolean)));
		const providers = Array.from(new Set(upstreamRequests.map((row) => String(row.provider ?? "").trim()).filter(Boolean)));
		const metadata = await metadataForIds(context, { models, providers });
		const keysResult = await context.client.from("keys").select("id,name,prefix").eq("workspace_id", workspaceId).neq("status", "deleted").neq("name", "__chat_route_managed_key__").order("created_at", { ascending: true });
		return c.json({ data: { availableKeys: keysResult.data ?? [], modelMetadataEntries: metadata.modelMetadataEntries, providerMetadataEntries: metadata.providerMetadataEntries, providerNameEntries: metadata.providerNameEntries, upstreamRequests }, signedIn: true, view, workspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
	}
	if (view === "jobs") {
		let query = context.client.from("gateway_async_operations").select("kind,internal_id,request_id,session_id,app_id,provider,model,status,billed_at,created_at,updated_at,meta").eq("workspace_id", workspaceId).in("kind", ["video", "batch"]).not("internal_id", "like", "__file__:%").gte("created_at", timeRange.from).lte("created_at", timeRange.to);
		const kind = stringParam(url, "job_kind"); if (kind === "video" || kind === "batch") query = query.eq("kind", kind);
		const status = stringParam(url, "job_status"); if (status) query = query.eq("status", status);
		const provider = stringParam(url, "job_provider"); if (provider) query = query.eq("provider", provider);
		const result = await query.order("updated_at", { ascending: false }).limit(50);
		if (result.error) return c.json({ error: "usage_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		const recentJobsBase = (result.data ?? []).map((row) => ({ ...row, ...(row.meta && typeof row.meta === "object" && !Array.isArray(row.meta) ? row.meta : {}), webhook: row.meta && typeof row.meta === "object" && !Array.isArray(row.meta) ? (row.meta as Record<string, unknown>).webhook ?? null : null }));
		const requestIds = Array.from(new Set(recentJobsBase.map((row) => row.request_id).filter(Boolean)));
		const requestSourcesResult = requestIds.length
			? await context.client.from("gateway_requests")
				.select("request_id,client_source_id,client_source_name,client_source_kind,client_source_version,client_source_detection")
				.eq("workspace_id", workspaceId)
				.in("request_id", requestIds)
			: { data: [], error: null };
		const requestSources = new Map((requestSourcesResult.data ?? []).map((row) => [row.request_id, row]));
		const recentJobs = recentJobsBase.map((row) => ({ ...row, ...(requestSources.get(row.request_id) ?? {}) }));
		const models = recentJobs.map((row) => String(row.model ?? "")).filter(Boolean); const providers = recentJobs.map((row) => String(row.provider ?? "")).filter(Boolean); const apps = recentJobs.map((row) => String(row.app_id ?? "")).filter(Boolean);
		const metadata = await metadataForIds(context, { models, providers, apps });
		return c.json({ data: { appMetadataEntries: metadata.appMetadataEntries, jobProviders: Array.from(new Set(providers)), modelMetadataEntries: metadata.modelMetadataEntries, providerNameEntries: metadata.providerNameEntries, recentJobs }, signedIn: true, view, workspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
	}
	if (view === "sessions") {
		let query = context.client.from("gateway_requests").select("session_id,created_at,cost_nanos,app_id,model_id,provider,end_user_id").eq("workspace_id", workspaceId).not("session_id", "is", null).gte("created_at", timeRange.from).lte("created_at", timeRange.to);
		const session = stringParam(url, "session"); if (session) query = query.eq("session_id", session);
		const app = stringParam(url, "session_app"); if (app) query = query.eq("app_id", app);
		const model = stringParam(url, "session_model"); if (model) query = query.eq("model_id", model);
		const provider = stringParam(url, "session_provider"); if (provider) query = query.eq("provider", provider);
		const result = await query.order("created_at", { ascending: false }).limit(5000);
		if (result.error) return c.json({ error: "usage_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		const groups = new Map<string, any>();
		for (const row of result.data ?? []) {
			if (!row.session_id) continue; const entry = groups.get(row.session_id) ?? { session_id: row.session_id, request_count: 0, total_cost_nanos: 0, first_request_at: row.created_at, last_request_at: row.created_at, app_ids: new Set<string>(), model_ids: new Set<string>(), provider_ids: new Set<string>(), end_user_ids: new Set<string>() };
			entry.request_count += 1; entry.total_cost_nanos += Number(row.cost_nanos ?? 0); if (row.created_at < entry.first_request_at) entry.first_request_at = row.created_at; if (row.created_at > entry.last_request_at) entry.last_request_at = row.created_at; if (row.app_id) entry.app_ids.add(row.app_id); if (row.model_id) entry.model_ids.add(row.model_id); if (row.provider) entry.provider_ids.add(row.provider); if (row.end_user_id) entry.end_user_ids.add(row.end_user_id); groups.set(row.session_id, entry);
		}
		const sessions = Array.from(groups.values()).sort((a, b) => Date.parse(b.last_request_at) - Date.parse(a.last_request_at)).slice(0, 100).map((entry) => ({ ...entry, total_cost_usd: entry.total_cost_nanos / 1e9, app_ids: Array.from(entry.app_ids), model_ids: Array.from(entry.model_ids), provider_ids: Array.from(entry.provider_ids), end_user_ids: Array.from(entry.end_user_ids) }));
		const appIds = Array.from(new Set(sessions.flatMap((row) => row.app_ids))); const modelIds = Array.from(new Set(sessions.flatMap((row) => row.model_ids))); const providerIds = Array.from(new Set(sessions.flatMap((row) => row.provider_ids)));
		const metadata = await metadataForIds(context, { models: modelIds, providers: providerIds, apps: appIds });
		return c.json({ data: { appMetadataEntries: metadata.appMetadataEntries, modelMetadataEntries: metadata.modelMetadataEntries, providerMetadataEntries: metadata.providerMetadataEntries, providerNameEntries: metadata.providerNameEntries, sessionAppIds: appIds, sessionModelIds: modelIds, sessionProviderIds: providerIds, sessions }, signedIn: true, view, workspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
	}
	const page = 1;
	const requestedPageSize = Number.parseInt(stringParam(url, "per_page") ?? "50", 10);
	const pageSize = [25, 50, 100].includes(requestedPageSize) ? requestedPageSize : 50;
	const labelFilterResult = requestLabelFilter(url);
	if (labelFilterResult && "error" in labelFilterResult) return c.json({ error: "invalid_label_filter", description: labelFilterResult.error }, 400, PRIVATE_NO_STORE_HEADERS);
	const labelFilter = labelFilterResult && "key" in labelFilterResult ? labelFilterResult : null;
	let requestQuery = context.client.from("gateway_requests").select("id,request_id,created_at,endpoint,model_id,requested_model_id,routed_model_id,provider,native_response_id,stream,session_id,app_id,usage,usage_input_tokens,usage_output_tokens,usage_total_tokens,cost_nanos,generation_ms,latency_ms,finish_reason,success,status_code,error_code,client_source_id,client_source_name,client_source_kind,client_source_version,client_source_detection,key_id,throughput").eq("workspace_id", workspaceId).gte("created_at", timeRange.from).lte("created_at", timeRange.to).not("endpoint", "in", '("video.generation","batch","music.generate")');
	if (labelFilter) requestQuery = requestQuery.contains("detail_metadata", { labels: [{ key: labelFilter.key, value: labelFilter.value }] });
	for (const [param, column, operatorParam = `${param}_op`] of [
		["model", "model_id"], ["provider", "provider"], ["app", "app_id"],
		["endpoint", "endpoint"], ["finish_reason", "finish_reason", "finish_op"],
		["error_code", "error_code", "error_op"], ["http_status", "status_code", "http_op"],
		["key", "key_id"], ["req", "request_id"], ["session", "session_id"],
	] as const) {
		const value = stringParam(url, param);
		if (value) requestQuery = stringParam(url, operatorParam) === "is_not"
			? requestQuery.neq(column, value)
			: requestQuery.eq(column, value);
	}
	const status = stringParam(url, "status");
	if (status === "success" || status === "error") {
		const statusValue = status === "success";
		requestQuery = stringParam(url, "status_op") === "is_not"
			? requestQuery.neq("success", statusValue)
			: requestQuery.eq("success", statusValue);
	}
	const stream = stringParam(url, "stream");
	if (stream === "streaming" || stream === "non_streaming") {
		const streamValue = stream === "streaming";
		requestQuery = stringParam(url, "stream_op") === "is_not"
			? requestQuery.neq("stream", streamValue)
			: requestQuery.eq("stream", streamValue);
	}
	const source = stringParam(url, "source");
	if (source) {
		requestQuery = stringParam(url, "source_op") === "is_not"
			? requestQuery.neq("client_source_id", source)
			: requestQuery.eq("client_source_id", source);
	}
	for (const [param, maxParam, operatorParam, column] of [
		["input_tokens", "input_tokens_max", "input_tokens_op", "usage_input_tokens"],
		["output_tokens", "output_tokens_max", "output_tokens_op", "usage_output_tokens"],
		["total_tokens", "total_tokens_max", "total_tokens_op", "usage_total_tokens"],
	] as const) {
		const rawValue = stringParam(url, param);
		if (!rawValue || !/^\d+$/.test(rawValue)) continue;
		const value = Number(rawValue);
		const operator = stringParam(url, operatorParam) ?? "gte";
		if (operator === "eq") requestQuery = requestQuery.eq(column, value);
		else if (operator === "lte") requestQuery = requestQuery.lte(column, value);
		else if (operator === "between") {
			const rawMax = stringParam(url, maxParam);
			if (rawMax && /^\d+$/.test(rawMax)) requestQuery = requestQuery.gte(column, value).lte(column, Number(rawMax));
		} else requestQuery = requestQuery.gte(column, value);
	}
	const requestsResult = await requestQuery.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize + 1);
	if (requestsResult.error) return c.json({ error: "usage_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const labelFacetFactsQuery = context.client.from("v2_request_facts").select("safe_metadata", { count: "exact" }).eq("workspace_id", workspaceId).gte("occurred_at", timeRange.from).lte("occurred_at", timeRange.to).limit(5000);
	const labelSummaryFactsQuery = labelFilter
		? context.client.from("v2_request_facts").select("cost_nanos", { count: "exact" }).eq("workspace_id", workspaceId).gte("occurred_at", timeRange.from).lte("occurred_at", timeRange.to).contains("safe_metadata", { labels: [{ key: labelFilter.key, value: labelFilter.value }] }).limit(5000)
		: null;
	const [rollupResult, keysResult, facetsResult, labelFacetFactsResult, labelSummaryFactsResult] = await Promise.all([
		context.client.from("v2_web_private_usage_daily").select("canonical_model_id,provider,app_id").eq("workspace_id", workspaceId).gte("bucket_15m", timeRange.from).lte("bucket_15m", timeRange.to),
		context.client.from("keys").select("id,name,prefix").eq("workspace_id", workspaceId).neq("status", "deleted").neq("name", "__chat_route_managed_key__").order("created_at", { ascending: true }),
		context.client.rpc("get_gateway_request_facets", {
			p_workspace_id: workspaceId,
			p_from: timeRange.from,
			p_to: timeRange.to,
			p_filters: {},
		}),
		labelFacetFactsQuery,
		labelSummaryFactsQuery,
	]);
	const requestRows = requestsResult.data ?? [];
	const hasMoreRequests = requestRows.length > pageSize;
	const visibleRequestRows = requestRows.slice(0, pageSize);
	const values = <T,>(selector: (row: (typeof visibleRequestRows)[number]) => T | null | undefined) => Array.from(new Set(visibleRequestRows.map(selector).filter((value): value is T => value != null && value !== "")));
	const models = Array.from(new Set([...values((row) => row.model_id), ...(rollupResult.data ?? []).map((row) => row.canonical_model_id)].filter(Boolean)));
	const providers = Array.from(new Set([...values((row) => row.provider), ...(rollupResult.data ?? []).map((row) => row.provider)].filter(Boolean)));
	const apps = Array.from(new Set([...values((row) => row.app_id), ...(rollupResult.data ?? []).map((row) => row.app_id)].filter(Boolean)));
	const providerSets = new Map<string, Set<string>>(); for (const row of rollupResult.data ?? []) if (row.canonical_model_id && row.provider) providerSets.set(row.canonical_model_id, new Set([...(providerSets.get(row.canonical_model_id) ?? []), row.provider]));
	const metadata = await metadataForIds(context, { models, providers, apps });
	const lastRequestRow = visibleRequestRows.at(-1);
	const nextRequestCursor = hasMoreRequests && lastRequestRow ? { createdAt: lastRequestRow.created_at, id: lastRequestRow.id } : null;
	const clientSources = facetsResult.error
		? values((row) => row.client_source_id).map((id) => ({ id, name: visibleRequestRows.find((row) => row.client_source_id === id)?.client_source_name ?? id }))
		: (facetsResult.data ?? [])
			.filter((row) => row.facet === "source" && row.value)
			.map((row) => ({ id: row.value, name: row.value_label ?? row.value }));
	const logEndpoints = values((row) => row.endpoint);
	const logFinishReasons = values((row) => row.finish_reason);
	const logErrorCodes = values((row) => row.error_code);
	const logStatusCodes = values((row) => row.status_code).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
	const labelFacetFacts = labelFacetFactsResult.error ? [] : (labelFacetFactsResult.data ?? []);
	const labelSummaryFacts = labelSummaryFactsResult?.error ? [] : (labelSummaryFactsResult?.data ?? []);
	const labelFacetMap = new Map<string, { key: string; value: string }>();
	for (const row of labelFacetFacts) for (const label of extractRequestLabels(row.safe_metadata)) {
		const identity = `${label.key}\u0000${label.value}`;
		if (!labelFacetMap.has(identity)) labelFacetMap.set(identity, label);
	}
	const labelFacets = Array.from(labelFacetMap.values()).sort((left, right) => left.key.localeCompare(right.key) || left.value.localeCompare(right.value)).slice(0, 500);
	const labelSummary = labelFilter ? {
		key: labelFilter.key,
		value: labelFilter.value,
		requestCount: labelSummaryFactsResult?.count ?? labelSummaryFacts.length,
		totalCostNanos: labelSummaryFacts.reduce((total, row) => total + Number(row.cost_nanos ?? 0), 0),
		isSampled: (labelSummaryFactsResult?.count ?? labelSummaryFacts.length) > labelSummaryFacts.length,
	} : null;
	return c.json({ data: { appNameEntries: metadata.appNameEntries, availableKeys: keysResult.data ?? [], clientSources, dedupedModels: models, dedupedProviders: providers, labelFacets, labelSummary, logAppIds: apps, logEndpoints, logFinishReasons, logErrorCodes, logStatusCodes, initialRequestsPage: { data: visibleRequestRows, page, pageSize, hasMore: hasMoreRequests, nextCursor: nextRequestCursor }, modelMetadataEntries: metadata.modelMetadataEntries, modelProviderEntries: Array.from(providerSets.entries()).map(([id, values]) => [id, Array.from(values)]), providerMetadataEntries: metadata.providerMetadataEntries, providerNameEntries: metadata.providerNameEntries }, signedIn: true, view, workspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsUsageRouter.get("/usage/alerts", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ signedIn: false, warnings: [], workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return c.json({ signedIn: true, warnings: [], workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const now = Date.now();
	const windowStart = new Date(now - 7 * 86_400_000).toISOString().slice(0, 10);
	const windowEnd = new Date(now + 90 * 86_400_000).toISOString().slice(0, 10);
	const lifecycleResult = await context.client.from("v2_models")
		.select("model_id:model_slug,name,organisation_id:lab_slug,deprecation_date:deprecated_at,retirement_date:retired_at,previous_model_id:previous_model_slug,replacement_model_id:replacement_model_slug")
		.eq("hidden", false)
		.or(`and(retired_at.gte.${windowStart},retired_at.lte.${windowEnd}),and(deprecated_at.gte.${windowStart},deprecated_at.lte.${windowEnd})`);
	if (lifecycleResult.error) return c.json({ error: "usage_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const lifecycleModels = lifecycleResult.data ?? [];
	const lifecycleIds = lifecycleModels.map((row) => row.model_id).filter(Boolean);
	if (!lifecycleIds.length) return c.json({ signedIn: true, warnings: [], workspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
	const usageResult = await context.client.rpc("get_workspace_model_last_used", {
		p_workspace_id: workspaceId,
		p_since: new Date(now - 90 * 86_400_000).toISOString(),
	});
	const usageRows = usageResult.error ? [] : usageResult.data ?? [];
	const usedIds = Array.from(new Set(usageRows.map((row) => String(row.model_id ?? "")).filter(Boolean)));
	const idMap = new Map<string, string>();
	if (usedIds.length) {
		const [apiResult, internalResult, providerResult] = await Promise.all([
			context.client.from("v2_model_provider_routes").select("api_model_id:model_slug,internal_model_id:model_slug").in("model_slug", usedIds).limit(5000),
			context.client.from("v2_model_provider_routes").select("api_model_id:model_slug,internal_model_id:model_slug").in("model_slug", usedIds).limit(5000),
			context.client.from("v2_model_provider_routes").select("provider_api_model_id:provider_model_id,api_model_id:model_slug,internal_model_id:model_slug").in("provider_model_id", usedIds).limit(5000),
		]);
		for (const row of [...(apiResult.data ?? []), ...(internalResult.data ?? [])]) {
			if (row.api_model_id && row.internal_model_id) idMap.set(row.api_model_id, row.internal_model_id);
		}
		for (const row of providerResult.data ?? []) {
			if (!row.internal_model_id) continue;
			if (row.provider_api_model_id) idMap.set(row.provider_api_model_id, row.internal_model_id);
			if (row.api_model_id) idMap.set(row.api_model_id, row.internal_model_id);
		}
	}
	const lastUsed = new Map<string, string>();
	for (const row of usageRows) {
		const usedId = String(row.model_id ?? "");
		const timestamp = typeof row.last_used_at === "string" ? row.last_used_at : null;
		if (!usedId || !timestamp) continue;
		const internalId = idMap.get(usedId) ?? usedId;
		const previous = lastUsed.get(internalId);
		if (!previous || Date.parse(timestamp) > Date.parse(previous)) lastUsed.set(internalId, timestamp);
	}
	const replacementsResult = await context.client.from("v2_models")
		.select("model_id:model_slug,previous_model_id:previous_model_slug").eq("hidden", false).in("previous_model_slug", lifecycleIds);
	const replacementByPrevious = new Map<string, string>();
	for (const row of replacementsResult.data ?? []) {
		if (row.previous_model_id && row.model_id && !replacementByPrevious.has(row.previous_model_id)) replacementByPrevious.set(row.previous_model_id, row.model_id);
	}
	const warnings = lifecycleModels.map((model): Warning => {
		const deprecationDate = model.deprecation_date ?? null;
		const retirementDate = model.retirement_date ?? null;
		const deprecationDaysUntil = daysUntil(deprecationDate);
		const retirementDaysUntil = daysUntil(retirementDate);
		const primary = retirementDaysUntil ?? deprecationDaysUntil;
		const lastUsedAt = lastUsed.get(model.model_id) ?? null;
		const usedRecently = Boolean(lastUsedAt && Date.parse(lastUsedAt) >= now - 90 * 86_400_000);
		let severity: Warning["severity"] = "fyi";
		if (primary != null && primary >= 0 && primary <= 90 && usedRecently) severity = primary <= 7 ? "critical" : primary <= 28 ? "warning" : "notice";
		return { modelId: model.model_id, modelName: model.name ?? null, organisationId: model.organisation_id ?? null, lastUsedAt, deprecationDate, retirementDate, deprecationDaysUntil, retirementDaysUntil, replacementModelId: model.replacement_model_id ?? replacementByPrevious.get(model.model_id) ?? null, previousModelId: model.previous_model_id ?? null, countAsAlert: usedRecently && primary != null && primary >= 0 && primary <= 90, severity };
	}).filter((warning) => [warning.deprecationDaysUntil, warning.retirementDaysUntil].some((days) => days != null && days >= -7 && days <= 90))
		.sort((left, right) => Math.min(left.retirementDaysUntil ?? Infinity, left.deprecationDaysUntil ?? Infinity) - Math.min(right.retirementDaysUntil ?? Infinity, right.deprecationDaysUntil ?? Infinity));
	return c.json({ signedIn: true, warnings, workspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
});
