// Entity hover cards: one compact summary per catalogue entity, for the site-wide
// cards that open when a model, provider, organisation, app, benchmark, family,
// collection or country link is hovered. Every kind reuses the loader behind its
// own page, so a card never disagrees with the page it links to, and every
// response is a few KB, edge-cached and purged with the catalogue tags its page
// uses. Unknown ids are a 404, which the browser treats as "no card".
//
// Public rules: Phaseo model ids only, no request counts (rates and token shares
// only), and nothing about stealth routes.
import { Hono } from "hono";
import { PUBLIC_LIVE_DATA_CACHE } from "@/cache/publicLiveData";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache, type PublicCachePolicy } from "@/http/cache";
import { normalizeCatalogueTiers } from "@/models/catalogue-tiers";
import { normalizeModelLicense } from "@/models/license";
import { fetchModelsPageCatalogue } from "@/models/page-catalogue";
import { ARTIFICIAL_ANALYSIS_ID } from "@/benchmarks/artificial-analysis-catalogue";
import { getPublicApp } from "./apps";
import { providerIndexWithMembers } from "./providers";

export const ENTITY_CARD_KINDS = ["model", "provider", "organisation", "app", "benchmark", "family", "collection", "country"] as const;
export type EntityCardKind = (typeof ENTITY_CARD_KINDS)[number];

type Row = Record<string, unknown>;
export type EntityRef = { id: string; name: string };

/** How many linked entities a list row shows before "+N more". */
const LIST_LIMIT = 3;
/** Badges after the rows; more would wrap past the card's height budget. */
const BADGE_LIMIT = 6;

const BASE_TAGS = ["web-api-entity-cards"] as const;

/** Catalogue identity (names, counts, prices) changes with catalogue edits, which purge these tags. */
const CATALOGUE_CARD_CACHE: PublicCachePolicy = {
	edgeTtlSeconds: 24 * 60 * 60,
	staleWhileRevalidateSeconds: 7 * 24 * 60 * 60,
	browserTtlSeconds: 0,
	browserStaleWhileRevalidateSeconds: 0,
};

/** Cards that carry live status or usage follow the live telemetry freshness of their pages. */
const LIVE_CARD_CACHE: PublicCachePolicy = { ...PUBLIC_LIVE_DATA_CACHE };

/** Misses are cached briefly, so hovering a dead link does not reach the database each time. */
const NOT_FOUND_CACHE: PublicCachePolicy = {
	edgeTtlSeconds: 5 * 60,
	browserTtlSeconds: 0,
	browserStaleWhileRevalidateSeconds: 0,
};

function tag(prefix: string, id: string): string {
	return `${prefix}-${encodeURIComponent(id).replace(/%/g, "")}`.slice(0, 128);
}

function policy(base: PublicCachePolicy, kind: EntityCardKind, tags: string[]): PublicCachePolicy {
	return { ...base, cacheTags: [...BASE_TAGS, `web-api-entity-cards-${kind}`, ...tags] };
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim());
const strOrNull = (value: unknown): string | null => str(value) || null;
const finite = (value: unknown): number | null => {
	if (value === null || value === undefined || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};
const strings = (value: unknown): string[] =>
	Array.isArray(value) ? [...new Set(value.map(str).filter(Boolean))] : [];
const isRecord = (value: unknown): value is Row => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const first = <T>(value: T | T[] | null | undefined): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);
const dateOnly = (value: unknown): string | null => {
	const text = str(value);
	if (!text) return null;
	const time = Date.parse(text);
	return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
};

function list(refs: EntityRef[], limit = LIST_LIMIT): { items: EntityRef[]; more: number } {
	return { items: refs.slice(0, limit), more: Math.max(0, refs.length - limit) };
}

function modelRef(row: Row): EntityRef | null {
	const id = str(row.model_id ?? row.model_slug);
	return id ? { id, name: str(row.name) || id } : null;
}

// --- model -----------------------------------------------------------------

/**
 * The model's best score on the current Artificial Analysis Intelligence Index. The current
 * version is resolved for the whole catalogue, not from this model's results, so a model
 * scored only on an older version gets null rather than its old score shown as current.
 */
async function modelIntelligence(env: Env, modelId: string): Promise<number | null> {
	try {
		const current = await resolveBenchmarkId(env, ARTIFICIAL_ANALYSIS_ID);
		if (!current) return null;
		const { data, error } = await getDataClient(env).from("v2_benchmark_results")
			.select("score_numeric")
			.eq("model_slug", modelId)
			.eq("benchmark_id", current)
			.or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`)
			.not("score_numeric", "is", null)
			.limit(20);
		if (error) throw error;
		const scores = (data ?? []).map((row) => finite(row.score_numeric)).filter((value): value is number => value !== null);
		return scores.length ? Math.max(...scores) : null;
	} catch (error) {
		console.error("[web-api/entity-cards] model intelligence failed", { modelId, error });
		return null;
	}
}

function maxContext(row: Row): number | null {
	const values = (Array.isArray(row.context_lengths) ? row.context_lengths : []).map(finite).filter((value): value is number => value !== null && value > 0);
	return values.length ? Math.max(...values) : null;
}

function cheapestProvider(row: Row): EntityRef | null {
	const id = str(row.pricing_provider_id);
	if (!id) return null;
	const detail = (Array.isArray(row.gateway_provider_details) ? row.gateway_provider_details : []).find((item) => isRecord(item) && str(item.id) === id);
	return { id, name: (isRecord(detail) && str(detail.name)) || id };
}

async function modelCard(env: Env, modelId: string) {
	const [organisationId] = modelId.split("/");
	if (!organisationId || !modelId.includes("/")) return null;
	const catalogue = await fetchModelsPageCatalogue(env, { organisationId, includeMetrics: false }, "v2");
	const row = catalogue.models.find((model) => str(model.model_id) === modelId);
	if (!row) return null;
	const intelligence = await modelIntelligence(env, modelId);
	const providers = Array.isArray(row.gateway_provider_details) ? row.gateway_provider_details.filter(isRecord) : [];
	return {
		kind: "model" as const,
		id: modelId,
		name: str(row.name) || modelId,
		organisation: { id: str(row.organisation_id) || organisationId, name: str(row.organisation_name) || organisationId },
		releaseDate: dateOnly(row.primary_date),
		status: strOrNull(row.gateway_status),
		inputPrice: finite(row.lowest_standard_input_price),
		outputPrice: finite(row.lowest_standard_output_price),
		inputPriceUnit: strOrNull(row.lowest_standard_input_price_unit),
		outputPriceUnit: strOrNull(row.lowest_standard_output_price_unit),
		context: maxContext(row),
		providers: {
			active: finite(row.gateway_active_provider_count) ?? providers.filter((item) => item.is_active === true).length,
			total: finite(row.gateway_provider_count) ?? providers.length,
		},
		cheapestProvider: cheapestProvider(row),
		inputModalities: strings(row.gateway_input_modalities),
		outputModalities: strings(row.gateway_output_modalities),
		intelligence,
		features: strings(row.gateway_features).slice(0, BADGE_LIMIT),
		tiers: normalizeCatalogueTiers(row.gateway_tiers).filter((tier) => tier !== "standard").slice(0, BADGE_LIMIT),
	};
}

// --- provider --------------------------------------------------------------

/** Non-stealth routable models of the provider, newest first, with their names. */
async function providerModels(env: Env, providerId: string) {
	const client = getDataClient(env);
	const routes = await client.from("v2_model_provider_routes")
		.select("model_slug,created_at")
		.eq("provider_slug", providerId)
		.eq("is_stealth", false)
		.eq("routing_enabled", true)
		.in("status", ["active", "degraded"])
		.order("created_at", { ascending: false })
		.limit(1000);
	if (routes.error) throw routes.error;
	const ids = [...new Set((routes.data ?? []).map((row) => str(row.model_slug)).filter(Boolean))];
	if (!ids.length) return [];
	const names = new Map<string, Row>();
	for (let offset = 0; offset < ids.length; offset += 200) {
		const result = await client.from("v2_models")
			.select("model_slug,name,released_at,announced_at,status")
			.in("model_slug", ids.slice(offset, offset + 200))
			.eq("hidden", false)
			.neq("status", "disabled");
		if (result.error) throw result.error;
		for (const row of result.data ?? []) names.set(str(row.model_slug), row);
	}
	return ids.flatMap((id) => {
		const row = names.get(id);
		return row ? [{ id, name: str(row.name) || id, date: dateOnly(row.released_at ?? row.announced_at), status: strOrNull(row.status) }] : [];
	});
}

/** The provider's most used visible models over the last week, aggregated in the database. */
async function providerPopularModels(env: Env, providerId: string, visible: ReadonlyMap<string, EntityRef>): Promise<EntityRef[]> {
	const { data, error } = await getDataClient(env).rpc("get_top_models_stats_tokens", {
		p_provider: providerId,
		p_since: new Date(Date.now() - 7 * 86_400_000).toISOString(),
		p_limit: 25,
	});
	if (error) {
		console.error("[web-api/entity-cards] provider popular models failed", { providerId, error });
		return [];
	}
	return ((data ?? []) as Row[]).flatMap((row) => {
		const ref = visible.get(str(row.model_id));
		return ref ? [ref] : [];
	});
}

async function providerCard(env: Env, providerId: string) {
	const index = await providerIndexWithMembers(env);
	const card = index.find((entry) => entry.api_provider_id === providerId) ?? index.find((entry) => entry.member_ids.includes(providerId));
	if (!card) return null;
	const models = await providerModels(env, providerId);
	const visible = new Map(models.map((model) => [model.id, { id: model.id, name: model.name }]));
	const popular = models.length ? await providerPopularModels(env, providerId, visible) : [];
	const newest = [...models].sort((left, right) => String(right.date ?? "").localeCompare(String(left.date ?? "")))[0] ?? null;
	// Privacy facts are the requested provider's own, never its group representative's:
	// a regional variant can retain data that its global sibling does not.
	const own = card.member_policies.find((member) => member.id === providerId) ?? null;
	return {
		kind: "provider" as const,
		id: providerId,
		name: str(card.api_provider_name) || providerId,
		countryCode: strOrNull(card.country_code),
		totalModels: card.total_models,
		activeModels: card.active_models,
		dataPolicyTier: strOrNull(own?.data_policy_tier),
		// null when the provider does not state it; the card then leaves the fact out.
		zeroDataRetention: typeof own?.zero_data_retention === "boolean" ? own.zero_data_retention : null,
		byok: card.byok_available === true,
		regions: strings(card.default_execution_regions).slice(0, 6),
		popular: list(popular),
		newest: newest ? { id: newest.id, name: newest.name, date: newest.date, comingSoon: newest.status === "coming_soon" || newest.status === "announced" } : null,
	};
}

// --- organisation ----------------------------------------------------------

async function organisationCard(env: Env, organisationId: string) {
	const [labResult, catalogue] = await Promise.all([
		getDataClient(env).from("v2_labs").select("lab_slug,name,country_code").eq("lab_slug", organisationId).maybeSingle(),
		fetchModelsPageCatalogue(env, { organisationId }, "v2"),
	]);
	if (labResult.error) throw labResult.error;
	if (!labResult.data) return null;
	const models = [...catalogue.models].sort((left, right) => Number(right.primary_timestamp ?? 0) - Number(left.primary_timestamp ?? 0));
	const providerModels = new Map<string, { ref: EntityRef; count: number }>();
	for (const model of models) {
		for (const detail of Array.isArray(model.gateway_provider_details) ? model.gateway_provider_details : []) {
			if (!isRecord(detail) || detail.is_active !== true) continue;
			const id = str(detail.id);
			if (!id) continue;
			const entry = providerModels.get(id) ?? { ref: { id, name: str(detail.name) || id }, count: 0 };
			entry.count += 1;
			providerModels.set(id, entry);
		}
	}
	const servedBy = [...providerModels.values()].sort((left, right) => right.count - left.count || left.ref.name.localeCompare(right.ref.name)).map((entry) => entry.ref);
	const latest = models.find((model) => model.primary_date != null) ?? null;
	const mostUsed = [...models]
		.filter((model) => (finite(model.popularity_tokens_week) ?? 0) > 0)
		.sort((left, right) => (finite(right.popularity_tokens_week) ?? 0) - (finite(left.popularity_tokens_week) ?? 0))[0] ?? null;
	const firstDates = models.map((model) => dateOnly(model.primary_date)).filter((value): value is string => Boolean(value)).sort();
	const latestRef = latest ? modelRef(latest) : null;
	return {
		kind: "organisation" as const,
		id: organisationId,
		name: str(labResult.data.name) || organisationId,
		countryCode: strOrNull(labResult.data.country_code),
		since: firstDates[0]?.slice(0, 4) ?? null,
		models: models.length,
		live: models.filter((model) => model.gateway_status === "active").length,
		openWeights: models.filter((model) => {
			const license = normalizeModelLicense(model.license);
			return license !== null && license !== "Proprietary";
		}).length,
		providers: servedBy.length,
		latest: latestRef ? { ...latestRef, date: dateOnly(latest?.primary_date) } : null,
		mostUsed: mostUsed ? modelRef(mostUsed) : null,
		servedBy: list(servedBy),
	};
}

// --- app -------------------------------------------------------------------

type RankingRow = { app_id: string; tokens: number; models: number };

async function appRankings(env: Env, asOf: Date): Promise<RankingRow[]> {
	const { data, error } = await getDataClient(env).rpc("get_public_top_apps_rolling", {
		p_limit: 100,
		p_time_range: "week",
		p_as_of: asOf.toISOString(),
	});
	if (error) throw error;
	return ((data ?? []) as Row[]).map((row) => ({ app_id: str(row.app_id), tokens: finite(row.tokens) ?? 0, models: finite(row.unique_models) ?? 0 }));
}

/** The app's most used visible models over the last week: distinct models in order of their largest daily rollup. */
async function appTopModels(env: Env, appIds: string[]): Promise<EntityRef[]> {
	const client = getDataClient(env);
	const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
	const usage = await client.from("v2_web_public_usage_daily")
		.select("canonical_model_id")
		.in("app_id", appIds)
		.gte("day_bucket", since)
		.not("canonical_model_id", "is", null)
		.order("total_tokens", { ascending: false })
		.limit(200);
	if (usage.error) {
		console.error("[web-api/entity-cards] app top models failed", { error: usage.error });
		return [];
	}
	const ids = [...new Set((usage.data ?? []).map((row) => str(row.canonical_model_id)).filter(Boolean))].slice(0, 25);
	if (!ids.length) return [];
	const models = await client.from("v2_models").select("model_slug,name").in("model_slug", ids).eq("hidden", false).neq("status", "disabled");
	if (models.error) throw models.error;
	const names = new Map((models.data ?? []).map((row) => [str(row.model_slug), str(row.name)]));
	return ids.flatMap((id) => (names.has(id) ? [{ id, name: names.get(id) || id }] : []));
}

function domainOf(url: unknown): string | null {
	try {
		return new URL(str(url)).hostname.replace(/^www\./, "") || null;
	} catch {
		return null;
	}
}

async function appCard(env: Env, appReference: string) {
	const group = await getPublicApp(env, appReference);
	if (!group || group.app.is_public !== true || group.app.is_active !== true) return null;
	const members = new Set(group.memberIds);
	const now = new Date();
	const [thisWeek, lastWeek, topModels] = await Promise.all([
		appRankings(env, now),
		appRankings(env, new Date(now.getTime() - 7 * 86_400_000)),
		appTopModels(env, group.memberIds),
	]);
	const rankIn = (rows: RankingRow[]) => {
		const index = rows.findIndex((row) => members.has(row.app_id));
		return index < 0 ? null : index + 1;
	};
	const rank = rankIn(thisWeek);
	const previousRank = rankIn(lastWeek);
	const entry = rank ? thisWeek[rank - 1] : null;
	const rankedTokens = thisWeek.reduce((sum, row) => sum + Math.max(0, row.tokens), 0);
	return {
		kind: "app" as const,
		id: group.publicSlug || appReference,
		name: str(group.app.title) || appReference,
		imageUrl: strOrNull(group.app.image_url),
		category: strOrNull(group.app.category),
		domain: domainOf(group.app.url),
		rank,
		// Share of the tokens of all apps in this week's public ranking.
		tokenSharePct: entry && rankedTokens > 0 ? (entry.tokens / rankedTokens) * 100 : null,
		models: entry?.models ?? null,
		rankChange: rank && previousRank ? previousRank - rank : null,
		topModels: list(topModels),
		firstSeen: dateOnly(group.app.created_at),
	};
}

// --- benchmark -------------------------------------------------------------

async function resolveBenchmarkId(env: Env, benchmarkId: string): Promise<string | null> {
	if (benchmarkId !== ARTIFICIAL_ANALYSIS_ID) return benchmarkId;
	const { data, error } = await getDataClient(env).from("v2_benchmarks").select("benchmark_id,total_models").like("benchmark_id", "aa-intelligence-index-v%");
	if (error) throw error;
	const versions = (data ?? [])
		.filter((row) => (finite(row.total_models) ?? 0) > 0)
		.map((row) => ({ id: str(row.benchmark_id), version: Number(str(row.benchmark_id).match(/-v(\d+)$/)?.[1] ?? Number.NaN) }))
		.filter((row) => Number.isFinite(row.version))
		.sort((left, right) => right.version - left.version);
	return versions[0]?.id ?? null;
}

async function benchmarkCard(env: Env, benchmarkId: string) {
	const resolvedId = await resolveBenchmarkId(env, benchmarkId);
	if (!resolvedId) return null;
	const client = getDataClient(env);
	const [benchmark, results] = await Promise.all([
		client.from("v2_benchmarks").select("benchmark_id,name,category,ascending_order,total_models,benchmark_type").eq("benchmark_id", resolvedId).maybeSingle(),
		client.from("v2_benchmark_results")
			.select("model_slug,score,rank")
			.eq("benchmark_id", resolvedId)
			.or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`)
			.not("rank", "is", null)
			.order("rank", { ascending: true })
			.limit(20),
	]);
	if (benchmark.error) throw benchmark.error;
	if (results.error) throw results.error;
	if (!benchmark.data) return null;
	const slugs = [...new Set((results.data ?? []).map((row) => str(row.model_slug)).filter(Boolean))];
	const models = slugs.length
		? await client.from("v2_models").select("model_slug,name").in("model_slug", slugs).eq("hidden", false)
		: { data: [], error: null };
	if (models.error) throw models.error;
	const names = new Map((models.data ?? []).map((row) => [str(row.model_slug), str(row.name)]));
	const leaders: Array<EntityRef & { score: string | null }> = [];
	for (const row of results.data ?? []) {
		const id = str(row.model_slug);
		if (!names.has(id) || leaders.some((leader) => leader.id === id)) continue;
		leaders.push({ id, name: names.get(id) || id, score: strOrNull(row.score) });
		if (leaders.length === LIST_LIMIT) break;
	}
	return {
		kind: "benchmark" as const,
		id: benchmarkId,
		name: benchmarkId === ARTIFICIAL_ANALYSIS_ID ? "Artificial Analysis" : str(benchmark.data.name) || benchmarkId,
		category: strOrNull(benchmark.data.category),
		models: finite(benchmark.data.total_models) ?? 0,
		lowerIsBetter: benchmark.data.ascending_order === false,
		leaders,
	};
}

// --- family ----------------------------------------------------------------

/**
 * Visible models of the family, counted in the database, plus the earliest and latest
 * release dates. A model's date is released_at, or announced_at when it has no release
 * date, so each bound is the better of one released_at lookup and one announced_at
 * lookup over the models without a release date.
 */
async function familyAggregates(env: Env, familyId: string) {
	const client = getDataClient(env);
	const visible = (select: string, options?: { count: "exact"; head: true }) => client.from("v2_models")
		.select(select, options)
		.eq("family_slug", familyId)
		.eq("hidden", false)
		.neq("status", "disabled");
	const bound = (column: "released_at" | "announced_at", ascending: boolean) => {
		let query = visible(column).not(column, "is", null);
		if (column === "announced_at") query = query.is("released_at", null);
		return query.order(column, { ascending }).limit(1).maybeSingle();
	};
	const [total, active, firstReleased, firstAnnounced, lastReleased, lastAnnounced] = await Promise.all([
		visible("model_slug", { count: "exact", head: true }),
		visible("model_slug", { count: "exact", head: true }).eq("status", "active"),
		bound("released_at", true),
		bound("announced_at", true),
		bound("released_at", false),
		bound("announced_at", false),
	]);
	for (const result of [total, active, firstReleased, firstAnnounced, lastReleased, lastAnnounced]) {
		if (result.error) throw result.error;
	}
	const dateOf = (result: { data: unknown }, column: "released_at" | "announced_at") =>
		isRecord(result.data) ? dateOnly(result.data[column]) : null;
	const firsts = [dateOf(firstReleased, "released_at"), dateOf(firstAnnounced, "announced_at")].filter((value): value is string => Boolean(value)).sort();
	const lasts = [dateOf(lastReleased, "released_at"), dateOf(lastAnnounced, "announced_at")].filter((value): value is string => Boolean(value)).sort();
	return {
		models: total.count ?? 0,
		active: active.count ?? 0,
		firstRelease: firsts[0] ?? null,
		latestRelease: lasts.at(-1) ?? null,
	};
}

/**
 * The family's newest visible models by the same date as familyAggregates (released_at,
 * else announced_at). PostgREST cannot order by that coalesce, so the newest few of each
 * partition (released; announced only; undated) are fetched and merged: the overall
 * newest LIST_LIMIT are always among them.
 */
async function familyNewest(env: Env, familyId: string): Promise<Row[]> {
	const visible = () => getDataClient(env).from("v2_models")
		.select("model_slug,name,released_at,announced_at")
		.eq("family_slug", familyId)
		.eq("hidden", false)
		.neq("status", "disabled");
	const results = await Promise.all([
		visible().not("released_at", "is", null).order("released_at", { ascending: false }).limit(LIST_LIMIT),
		visible().is("released_at", null).not("announced_at", "is", null).order("announced_at", { ascending: false }).limit(LIST_LIMIT),
		visible().is("released_at", null).is("announced_at", null).order("model_slug", { ascending: true }).limit(LIST_LIMIT),
	]);
	for (const result of results) {
		if (result.error) throw result.error;
	}
	const time = (row: Row) => {
		const parsed = Date.parse(str(row.released_at ?? row.announced_at));
		return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
	};
	return results.flatMap((result) => (result.data ?? []) as Row[])
		.sort((left, right) => time(right) - time(left))
		.slice(0, LIST_LIMIT);
}

async function familyCard(env: Env, familyId: string) {
	const client = getDataClient(env);
	const family = await client.from("v2_model_families").select("family_slug,name,lab_slug,lab:v2_labs(lab_slug,name)").eq("family_slug", familyId).maybeSingle();
	if (family.error) throw family.error;
	if (!family.data) return null;
	const [aggregates, preview] = await Promise.all([familyAggregates(env, familyId), familyNewest(env, familyId)]);
	const lab = first(family.data.lab as Row | Row[] | null);
	const organisationId = str(family.data.lab_slug) || str(lab?.lab_slug) || familyId.split("/")[0] || "";
	const refs = preview.flatMap((row) => {
		const ref = modelRef(row);
		return ref ? [ref] : [];
	});
	return {
		kind: "family" as const,
		id: familyId,
		name: str(family.data.name) || familyId,
		organisation: organisationId ? { id: organisationId, name: str(lab?.name) || organisationId } : null,
		...aggregates,
		members: { items: refs, more: Math.max(0, aggregates.models - refs.length) },
	};
}

// --- collection ------------------------------------------------------------

/** The /models/collections/<id> presets; each page redirects to the matching /models filter. */
export const COLLECTION_PRESETS: Record<string, (row: Row) => boolean> = {
	free: (row) => normalizeCatalogueTiers(row.gateway_tiers).includes("free"),
	"image-generation": (row) => strings(row.gateway_output_modalities).includes("image"),
	"video-generation": (row) => strings(row.gateway_output_modalities).includes("video"),
	"audio-models": (row) => strings(row.gateway_output_modalities).includes("audio"),
	tools: (row) => strings(row.gateway_features).includes("tools"),
	reasoning: (row) => strings(row.gateway_features).includes("reasoning"),
	"image-understanding": (row) => strings(row.gateway_input_modalities).includes("image"),
};

async function collectionCard(env: Env, collectionId: string) {
	const matches = COLLECTION_PRESETS[collectionId];
	if (!matches) return null;
	const catalogue = await fetchModelsPageCatalogue(env, { includeMetrics: false }, "v2");
	const models = catalogue.models.filter(matches).sort((left, right) => Number(right.primary_timestamp ?? 0) - Number(left.primary_timestamp ?? 0));
	const organisations = new Set(models.map((model) => str(model.organisation_id)).filter(Boolean));
	const refs = models.flatMap((model) => {
		const ref = modelRef(model);
		return ref ? [ref] : [];
	});
	return {
		kind: "collection" as const,
		id: collectionId,
		models: models.length,
		live: models.filter((model) => model.gateway_status === "active").length,
		organisations: organisations.size,
		newest: list(refs),
	};
}

// --- country ---------------------------------------------------------------

/**
 * The country page's summary for one country: only that country's organisations are read,
 * and its models come from the shared models-page rows (one cached copy per catalogue
 * revision) without the weekly usage metrics, which the card does not show. Counting the
 * rows here, rather than with count queries, keeps the page's visibility rules (public
 * access scope, no internal testing) that live in the payload and not in the tables.
 */
const LAB_PAGE_SIZE = 1000;

/**
 * Every organisation in one country. PostgREST caps a read at 1,000 rows, so the read is
 * paged until a short page arrives; a country with more organisations still counts all of
 * their models.
 */
async function readCountryLabs(env: Env, code: string) {
	const rows: Array<{ lab_slug: unknown; name: unknown }> = [];
	for (let from = 0; ; from += LAB_PAGE_SIZE) {
		const page = await getDataClient(env).from("v2_labs")
			.select("lab_slug,name")
			// Some rows store the code in lower case; the country page upper-cases it.
			.in("country_code", [code, code.toLowerCase()])
			.order("lab_slug", { ascending: true })
			.range(from, from + LAB_PAGE_SIZE - 1);
		if (page.error) throw page.error;
		const data = page.data ?? [];
		rows.push(...data);
		if (data.length < LAB_PAGE_SIZE) return rows;
	}
}

async function countryCard(env: Env, iso: string) {
	const code = iso.trim().toUpperCase();
	if (!/^[A-Z]{2}$/.test(code)) return null;
	const [labRows, catalogue] = await Promise.all([
		readCountryLabs(env, code),
		fetchModelsPageCatalogue(env, { includeMetrics: false }, "v2"),
	]);
	const organisations = new Map(labRows.map((row) => [str(row.lab_slug), str(row.name) || str(row.lab_slug)] as const).filter(([id]) => id));
	if (!organisations.size) return null;
	const models = catalogue.models
		.filter((model) => organisations.has(str(model.organisation_id)))
		.sort((left, right) => Number(right.primary_timestamp ?? 0) - Number(left.primary_timestamp ?? 0));
	const modelCounts = new Map<string, number>();
	for (const model of models) modelCounts.set(str(model.organisation_id), (modelCounts.get(str(model.organisation_id)) ?? 0) + 1);
	// Most models first, as on the country page.
	const ranked = [...organisations].map(([id, name]) => ({ id, name, count: modelCounts.get(id) ?? 0 }))
		.sort((left, right) => right.count - left.count)
		.map(({ id, name }) => ({ id, name }));
	const latestRow = models[0] ?? null;
	const latest = latestRow ? modelRef(latestRow) : null;
	return {
		kind: "country" as const,
		id: code,
		organisations: organisations.size,
		models: models.length,
		live: models.filter((model) => model.gateway_status === "active").length,
		topOrganisations: list(ranked),
		latest: latest ? { ...latest, date: dateOnly(latestRow?.primary_date) } : null,
	};
}

// --- route -----------------------------------------------------------------

type CardLoader = (env: Env, id: string) => Promise<Record<string, unknown> | null>;

const LOADERS: Record<EntityCardKind, { load: CardLoader; cache: PublicCachePolicy; tags: (id: string) => string[] }> = {
	model: { load: modelCard, cache: LIVE_CARD_CACHE, tags: (id) => ["web-api-models", "web-api-models-v2", tag("web-api-model", id)] },
	provider: { load: providerCard, cache: LIVE_CARD_CACHE, tags: (id) => ["web-api-providers", tag("web-api-provider", id)] },
	organisation: { load: organisationCard, cache: LIVE_CARD_CACHE, tags: (id) => ["web-api-reference-data", "web-api-organisations", "web-api-models", tag("web-api-organisation", id)] },
	app: { load: appCard, cache: LIVE_CARD_CACHE, tags: (id) => ["web-api-apps", "web-api-app-rankings", tag("web-api-app", id)] },
	benchmark: { load: benchmarkCard, cache: CATALOGUE_CARD_CACHE, tags: (id) => ["web-api-reference-data", "web-api-benchmarks", tag("web-api-benchmark", id)] },
	family: { load: familyCard, cache: CATALOGUE_CARD_CACHE, tags: (id) => ["web-api-reference-data", "web-api-families", tag("web-api-family", id)] },
	collection: { load: collectionCard, cache: CATALOGUE_CARD_CACHE, tags: () => ["web-api-collections", "web-api-models"] },
	country: { load: countryCard, cache: CATALOGUE_CARD_CACHE, tags: (id) => ["web-api-reference-data", "web-api-countries", tag("web-api-country", id.toUpperCase())] },
};

const isKind = (value: string): value is EntityCardKind => (ENTITY_CARD_KINDS as readonly string[]).includes(value);

export const publicEntityCardsRouter = new Hono<{ Bindings: Env }>();

// Ids can contain slashes (models are "<organisation>/<model>", families nest too).
publicEntityCardsRouter.get("/entity-cards/:kind/:id{.+}", async (c) => {
	const kind = c.req.param("kind");
	// Hono has already percent-decoded the parameter; decoding again would turn a literal "%2F" into "/".
	const id = (c.req.param("id") ?? "").trim();
	if (!isKind(kind) || !id || id.length > 200) {
		return withPublicCache(c.json({ error: "entity_not_found" }, 404), NOT_FOUND_CACHE);
	}
	const loader = LOADERS[kind];
	try {
		const card = await loader.load(c.env, id);
		if (!card) return withPublicCache(c.json({ error: "entity_not_found" }, 404), policy(NOT_FOUND_CACHE, kind, loader.tags(id)));
		return withPublicCache(c.json({ card }), policy(loader.cache, kind, loader.tags(id)));
	} catch (error) {
		console.error("[web-api/entity-cards] card failed", { kind, id, error });
		return c.json({ error: "entity_card_unavailable" }, 503);
	}
});
