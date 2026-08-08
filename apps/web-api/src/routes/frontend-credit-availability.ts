import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS, withPublicCache } from "@/http/cache";
import { buildRestrictedModelPreview } from "@/lib/credits/routeAvailability";

export const frontendCreditAvailabilityRouter = new Hono<{ Bindings: Env }>();

async function fetchAllRows<T>(
	fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += 1_000) {
		const result = await fetchPage(from, from + 999);
		if (result.error) throw result.error;
		const page = result.data ?? [];
		rows.push(...page);
		if (page.length < 1_000) return rows;
	}
}

frontendCreditAvailabilityRouter.get("/credits/model-availability", async (c) => {
	const countryCode = c.req.query("country")?.trim().toUpperCase() ?? "";
	if (!/^[A-Z]{2}$/.test(countryCode) || countryCode === "XX") {
		return c.json({ error: "invalid_country" }, 400, PRIVATE_NO_STORE_HEADERS);
	}

	try {
		const db = getDataClient(c.env);
		const [routeRows, providerRows, modelRows] = await Promise.all([
			fetchAllRows((from, to) => db.from("v2_model_provider_routes")
				.select("provider_model_id,provider_slug,model_slug,metadata,effective_from,effective_to")
				.eq("routing_enabled", true)
				.in("status", ["active", "degraded"])
				.order("provider_model_id", { ascending: true })
				.range(from, to)),
			fetchAllRows((from, to) => db.from("v2_providers")
				.select("provider_slug,metadata")
				.order("provider_slug", { ascending: true })
				.range(from, to)),
			fetchAllRows((from, to) => db.from("v2_models")
				.select("model_slug,name,lab_slug,lab:v2_labs!v2_models_lab_slug_fkey(name)")
				.eq("hidden", false)
				.order("model_slug", { ascending: true })
				.range(from, to)),
		]);

		const providerAvailability = new Map(providerRows.map((provider) => {
			const metadata = provider.metadata && typeof provider.metadata === "object" && !Array.isArray(provider.metadata)
				? provider.metadata as Record<string, unknown>
				: {};
			return [String(provider.provider_slug), metadata.availability] as const;
		}));
		const nowMs = Date.now();
		const routes = routeRows.flatMap((route) => {
			const effectiveFrom = route.effective_from ? Date.parse(String(route.effective_from)) : Number.NaN;
			const effectiveTo = route.effective_to ? Date.parse(String(route.effective_to)) : Number.NaN;
			if ((Number.isFinite(effectiveFrom) && nowMs < effectiveFrom) || (Number.isFinite(effectiveTo) && nowMs >= effectiveTo)) return [];
			const metadata = route.metadata && typeof route.metadata === "object" && !Array.isArray(route.metadata)
				? route.metadata as Record<string, unknown>
				: {};
			return [{
				modelSlug: String(route.model_slug ?? ""),
				availability: metadata.availability ?? providerAvailability.get(String(route.provider_slug ?? "")),
			}];
		});
		const preview = buildRestrictedModelPreview({
			countryCode,
			routes,
			models: modelRows.map((model) => {
				const lab = Array.isArray(model.lab) ? model.lab[0] : model.lab;
				return {
					modelSlug: String(model.model_slug ?? ""),
					name: model.name == null ? null : String(model.name),
					logoId: model.lab_slug == null ? null : String(model.lab_slug),
					organisationName: lab?.name == null ? null : String(lab.name),
				};
			}),
			nowMs,
		});

		return withPublicCache(c.json({ countryCode, ...preview }), {
			browserTtlSeconds: 15 * 60,
			cacheTags: ["web-api-credit-model-availability"],
			edgeTtlSeconds: 15 * 60,
			staleWhileRevalidateSeconds: 15 * 60,
		});
	} catch (error) {
		console.error("[web-api/credit-model-availability] failed", error);
		return c.json({ error: "model_availability_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
});
