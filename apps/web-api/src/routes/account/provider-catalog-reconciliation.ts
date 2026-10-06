type CatalogModel = {
	id: string; providerModelSlug: string; inputModalities: string[]; outputModalities: string[];
	contextLength: number | null; maxOutputTokens: number | null;
	availability: "ready" | "not_ready" | "degraded" | "deprecated" | "retired";
	availableFrom: string | null; deprecatedAt: string | null; shutdownAt: string | null;
	capabilities: Array<{ id: string; parameters: string[] }>;
	pricing: Array<{ meterKey: string; modality: string; direction: string | null; unit: string; unitQuantity: number; priceNanos: number; displayLabel: string; displayUnit: string; conditions: Array<{ path: string; op: "eq" | "in" | "gt" | "gte" | "lt" | "lte"; value: string | number | boolean | Array<string | number> }> }>;
};

export async function stageApprovedProviderRoute(client: any, runId: string, providerSlug: string, model: CatalogModel, canonicalModelSlug: string) {
	const result = await client.from("provider_catalog_route_candidates").upsert({
		run_id: runId, provider_slug: providerSlug, submitted_model_slug: model.id,
		canonical_model_slug: canonicalModelSlug, provider_model_slug: model.providerModelSlug,
		availability: model.availability, input_modalities: model.inputModalities,
		output_modalities: model.outputModalities, context_length: model.contextLength,
		max_output_tokens: model.maxOutputTokens, available_from: model.availableFrom,
		deprecated_at: model.deprecatedAt, shutdown_at: model.shutdownAt,
		capabilities: model.capabilities, pricing: model.pricing, status: "pending_probe", updated_at: new Date().toISOString(),
	}, { onConflict: "run_id,submitted_model_slug" });
	if (result.error) throw result.error;
}
