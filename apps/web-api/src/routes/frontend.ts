import { Hono, type Context } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";
import { formatProviderOfferDisplayName, type ProviderOfferScope } from "@/lib/provider-display-name";

export const frontendRouter = new Hono<{ Bindings: Env }>();

const SEARCH_CACHE_SECONDS = 2 * 60;
const SEARCH_STALE_SECONDS = 5 * 60;

type CompactSearchData = {
	m: unknown[];
	o: unknown[];
	b: unknown[];
	p: unknown[];
	s: unknown[];
	c: unknown[];
};

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

async function v2SearchIndex(c: Context<{ Bindings: Env }>): Promise<CompactSearchData> {
	const db = getDataClient(c.env);
	const [models, organisationsResult, benchmarksResult, providersResult] = await Promise.all([
		fetchAllRows((from, to) => db.from("v2_models")
			.select("model_slug,name,lab_slug,released_at,announced_at,lab:v2_labs!v2_models_lab_slug_fkey(name)")
			.eq("hidden", false)
			.order("released_at", { ascending: false })
			.range(from, to)),
		db.from("v2_labs").select("lab_slug,name").order("name", { ascending: true }),
		db.from("v2_benchmarks").select("benchmark_id,name,total_models").order("name", { ascending: true }),
		db.from("v2_providers").select("provider_slug,name,offer_label,offer_scope").order("name", { ascending: true }),
	]);
	for (const result of [organisationsResult, benchmarksResult, providersResult]) {
		if (result.error) throw result.error;
	}
	const orderedModels = [...models].sort((left, right) => {
		const leftTime = Date.parse(left.released_at ?? left.announced_at ?? "");
		const rightTime = Date.parse(right.released_at ?? right.announced_at ?? "");
		const safeLeftTime = Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY;
		const safeRightTime = Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY;
		return safeRightTime - safeLeftTime || String(left.name).localeCompare(String(right.name));
	});
	return {
		m: orderedModels.map((model) => [model.model_slug, model.name, (Array.isArray(model.lab) ? model.lab[0] : model.lab)?.name ?? null, `/models/${model.model_slug}`, model.lab_slug, releaseGroupLabel(model.released_at ?? model.announced_at)]),
		o: (organisationsResult.data ?? []).map((organisation) => [organisation.lab_slug, organisation.name || organisation.lab_slug, null, `/organisations/${organisation.lab_slug}`, organisation.lab_slug]),
		b: (benchmarksResult.data ?? []).map((benchmark) => [benchmark.benchmark_id, benchmark.name, `${benchmark.total_models ?? 0} models`, `/benchmarks/${benchmark.benchmark_id}`]),
		p: (providersResult.data ?? []).map((provider) => [
			provider.provider_slug,
			formatProviderOfferDisplayName({
				providerId: provider.provider_slug,
				providerName: provider.name,
				offerLabel: provider.offer_label,
				offerScope: provider.offer_scope as ProviderOfferScope | null,
			}),
			null,
			`/api-providers/${provider.provider_slug}`,
			provider.provider_slug,
		]),
		s: [],
		c: [],
	};
}

frontendRouter.get("/search", async (c) => {
	try {
		const payload = await v2SearchIndex(c);
		return withPublicCache(c.json(payload), {
			browserTtlSeconds: 0,
			browserStaleWhileRevalidateSeconds: 0,
			cacheTags: ["web-api-search"],
			edgeTtlSeconds: SEARCH_CACHE_SECONDS,
			staleWhileRevalidateSeconds: SEARCH_STALE_SECONDS,
		});
	} catch (error) {
		console.error("[web-api/search] failed", error);
		return c.json({ error: "search_unavailable" }, 503);
	}
});
