import { Hono } from "hono";
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
		const durations: Record<string, number> = { live: 5 / 60, past_15m: .25, past_30m: .5, past_hour: 1, past_3h: 3, past_24h: 24, past_2d: 48, last_7d: 168, last_30d: 720, last_90d: 2160 };
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
		modelIds.length ? context.client.from("data_models").select("model_id,name,organisation_id,organisation:data_organisations!data_models_organisation_id_fkey(name,colour)").in("model_id", modelIds) : Promise.resolve({ data: [], error: null }),
		modelIds.length ? context.client.from("data_api_provider_models").select("api_model_id,model_id").in("api_model_id", modelIds) : Promise.resolve({ data: [], error: null }),
		providerIds.length ? context.client.from("data_api_providers").select("api_provider_id,api_provider_name,colour,provider_family_id,offer_label,offer_scope,prompt_training_policy").in("api_provider_id", providerIds) : Promise.resolve({ data: [], error: null }),
		appIds.length ? context.client.from("api_apps").select("id,title,app_key,image_url").in("id", appIds) : Promise.resolve({ data: [], error: null }),
	]);
	const canonicalIds = Array.from(new Set((mappingsResult.data ?? []).map((row) => row.model_id).filter(Boolean)));
	const mappedModelsResult = canonicalIds.length ? await context.client.from("data_models").select("model_id,name,organisation_id,organisation:data_organisations!data_models_organisation_id_fkey(name,colour)").in("model_id", canonicalIds) : { data: [], error: null };
	const canonical = new Map<string, Record<string, unknown>>();
	for (const row of [...(modelsResult.data ?? []), ...(mappedModelsResult.data ?? [])]) canonical.set(row.model_id, row);
	const modelMetadata = new Map<string, Record<string, unknown>>();
	const addModel = (key: string, row: Record<string, any>) => {
		const organisation = Array.isArray(row.organisation) ? row.organisation[0] : row.organisation;
		modelMetadata.set(key, { organisationId: row.organisation_id ?? "", organisationName: organisation?.name ?? row.organisation_id ?? "", organisationColour: organisation?.colour ?? null, modelName: row.name ?? key });
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
		providerMetadata.set(provider.api_provider_id, { id: provider.api_provider_id, name: provider.api_provider_name ?? provider.api_provider_id, colour: provider.colour ?? null, providerFamilyId: provider.provider_family_id ?? null, offerLabel: provider.offer_label ?? null, offerScope: provider.offer_scope ?? null, promptTrainingPolicy: provider.prompt_training_policy ?? null });
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

const OBSERVABILITY_SELECT = "created_at,model_id,provider,app_id,key_id,usage,cost_nanos,success,error_payload,error_message,pricing_lines";
const OBSERVABILITY_EXCLUDED_ENDPOINTS = '("video.generation","batch","music.generate")';

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
	const limit = 5000;
	const loadWindow = async (start: string, end: string) => {
		const result = await context.client.from("gateway_requests").select(OBSERVABILITY_SELECT)
			.eq("workspace_id", workspaceId).gte("created_at", start).lte("created_at", end)
			.not("endpoint", "in", OBSERVABILITY_EXCLUDED_ENDPOINTS).order("created_at", { ascending: true }).limit(limit + 1);
		if (result.error) throw result.error;
		return { rows: (result.data ?? []).slice(0, limit), isSampled: (result.data?.length ?? 0) > limit, limit };
	};
	try {
		const [keysResult, current, previous] = await Promise.all([
			context.client.from("keys").select("id,name,prefix").eq("workspace_id", workspaceId)
				.neq("status", "deleted").neq("name", "__chat_route_managed_key__").order("created_at", { ascending: true }),
			loadWindow(from!, to!),
			loadWindow(previousFrom!, previousTo!),
		]);
		if (keysResult.error) throw keysResult.error;
		const rows = [...current.rows, ...previous.rows];
		const models = Array.from(new Set(rows.map((row) => String(row.model_id ?? "").trim()).filter(Boolean)));
		const apps = Array.from(new Set(rows.map((row) => String(row.app_id ?? "").trim()).filter(Boolean)));
		const metadata = await metadataForIds(context, { models, apps });
		return c.json({
			appNameEntries: metadata.appNameEntries,
			current,
			keys: keysResult.data ?? [],
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
	const view = ["jobs", "sessions"].includes(url.searchParams.get("view") ?? "") ? url.searchParams.get("view")! : "logs";
	if (!user) return c.json({ data: null, signedIn: false, view, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const workspaceId = stringParam(url, "workspaceId");
	if (!workspaceId) return c.json({ data: null, signedIn: true, view, workspaceId: null }, 200, PRIVATE_NO_STORE_HEADERS);
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const timeRange = usageTimeRange(c.req.raw);
	if (view === "jobs") {
		let query = context.client.from("gateway_async_operations").select("kind,internal_id,request_id,session_id,app_id,provider,model,status,billed_at,created_at,updated_at,meta").eq("workspace_id", workspaceId).in("kind", ["video", "batch"]).not("internal_id", "like", "__file__:%").gte("created_at", timeRange.from).lte("created_at", timeRange.to);
		const kind = stringParam(url, "job_kind"); if (kind === "video" || kind === "batch") query = query.eq("kind", kind);
		const status = stringParam(url, "job_status"); if (status) query = query.eq("status", status);
		const provider = stringParam(url, "job_provider"); if (provider) query = query.eq("provider", provider);
		const result = await query.order("updated_at", { ascending: false }).limit(50);
		if (result.error) return c.json({ error: "usage_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		const recentJobs = (result.data ?? []).map((row) => ({ ...row, ...(row.meta && typeof row.meta === "object" && !Array.isArray(row.meta) ? row.meta : {}), webhook: row.meta && typeof row.meta === "object" && !Array.isArray(row.meta) ? (row.meta as Record<string, unknown>).webhook ?? null : null }));
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
	const page = Math.max(1, Number.parseInt(stringParam(url, "page") ?? "1", 10) || 1); const pageSize = 25; const offset = (page - 1) * pageSize;
	let requestQuery = context.client.from("gateway_requests").select("request_id,created_at,endpoint,model_id,requested_model_id,routed_model_id,provider,native_response_id,stream,session_id,app_id,usage,cost_nanos,generation_ms,latency_ms,finish_reason,pricing_lines,provider_attempts,success,status_code,error_code,error_message,error_payload,detail_metadata,key_id,throughput", { count: "exact" }).eq("workspace_id", workspaceId).gte("created_at", timeRange.from).lte("created_at", timeRange.to).not("endpoint", "in", '("video.generation","batch","music.generate")');
	for (const [param, column] of [["model", "model_id"], ["provider", "provider"], ["key", "key_id"], ["req", "request_id"], ["session", "session_id"]] as const) { const value = stringParam(url, param); if (value) requestQuery = requestQuery.eq(column, value); }
	const status = stringParam(url, "status"); if (status === "success") requestQuery = requestQuery.eq("success", true); else if (status === "error") requestQuery = requestQuery.eq("success", false);
	const sort = ["created_at", "cost_nanos", "latency_ms", "generation_ms", "status_code"].includes(stringParam(url, "sort") ?? "") ? stringParam(url, "sort")! : "created_at";
	const requestsResult = await requestQuery.order(sort, { ascending: stringParam(url, "dir") === "asc" }).range(offset, offset + pageSize - 1);
	if (requestsResult.error) return c.json({ error: "usage_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const [uniqueResult, rollupResult, keysResult] = await Promise.all([
		context.client.from("gateway_requests").select("model_id,provider,app_id").eq("workspace_id", workspaceId).gte("created_at", timeRange.from).lte("created_at", timeRange.to).not("endpoint", "in", '("video.generation","batch","music.generate")'),
		context.client.from("gateway_usage_rollup_15m_workspace_provider_model").select("canonical_model_id,provider").eq("workspace_id", workspaceId).gte("bucket_15m", timeRange.from).lte("bucket_15m", timeRange.to),
		context.client.from("keys").select("id,name,prefix").eq("workspace_id", workspaceId).neq("status", "deleted").neq("name", "__chat_route_managed_key__").order("created_at", { ascending: true }),
	]);
	const models = Array.from(new Set([...(uniqueResult.data ?? []).map((row) => row.model_id), ...(rollupResult.data ?? []).map((row) => row.canonical_model_id)].filter(Boolean))); const providers = Array.from(new Set([...(uniqueResult.data ?? []).map((row) => row.provider), ...(rollupResult.data ?? []).map((row) => row.provider)].filter(Boolean))); const apps = Array.from(new Set((uniqueResult.data ?? []).map((row) => row.app_id).filter(Boolean)));
	const providerSets = new Map<string, Set<string>>(); for (const row of [...(uniqueResult.data ?? []).map((r) => ({ model: r.model_id, provider: r.provider })), ...(rollupResult.data ?? []).map((r) => ({ model: r.canonical_model_id, provider: r.provider }))]) if (row.model && row.provider) providerSets.set(row.model, new Set([...(providerSets.get(row.model) ?? []), row.provider]));
	const metadata = await metadataForIds(context, { models, providers, apps });
	const total = requestsResult.count ?? 0;
	return c.json({ data: { appNameEntries: metadata.appNameEntries, availableKeys: keysResult.data ?? [], dedupedModels: models, dedupedProviders: providers, initialRequestsPage: { data: requestsResult.data ?? [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) }, modelMetadataEntries: metadata.modelMetadataEntries, modelProviderEntries: Array.from(providerSets.entries()).map(([id, values]) => [id, Array.from(values)]), providerMetadataEntries: metadata.providerMetadataEntries, providerNameEntries: metadata.providerNameEntries }, signedIn: true, view, workspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
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
	const lifecycleResult = await context.client.from("data_models")
		.select("model_id,name,organisation_id,deprecation_date,retirement_date,previous_model_id")
		.eq("hidden", false)
		.or(`and(retirement_date.gte.${windowStart},retirement_date.lte.${windowEnd}),and(deprecation_date.gte.${windowStart},deprecation_date.lte.${windowEnd})`);
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
			context.client.from("data_api_provider_models").select("api_model_id,internal_model_id").in("api_model_id", usedIds).limit(5000),
			context.client.from("data_api_provider_models").select("api_model_id,internal_model_id").in("internal_model_id", usedIds).limit(5000),
			context.client.from("data_api_provider_models").select("provider_api_model_id,api_model_id,internal_model_id").in("provider_api_model_id", usedIds).limit(5000),
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
	const replacementsResult = await context.client.from("data_models")
		.select("model_id,previous_model_id").eq("hidden", false).in("previous_model_id", lifecycleIds);
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
		return { modelId: model.model_id, modelName: model.name ?? null, organisationId: model.organisation_id ?? null, lastUsedAt, deprecationDate, retirementDate, deprecationDaysUntil, retirementDaysUntil, replacementModelId: replacementByPrevious.get(model.model_id) ?? null, previousModelId: model.previous_model_id ?? null, countAsAlert: usedRecently && primary != null && primary >= 0 && primary <= 90, severity };
	}).filter((warning) => [warning.deprecationDaysUntil, warning.retirementDaysUntil].some((days) => days != null && days >= -7 && days <= 90))
		.sort((left, right) => Math.min(left.retirementDaysUntil ?? Infinity, left.deprecationDaysUntil ?? Infinity) - Math.min(right.retirementDaysUntil ?? Infinity, right.deprecationDaysUntil ?? Infinity));
	return c.json({ signedIn: true, warnings, workspaceId }, 200, PRIVATE_NO_STORE_HEADERS);
});
