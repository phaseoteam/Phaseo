import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

const MARKETPLACE_CACHE = {
	edgeTtlSeconds: 15 * 60,
	staleWhileRevalidateSeconds: 60 * 60,
} as const;

export const publicMarketplaceRouter = new Hono<{ Bindings: Env }>();

publicMarketplaceRouter.get("/marketplace/presets", async (c) => {
	try {
		const { data, error } = await getDataClient(c.env)
			.from("presets")
			.select("id,name,description,created_at,source_preset_id")
			.eq("visibility", "public")
			.order("created_at", { ascending: false });
		if (error) throw error;
		return withPublicCache(c.json({ presets: data ?? [] }), {
			...MARKETPLACE_CACHE,
			cacheTags: ["web-api-marketplace", "web-api-marketplace-presets"],
		});
	} catch (error) {
		console.error("[web-api/marketplace] presets failed", error);
		return c.json({ error: "marketplace_unavailable" }, 503);
	}
});

publicMarketplaceRouter.get("/marketplace/presets/:presetId", async (c) => {
	const presetId = c.req.param("presetId").trim();
	try {
		const client = getDataClient(c.env);
		const { data: preset, error } = await client
			.from("presets")
			.select("id,name,description,config,visibility,created_at,source_preset_id")
			.eq("id", presetId)
			.eq("visibility", "public")
			.maybeSingle();
		if (error) throw error;
		if (!preset) return c.json({ error: "preset_not_found" }, 404);
		let sourcePreset: { id: string; name: string } | null = null;
		if (preset.source_preset_id) {
			const { data: source, error: sourceError } = await client
				.from("presets")
				.select("id,name")
				.eq("id", preset.source_preset_id)
				.eq("visibility", "public")
				.maybeSingle();
			if (sourceError) throw sourceError;
			if (source) sourcePreset = source;
		}
		return withPublicCache(c.json({ preset, sourcePreset }), {
			...MARKETPLACE_CACHE,
			cacheTags: [
				"web-api-marketplace",
				"web-api-marketplace-presets",
				`web-api-preset-${encodeURIComponent(presetId).replace(/%/g, "")}`.slice(0, 128),
			],
		});
	} catch (error) {
		console.error("[web-api/marketplace] preset failed", { presetId, error });
		return c.json({ error: "preset_unavailable" }, 503);
	}
});
