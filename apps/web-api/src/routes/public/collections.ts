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
	const organisation = Array.isArray(row.organisation) ? row.organisation[0] : row.organisation;
	const primaryDate = row.release_date ?? row.announcement_date ?? null;
	const timestamp = typeof primaryDate === "string" ? Date.parse(primaryDate) : Number.NaN;
	return {
		model_id: row.model_id,
		name: row.name,
		organisation_id: row.organisation_id,
		organisation_name: (organisation as { name?: string } | null)?.name ?? null,
		organisation_colour: (organisation as { colour?: string } | null)?.colour ?? null,
		status: row.status ?? null,
		release_date: row.release_date ?? null,
		announcement_date: row.announcement_date ?? null,
		input_types: row.input_types ?? [],
		output_types: row.output_types ?? [],
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
		const [modelsResult, capabilitiesResult, benchmarkResults] = await Promise.all([
			client.from("data_models").select("model_id,name,organisation_id,status,release_date,announcement_date,input_types,output_types,organisation:data_organisations(name,colour)").eq("hidden", false),
			client.from("data_api_provider_model_capabilities").select("capability_id,params,provider_model:data_api_provider_models!inner(is_active_gateway,model:data_models!data_api_provider_models_model_id_fkey(model_id,name,organisation_id,status,release_date,announcement_date,input_types,output_types,hidden,organisation:data_organisations(name,colour)))").eq("status", "active"),
			client.from("data_benchmark_results").select("benchmark_id,rank,model:data_models(model_id,name,organisation_id,status,release_date,announcement_date,input_types,output_types,hidden,organisation:data_organisations(name,colour))").in("benchmark_id", ["aider-polyglot", "mmmu"]).order("rank", { ascending: true }).limit(limit * 8),
		]);
		if (modelsResult.error) throw modelsResult.error;
		if (capabilitiesResult.error) throw capabilitiesResult.error;
		if (benchmarkResults.error) throw benchmarkResults.error;
		const models = (modelsResult.data ?? []) as Model[];
		const image = uniqueLatest(models.filter((model) => hasModality(model, "image")), limit);
		const video = uniqueLatest(models.filter((model) => hasModality(model, "video")), limit);
		const audio = uniqueLatest(models.filter((model) => hasModality(model, "audio") || hasModality(model, "music")), limit);
		const featureModels = (feature: "tools" | "reasoning") => uniqueLatest(
			(capabilitiesResult.data ?? []).flatMap((row) => {
				const params = JSON.stringify(row.params ?? {}).toLowerCase();
				if (!params.includes(feature)) return [];
				const providerModel = Array.isArray(row.provider_model) ? row.provider_model[0] : row.provider_model;
				if (!providerModel?.is_active_gateway) return [];
				const model = Array.isArray(providerModel.model) ? providerModel.model[0] : providerModel.model;
				return model && !model.hidden ? [model as Model] : [];
			}),
			limit,
		);
		const topModels = (benchmarkId: string) => uniqueLatest(
			(benchmarkResults.data ?? [])
				.filter((row) => row.benchmark_id === benchmarkId)
				.flatMap((row) => {
					const model = Array.isArray(row.model) ? row.model[0] : row.model;
					return model && !model.hidden ? [model as Model] : [];
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
