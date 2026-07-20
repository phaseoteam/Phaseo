import { Hono, type Context } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";
import { getCacheGeneration } from "@/cache/generations";

export const frontendRouter = new Hono<{ Bindings: Env }>();

const SEARCH_CACHE_SECONDS = 24 * 60 * 60;
const SEARCH_STALE_SECONDS = 7 * SEARCH_CACHE_SECONDS;

type CompactSearchData = {
	m: unknown[];
	o: unknown[];
	b: unknown[];
	p: unknown[];
	s: unknown[];
	c: unknown[];
	v: number;
};

function missingSearchProjection(error: unknown): boolean {
	const value = error as { code?: unknown; message?: unknown } | null;
	const message = String(value?.message ?? "").toLowerCase();
	return value?.code === "PGRST202" || (
		message.includes("get_public_search_index") &&
		(message.includes("could not find") || message.includes("schema cache"))
	);
}

async function fetchAllRows<T>(
	fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
	pageSize = 1_000,
): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += pageSize) {
		const result = await fetchPage(from, from + pageSize - 1);
		if (result.error) throw result.error;
		const page = result.data ?? [];
		rows.push(...page);
		if (page.length < pageSize) return rows;
	}
}

function releaseGroupLabel(value: string | null | undefined): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return new Intl.DateTimeFormat("en", {
		month: "long",
		timeZone: "UTC",
		year: "numeric",
	}).format(date);
}

async function compatibilitySearchIndex(c: Context<{ Bindings: Env }>): Promise<CompactSearchData> {
	const db = getDataClient(c.env);
	const [models, organisationsResult, benchmarksResult, providersResult, generation] = await Promise.all([
		fetchAllRows((from, to) => db.from("data_models")
			.select("model_id,name,organisation_id,release_date,announcement_date,organisation:data_organisations(name)")
			.eq("hidden", false)
			.order("release_date", { ascending: false })
			.range(from, to)),
		db.from("data_organisations").select("organisation_id,name").order("name", { ascending: true }),
		db.from("data_benchmarks").select("id,name,total_models").order("name", { ascending: true }),
		db.from("data_api_providers").select("api_provider_id,api_provider_name").order("api_provider_name", { ascending: true }),
		getCacheGeneration(db, "search"),
	]);
	for (const result of [organisationsResult, benchmarksResult, providersResult]) {
		if (result.error) throw result.error;
	}
	const orderedModels = [...models].sort((left, right) => {
		const leftTime = Date.parse(left.release_date ?? left.announcement_date ?? "");
		const rightTime = Date.parse(right.release_date ?? right.announcement_date ?? "");
		const safeLeftTime = Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY;
		const safeRightTime = Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY;
		return safeRightTime - safeLeftTime || String(left.name).localeCompare(String(right.name));
	});
	return {
		m: orderedModels.map((model) => [model.model_id, model.name, (model.organisation as { name?: string | null } | null)?.name ?? null, `/models/${model.model_id}`, model.organisation_id, releaseGroupLabel(model.release_date ?? model.announcement_date)]),
		o: (organisationsResult.data ?? []).map((organisation) => [organisation.organisation_id, organisation.name || organisation.organisation_id, null, `/organisations/${organisation.organisation_id}`, organisation.organisation_id]),
		b: (benchmarksResult.data ?? []).map((benchmark) => [benchmark.id, benchmark.name, `${benchmark.total_models ?? 0} models`, `/benchmarks/${benchmark.id}`]),
		p: (providersResult.data ?? []).map((provider) => [provider.api_provider_id, provider.api_provider_name, null, `/api-providers/${provider.api_provider_id}`, provider.api_provider_id]),
		s: [],
		c: [],
		v: generation.generation,
	};
}

frontendRouter.get("/cache-generation/search", async (c) => {
	try {
		const generation = await getCacheGeneration(getDataClient(c.env), "search");
		return withPublicCache(c.json(generation), {
			browserTtlSeconds: 0,
			cacheTags: ["web-api-cache-generation"],
			edgeTtlSeconds: 5 * 60,
			staleWhileRevalidateSeconds: 5 * 60,
		});
	} catch (error) {
		console.error("[web-api/cache-generation] failed", error);
		return c.json({ error: "cache_generation_unavailable" }, 503);
	}
});

frontendRouter.get("/search", async (c) => {
	try {
		const db = getDataClient(c.env);
		const projected = await db.rpc("get_public_search_index");
		let payload: CompactSearchData;
		if (projected.error) {
			if (!missingSearchProjection(projected.error)) throw projected.error;
			payload = await compatibilitySearchIndex(c);
		} else {
			payload = projected.data as CompactSearchData;
		}
		return withPublicCache(c.json(payload), {
			browserTtlSeconds: SEARCH_CACHE_SECONDS,
			cacheTags: ["web-api-search"],
			edgeTtlSeconds: SEARCH_CACHE_SECONDS,
			staleWhileRevalidateSeconds: SEARCH_STALE_SECONDS,
		});
	} catch (error) {
		console.error("[web-api/search] failed", error);
		return c.json({ error: "search_unavailable" }, 503);
	}
});
