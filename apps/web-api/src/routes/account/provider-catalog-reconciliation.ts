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

export async function reconcileProviderCatalogClaims(client: any, args: { providerSlug: string; runId: string; models: CatalogModel[]; renewLease?: () => Promise<void> }) {
	const ids = args.models.map((model) => model.id.toLowerCase());
	const now = new Date().toISOString();
	const [exactResult, aliasResult, linkResult] = await Promise.all([
		client.from("v2_models").select("model_slug").in("model_slug", ids).eq("hidden", false),
		client.from("v2_model_aliases").select("alias_slug,model_slug,effective_from,effective_to").in("alias_slug", ids).eq("enabled", true).or(`effective_from.is.null,effective_from.lte.${now}`).or(`effective_to.is.null,effective_to.gt.${now}`),
		client.from("provider_account_links").select("workspace_id").eq("provider_slug", args.providerSlug).eq("status", "active"),
	]);
	if (exactResult.error || aliasResult.error) throw new Error("canonical_model_lookup_failed");
	const targets = [...new Set([...ids, ...(aliasResult.data ?? []).map((row: any) => String(row.model_slug))])];
	const [visibleTargets, stealthTargets] = await Promise.all([
		client.from("v2_models").select("model_slug").in("model_slug", targets).eq("hidden", false),
		client.from("v2_model_provider_routes").select("model_slug").in("model_slug", targets).eq("is_stealth", true),
	]);
	if (visibleTargets.error || stealthTargets.error) throw new Error("canonical_model_visibility_unavailable");
	const stealth = new Set((stealthTargets.data ?? []).map((row: any) => String(row.model_slug)));
	const visible = new Set((visibleTargets.data ?? []).map((row: any) => String(row.model_slug)).filter((id: string) => !stealth.has(id)));
	const exact = new Set((exactResult.data ?? []).map((row: any) => String(row.model_slug)).filter((id: string) => visible.has(id)));
	const aliases = new Map<string, string>((aliasResult.data ?? []).filter((row: any) => visible.has(String(row.model_slug))).map((row: any) => [String(row.alias_slug), String(row.model_slug)]));
	let approved = 0;
	let pending = 0;
	for (const model of args.models) {
		await args.renewLease?.();
		const id = model.id.toLowerCase();
		const canonical = exact.has(id) ? id : aliases.get(id) ?? null;
		const matchType = exact.has(id) ? "exact" : canonical ? "alias" : "new_model";
		const decision = canonical ? "approved" : "pending";
		const update = await client.from("provider_catalog_sync_models").update({
			canonical_model_slug: canonical, match_type: matchType, decision,
			decision_reason: canonical ? "Automatically matched to an existing canonical model." : null,
			reviewed_at: canonical ? now : null, availability: model.availability,
			available_from: model.availableFrom, deprecated_at: model.deprecatedAt,
			shutdown_at: model.shutdownAt, metadata: { pricing: model.pricing }, route_projection_status: canonical ? "staged" : "not_projected",
		}).eq("run_id", args.runId).eq("model_slug", model.id);
		if (update.error) throw update.error;
		const snapshot = await client.from("provider_catalog_models").update({ canonical_model_slug: canonical, availability: model.availability, available_from: model.availableFrom, deprecated_at: model.deprecatedAt, shutdown_at: model.shutdownAt }).eq("provider_slug", args.providerSlug).eq("model_slug", model.id);
		if (snapshot.error) throw snapshot.error;
		if (canonical) { await stageApprovedProviderRoute(client, args.runId, args.providerSlug, model, canonical); approved += 1; }
		else pending += 1;
	}
	const reviewStatus = pending ? (approved ? "in_progress" : "pending") : "approved";
	await client.from("provider_catalog_sync_runs").update({ review_status: reviewStatus, review_summary: { approved, pending } }).eq("id", args.runId);
	const workspaces = (linkResult.data ?? []).map((row: any) => row.workspace_id).filter(Boolean);
	if (workspaces.length) await client.from("provider_catalog_events").insert(workspaces.map((workspaceId: string) => ({ provider_slug: args.providerSlug, run_id: args.runId, workspace_id: workspaceId, event_type: pending ? "catalog_applied" : "model_auto_approved", title: pending ? "Catalog synced" : "Catalog approved", message: pending ? `${approved} model claims were approved automatically; ${pending} new models need review.` : `All ${approved} model claims matched the canonical catalog and were staged for probes.` })));
	return { approved, pending, reviewStatus };
}
