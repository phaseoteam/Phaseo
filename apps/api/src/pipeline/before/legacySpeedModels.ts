import { isSynchronousTextEndpoint, readRequestedServiceTier } from "@core/serviceTiers";
import type { Endpoint } from "@core/types";
import { getSupabaseAdmin } from "@/runtime/env";

// Keep the speed choice encoded in previously published model IDs. A plain
// database alias would resolve the base identity and silently select standard.
const legacySpeedModels = new Map([
	["minimax/minimax-m2.5-highspeed", "minimax/minimax-m2.5"],
	["moonshotai/kimi-k2.7-code-highspeed", "moonshotai/kimi-k2.7-code"],
	["xiaomi/mimo-v2.5-pro-ultraspeed", "xiaomi/mimo-v2.5-pro"],
]);

export async function normalizeLegacySpeedModel(body: any, endpoint: Endpoint): Promise<any> {
	if (!isSynchronousTextEndpoint(endpoint) || typeof body?.model !== "string") return body;
	const base = legacySpeedModels.get(body.model.trim().toLowerCase());
	if (!base) return body;
	// The classification is the cutover marker. Before the data migration, keep
	// using the standalone route; after it, preserve its fast tier.
	const model = await getSupabaseAdmin().from("v2_models")
		.select("metadata").eq("model_slug", body.model.trim().toLowerCase()).maybeSingle();
	if (model.error) throw new Error("legacy_speed_model_lookup_failed");
	const tier = model.data?.metadata?.serving_tier;
	if (!tier) return body;
	if (tier.model_slug !== base || tier.name !== "fast") {
		throw new Error("legacy_speed_model_tier_invalid");
	}
	const requestedTier = readRequestedServiceTier(body).value;
	const implicitTier = requestedTier == null || (typeof requestedTier === "string" && !requestedTier.trim());
	return { ...body, model: base, ...(implicitTier ? { service_tier: "fast" } : {}) };
}
