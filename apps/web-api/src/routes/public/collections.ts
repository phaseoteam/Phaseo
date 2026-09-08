import { Hono } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { withPublicCache } from "@/http/cache";

const COLLECTION_CACHE = {
	edgeTtlSeconds: 60 * 60,
	staleWhileRevalidateSeconds: 24 * 60 * 60,
	cacheTags: ["web-api-collections", "web-api-models"],
} as const;

type Model = Record<string, unknown>;

function toModel(row: Model) {
	const organisation = Array.isArray(row.lab ?? row.organisation) ? (row.lab ?? row.organisation as unknown[])[0] : row.lab ?? row.organisation;
	const primaryDate = row.released_at ?? row.release_date ?? row.announced_at ?? row.announcement_date ?? null;
	const metadata = organisation && typeof organisation === "object" && !Array.isArray(organisation) && (organisation as { metadata?: unknown }).metadata && typeof (organisation as { metadata?: unknown }).metadata === "object" ? (organisation as { metadata: Record<string, unknown> }).metadata : {};
	const timestamp = typeof primaryDate === "string" ? Date.parse(primaryDate) : Number.NaN;
	return {
		model_id: row.model_slug ?? row.model_id,
		name: row.name,
		organisation_id: row.lab_slug ?? row.organisation_id,
		organisation_name: (organisation as { name?: string } | null)?.name ?? null,
		organisation_colour: metadata.colour ?? (organisation as { colour?: string } | null)?.colour ?? null,
		status: row.status ?? null,
		release_date: row.released_at ?? row.release_date ?? null,
		announcement_date: row.announced_at ?? row.announcement_date ?? null,
		input_types: row.input_modalities ?? row.input_types ?? [],
		output_types: row.output_modalities ?? row.output_types ?? [],
		primary_date: primaryDate,
		primary_timestamp: Number.isFinite(timestamp) ? timestamp : null,
	};
}

function uniqueLatest(rows: Model[], limit: number) {
	const byId = new Map<string, ReturnType<typeof toModel>>();
	for (const row of rows) {
		const model = toModel(row);
		const id = String(model.model_id ?? "").trim();
		if (id && !byId.has(id)) byId.set(id, model);
	}
	return Array.from(byId.values())
		.sort((left, right) => Number(right.primary_timestamp ?? 0) - Number(left.primary_timestamp ?? 0))
		.slice(0, limit);
}

function hasModality(row: Model, modality: string) {
	const values = [row.input_types, row.output_types]
		.flatMap((value) => Array.isArray(value) ? value : String(value ?? "").split(","))
		.map((value) => String(value).toLowerCase());
	return values.some((value) => value.includes(modality));
}

export const publicCollectionsRouter = new Hono<{ Bindings: Env }>();

publicCollectionsRouter.get("/collections", async (c) => {
	try {
		const limit = Math.max(1, Math.min(25, Number(c.req.query("limit") ?? 10) || 10));
		const client = getDataClient(c.env);
		const [modelsResult, capabilitiesResult, routesResult, benchmarkResults] = await Promise.all([
			client.from("v2_models").select("model_slug,name,lab_slug,status,released_at,announced_at,input_modalities,output_modalities,lab:v2_labs!v2_models_lab_slug_fkey(name,metadata)").eq("hidden", false),
			client.from("v2_route_capabilities").select("provider_model_id,capability_id,params").eq("status", "active"),
			client.from("v2_model_provider_routes").select("provider_model_id,model_slug").eq("is_stealth", false).eq("routing_enabled", true).in("status", ["active", "degraded"]),
			client.from("v2_benchmark_results").select("benchmark_id,rank,model_slug").or(`effective_to.is.null,effective_to.gt.${new Date().toISOString()}`).in("benchmark_id", ["aider-polyglot", "mmmu"]).order("rank", { ascending: true }).limit(limit * 8),
		]);
		if (modelsResult.error) throw modelsResult.error;
		if (capabilitiesResult.error) throw capabilitiesResult.error;
		if (routesResult.error) throw routesResult.error;
		if (benchmarkResults.error) throw benchmarkResults.error;
		const models = (modelsResult.data ?? []) as Model[];
		const modelBySlug = new Map(models.map((model) => [String(model.model_slug), model]));
		const routeModels = new Map((routesResult.data ?? []).map((route) => [route.provider_model_id, route.model_slug]));
		const image = uniqueLatest(models.filter((model) => hasModality(model, "image")), limit);
		const video = uniqueLatest(models.filter((model) => hasModality(model, "video")), limit);
		const audio = uniqueLatest(models.filter((model) => hasModality(model, "audio") || hasModality(model, "music")), limit);
		const featureModels = (feature: "tools" | "reasoning") => uniqueLatest(
			(capabilitiesResult.data ?? []).flatMap((row) => {
				const params = JSON.stringify(row.params ?? {}).toLowerCase();
				if (!params.includes(feature)) return [];
				const model = modelBySlug.get(routeModels.get(row.provider_model_id) ?? "");
				return model ? [model] : [];
			}),
			limit,
		);
		const topModels = (benchmarkId: string) => uniqueLatest(
			(benchmarkResults.data ?? [])
				.filter((row) => row.benchmark_id === benchmarkId)
				.flatMap((row) => {
					const model = modelBySlug.get(row.model_slug);
					return model ? [model] : [];
				}),
			limit,
		);
		const collections = [
			{ id: "image-generation", title: "Image generation", description: "Models that can generate or edit images.", models: image },
			{ id: "video-generation", title: "Video generation", description: "Models that can generate, transform, or reason about video.", models: video },
			{ id: "audio-models", title: "Audio models", description: "Models for speech, transcription, and audio-native workflows.", models: audio },
			{ id: "tools", title: "Tool calling", description: "Models with native tool/function calling support.", models: featureModels("tools") },
			{ id: "reasoning", title: "Reasoning models", description: "Models with explicit reasoning capabilities in active providers.", models: featureModels("reasoning") },
			{ id: "coding", title: "Best coding models", description: "Top-ranked models for code generation.", hint: "Based on Aider Polyglot benchmark rankings.", models: topModels("aider-polyglot") },
			{ id: "image-understanding", title: "Best image understanding", description: "Top-ranked models for multimodal reasoning.", hint: "Based on MMMU benchmark rankings.", models: topModels("mmmu") },
		];
		return withPublicCache(c.json({ collections }), COLLECTION_CACHE);
	} catch (error) {
		console.error("[web-api/collections] failed", error);
		return c.json({ error: "collections_unavailable" }, 503);
	}
});
