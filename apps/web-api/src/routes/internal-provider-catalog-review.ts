import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { stageApprovedProviderRoute } from "./account/provider-catalog-reconciliation";

const decisionSchema = z.object({
	decision: z.enum(["approved", "rejected", "needs_changes"]),
	reason: z.string().trim().max(1_000).optional(),
});
const probeSchema = z.object({ passed: z.boolean(), summary: z.record(z.string(), z.unknown()).default({}) });

async function adminUser(c: any) {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return null;
	const role = await getDataClient(c.env).from("users").select("role").eq("user_id", user.id).maybeSingle();
	return !role.error && String(role.data?.role ?? "").toLowerCase() === "admin" ? user : null;
}

function decodedModelSlug(value: string): string {
	try { return decodeURIComponent(value); } catch { return value; }
}

function aggregateReviewStatus(decisions: string[]): string {
	const counts = new Map<string, number>();
	for (const decision of decisions) counts.set(decision, (counts.get(decision) ?? 0) + 1);
	if (counts.has("pending")) return "in_progress";
	if (counts.has("needs_changes")) return "needs_changes";
	if (counts.has("approved") && counts.has("rejected")) return "partially_approved";
	if (counts.has("approved")) return "approved";
	return "rejected";
}

async function reviewPayload(client: any, runs: any[]) {
	const runIds = runs.map((run) => String(run.id));
	if (!runIds.length) return [];
	const [modelsResult, capabilitiesResult, providersResult, candidatesResult] = await Promise.all([
		client.from("provider_catalog_sync_models").select("run_id,provider_slug,model_slug,provider_model_slug,name,description,input_modalities,output_modalities,context_length,max_output_tokens,decision,decision_reason,reviewed_at,created_at").in("run_id", runIds).order("created_at", { ascending: true }),
		client.from("provider_catalog_sync_model_capabilities").select("run_id,model_slug,capability_id,parameters").in("run_id", runIds).order("capability_id", { ascending: true }),
		client.from("v2_providers").select("provider_slug,name,status").in("provider_slug", [...new Set(runs.map((run) => String(run.provider_slug)))]),
		client.from("provider_catalog_route_candidates").select("run_id,submitted_model_slug,status,probe_summary,probed_at,promoted_at").in("run_id", runIds),
	]);
	if (modelsResult.error || capabilitiesResult.error || providersResult.error || candidatesResult.error) throw new Error("review_data_unavailable");
	const capabilitiesByModel = new Map<string, any[]>();
	for (const capability of capabilitiesResult.data ?? []) {
		const key = `${capability.run_id}:${capability.model_slug}`;
		capabilitiesByModel.set(key, [...(capabilitiesByModel.get(key) ?? []), { id: capability.capability_id, parameters: capability.parameters ?? [] }]);
	}
	const providers = new Map((providersResult.data ?? []).map((provider) => [String(provider.provider_slug), provider]));
	const modelsByRun = new Map<string, any[]>();
	const candidates = new Map((candidatesResult.data ?? []).map((candidate) => [`${candidate.run_id}:${candidate.submitted_model_slug}`, candidate]));
	for (const model of modelsResult.data ?? []) {
		const key = String(model.run_id);
		modelsByRun.set(key, [...(modelsByRun.get(key) ?? []), { ...model, capabilities: capabilitiesByModel.get(`${key}:${model.model_slug}`) ?? [], candidate: candidates.get(`${key}:${model.model_slug}`) ?? null }]);
	}
	return runs.map((run) => ({ ...run, provider: providers.get(String(run.provider_slug)) ?? null, models: modelsByRun.get(String(run.id)) ?? [] }));
}

export const internalProviderCatalogReviewRouter = new Hono<{ Bindings: Env }>();

internalProviderCatalogReviewRouter.get("/provider-catalog/reviews", async (c) => {
	const user = await adminUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 403, PRIVATE_NO_STORE_HEADERS);
	const status = c.req.query("status");
	const allowedStatuses = ["pending", "in_progress", "approved", "partially_approved", "rejected", "needs_changes"];
	if (status && !allowedStatuses.includes(status)) return c.json({ error: "invalid_status" }, 400, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	let query = client.from("provider_catalog_sync_runs").select("id,provider_slug,trigger,status,review_status,review_summary,catalog_url,catalog_sha256,model_count,error_message,started_at,completed_at,created_at").order("created_at", { ascending: false }).limit(50);
	if (status) query = query.eq("review_status", status);
	const runs = await query;
	if (runs.error) return c.json({ error: "review_data_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	try { return c.json({ reviews: await reviewPayload(client, runs.data ?? []) }, 200, PRIVATE_NO_STORE_HEADERS); }
	catch { return c.json({ error: "review_data_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); }
});

internalProviderCatalogReviewRouter.patch("/provider-catalog/reviews/:runId/models/:modelSlug", async (c) => {
	const user = await adminUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 403, PRIVATE_NO_STORE_HEADERS);
	const parsed = decisionSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "invalid_review", message: parsed.error.issues[0]?.message ?? "Invalid review decision." }, 400, PRIVATE_NO_STORE_HEADERS);
	if (parsed.data.decision !== "approved" && !parsed.data.reason) return c.json({ error: "review_reason_required", message: "A reason is required when a model is not approved." }, 400, PRIVATE_NO_STORE_HEADERS);
	const runId = c.req.param("runId");
	const modelSlug = decodedModelSlug(c.req.param("modelSlug"));
	const client = getDataClient(c.env);
	const existing = await client.from("provider_catalog_sync_models").select("run_id,provider_slug,model_slug,provider_model_slug,name,description,input_modalities,output_modalities,context_length,max_output_tokens,availability,available_from,deprecated_at,shutdown_at,canonical_model_slug,metadata").eq("run_id", runId).eq("model_slug", modelSlug).maybeSingle();
	if (existing.error) return c.json({ error: "review_data_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!existing.data) return c.json({ error: "review_model_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	let canonicalModelSlug = existing.data.canonical_model_slug ? String(existing.data.canonical_model_slug) : null;
	if (parsed.data.decision === "approved" && !canonicalModelSlug) {
		const labSlug = modelSlug.split("/", 1)[0]?.toLowerCase();
		if (!labSlug) return c.json({ error: "canonical_model_invalid" }, 409, PRIVATE_NO_STORE_HEADERS);
		const lab = await client.from("v2_labs").upsert({ lab_slug: labSlug, name: labSlug, status: "disabled", routable: false, metadata: { created_from_provider_proposal: true } }, { onConflict: "lab_slug", ignoreDuplicates: true });
		if (lab.error) return c.json({ error: "canonical_model_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
		const model = await client.from("v2_models").upsert({ model_slug: modelSlug, lab_slug: labSlug, name: existing.data.name ?? modelSlug, description: existing.data.description, status: "active", hidden: true, input_modalities: existing.data.input_modalities ?? [], output_modalities: existing.data.output_modalities ?? [], metadata: { created_from_provider_proposal: true, approved_run_id: runId } }, { onConflict: "model_slug", ignoreDuplicates: true });
		if (model.error) return c.json({ error: "canonical_model_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
		canonicalModelSlug = modelSlug;
	}
	const now = new Date().toISOString();
	const updated = await client.from("provider_catalog_sync_models").update({ canonical_model_slug: canonicalModelSlug, decision: parsed.data.decision, decision_reason: parsed.data.decision === "approved" ? null : parsed.data.reason, reviewed_by: user.id, reviewed_at: now }).eq("run_id", runId).eq("model_slug", modelSlug).select("run_id,provider_slug,model_slug,decision,decision_reason,reviewed_at").single();
	if (updated.error) return c.json({ error: "review_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	const event = await client.from("provider_catalog_review_events").insert({ run_id: runId, model_slug: modelSlug, decision: parsed.data.decision, reason: parsed.data.decision === "approved" ? null : parsed.data.reason, actor_user_id: user.id });
	if (event.error) return c.json({ error: "review_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (parsed.data.decision === "approved") {
		try {
			const capabilityRows = await client.from("provider_catalog_sync_model_capabilities").select("capability_id,parameters").eq("run_id", runId).eq("model_slug", modelSlug);
			if (capabilityRows.error) throw capabilityRows.error;
			await stageApprovedProviderRoute(client, runId, String(existing.data.provider_slug), {
				id: String(existing.data.model_slug), providerModelSlug: String(existing.data.provider_model_slug),
				inputModalities: existing.data.input_modalities ?? [], outputModalities: existing.data.output_modalities ?? [],
				contextLength: existing.data.context_length, maxOutputTokens: existing.data.max_output_tokens,
				availability: existing.data.availability ?? "ready", availableFrom: existing.data.available_from,
				deprecatedAt: existing.data.deprecated_at, shutdownAt: existing.data.shutdown_at,
				capabilities: (capabilityRows.data ?? []).map((row) => ({ id: String(row.capability_id), parameters: row.parameters ?? [] })),
				pricing: Array.isArray(existing.data.metadata?.pricing) ? existing.data.metadata.pricing : [],
			}, String(canonicalModelSlug));
			await client.from("provider_catalog_sync_models").update({ route_projection_status: "staged", route_projection_error: null }).eq("run_id", runId).eq("model_slug", modelSlug);
		} catch (error) {
			await client.from("provider_catalog_sync_models").update({ route_projection_status: "failed", route_projection_error: String(error).slice(0, 500) }).eq("run_id", runId).eq("model_slug", modelSlug);
			return c.json({ error: "route_projection_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
		}
	}
	const ownerLinks = await client.from("provider_account_links").select("workspace_id").eq("provider_slug", String(existing.data.provider_slug)).in("status", ["pending", "active"]);
	if (!ownerLinks.error && ownerLinks.data?.length) await client.from("provider_catalog_events").insert(ownerLinks.data.map((row: any) => ({ provider_slug: existing.data.provider_slug, run_id: runId, workspace_id: row.workspace_id, event_type: `model_${parsed.data.decision}`, title: `Model ${parsed.data.decision.replace("_", " ")}`, message: parsed.data.decision === "approved" ? `${modelSlug} was approved and staged for endpoint checks.` : `${modelSlug}: ${parsed.data.reason}` })));
	const decisions = await client.from("provider_catalog_sync_models").select("decision").eq("run_id", runId);
	if (decisions.error) return c.json({ error: "review_data_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const reviewStatus = aggregateReviewStatus((decisions.data ?? []).map((row) => String(row.decision)));
	const summary = (decisions.data ?? []).reduce((counts: Record<string, number>, row) => { const key = String(row.decision); counts[key] = (counts[key] ?? 0) + 1; return counts; }, {});
	const run = await client.from("provider_catalog_sync_runs").update({ review_status: reviewStatus, review_summary: summary, reviewed_by: reviewStatus === "in_progress" ? null : user.id, reviewed_at: reviewStatus === "in_progress" ? null : now }).eq("id", runId);
	if (run.error) return c.json({ error: "review_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true, model: updated.data, reviewStatus, reviewSummary: summary }, 200, PRIVATE_NO_STORE_HEADERS);
});

internalProviderCatalogReviewRouter.patch("/provider-catalog/candidates/:runId/models/:modelSlug/probe", async (c) => {
	const user = await adminUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 403, PRIVATE_NO_STORE_HEADERS);
	const parsed = probeSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "invalid_probe_result" }, 400, PRIVATE_NO_STORE_HEADERS);
	const runId = c.req.param("runId");
	const modelSlug = decodedModelSlug(c.req.param("modelSlug"));
	const client = getDataClient(c.env);
	const updated = await client.from("provider_catalog_route_candidates").update({ status: parsed.data.passed ? "probe_passed" : "probe_failed", probe_summary: parsed.data.summary, probed_by: user.id, probed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("run_id", runId).eq("submitted_model_slug", modelSlug).in("status", ["pending_probe", "probe_failed", "probe_passed"]).select("run_id,submitted_model_slug,status,probe_summary,probed_at").maybeSingle();
	if (updated.error) return c.json({ error: "probe_write_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!updated.data) return c.json({ error: "route_candidate_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	await client.from("provider_catalog_sync_models").update({ route_projection_status: parsed.data.passed ? "probe_passed" : "failed", route_projection_error: parsed.data.passed ? null : String(parsed.data.summary.reason ?? "Endpoint probe failed").slice(0, 500) }).eq("run_id", runId).eq("model_slug", modelSlug);
	return c.json({ ok: true, candidate: updated.data }, 200, PRIVATE_NO_STORE_HEADERS);
});

internalProviderCatalogReviewRouter.post("/provider-catalog/candidates/:runId/models/:modelSlug/promote", async (c) => {
	const user = await adminUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 403, PRIVATE_NO_STORE_HEADERS);
	const runId = c.req.param("runId");
	const modelSlug = decodedModelSlug(c.req.param("modelSlug"));
	const result = await getDataClient(c.env).rpc("promote_provider_catalog_candidate", { p_run_id: runId, p_submitted_model_slug: modelSlug });
	if (result.error) {
		if (result.error.message.includes("provider_catalog_probe_required")) return c.json({ error: "probe_required" }, 409, PRIVATE_NO_STORE_HEADERS);
		if (result.error.message.includes("provider_catalog_pricing_required")) return c.json({ error: "pricing_required" }, 409, PRIVATE_NO_STORE_HEADERS);
		if (result.error.message.includes("provider_catalog_adapter_required")) return c.json({ error: "adapter_required" }, 409, PRIVATE_NO_STORE_HEADERS);
		if (result.error.message.includes("provider_catalog_credentials_required")) return c.json({ error: "credentials_required" }, 409, PRIVATE_NO_STORE_HEADERS);
		if (result.error.message.includes("provider_catalog_endpoint_required")) return c.json({ error: "endpoint_required" }, 409, PRIVATE_NO_STORE_HEADERS);
		if (result.error.message.includes("provider_catalog_candidate_not_found")) return c.json({ error: "route_candidate_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
		if (result.error.message.includes("provider_catalog_candidate_superseded")) return c.json({ error: "candidate_superseded" }, 409, PRIVATE_NO_STORE_HEADERS);
		return c.json({ error: "route_promotion_failed" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	return c.json({ ok: true, providerModelId: result.data }, 200, PRIVATE_NO_STORE_HEADERS);
});
