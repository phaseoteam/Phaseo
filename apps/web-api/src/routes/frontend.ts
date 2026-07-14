import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

export const frontendRouter = new Hono<{ Bindings: Env }>();

frontendRouter.get("/search", async (c) => {
	try {
		const db = getDataClient(c.env);
		const [modelsResult, organisationsResult, benchmarksResult, providersResult] = await Promise.all([
			db.from("data_models").select("model_id,name,organisation_id,release_date,announcement_date,organisation:data_organisations(name)").eq("hidden", false).order("release_date", { ascending: false }),
			db.from("data_organisations").select("organisation_id,name").order("name", { ascending: true }),
			db.from("data_benchmarks").select("id,name,total_models").order("name", { ascending: true }),
			db.from("data_api_providers").select("api_provider_id,api_provider_name").order("api_provider_name", { ascending: true }),
		]);
		for (const result of [modelsResult, organisationsResult, benchmarksResult, providersResult]) {
			if (result.error) throw result.error;
		}
		const payload = {
			m: (modelsResult.data ?? []).map((model) => [model.model_id, model.name, (model.organisation as { name?: string | null } | null)?.name ?? null, `/models/${model.model_id}`, model.organisation_id, model.release_date ?? model.announcement_date ?? null]),
			o: (organisationsResult.data ?? []).map((organisation) => [organisation.organisation_id, organisation.name || organisation.organisation_id, null, `/organisations/${organisation.organisation_id}`, organisation.organisation_id]),
			b: (benchmarksResult.data ?? []).map((benchmark) => [benchmark.id, benchmark.name, `${benchmark.total_models ?? 0} models`, `/benchmarks/${benchmark.id}`]),
			p: (providersResult.data ?? []).map((provider) => [provider.api_provider_id, provider.api_provider_name, null, `/api-providers/${provider.api_provider_id}`, provider.api_provider_id]),
			s: [],
			c: [],
		};
		return withPublicCache(c.json(payload), { edgeTtlSeconds: 15 * 60, staleWhileRevalidateSeconds: 60 * 60, cacheTags: ["web-api-search"] });
	} catch (error) {
		console.error("[web-api/search] failed", error);
		return c.json({ error: "search_unavailable" }, 503);
	}
});
