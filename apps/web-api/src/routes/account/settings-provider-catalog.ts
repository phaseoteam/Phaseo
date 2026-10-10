import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { readLimitedText } from "@/http/readLimitedText";
import {
	normalizeProviderCatalog,
	validateProviderCatalogPricingMeters,
	type ProviderCatalogPreview,
} from "./provider-catalog";
import { syncProviderCatalog } from "./provider-catalog-sync";
import { applyCatalogOverrides, catalogOverrideChanges, normalizedCatalogDocument, type CatalogOverrides } from "./provider-catalog-overrides";
import { isProviderCatalogBlockedByReview } from "./provider-review-access";
import { normalizeProviderRateLimits, rateLimitsFromRows } from "./provider-catalog-rate-limits";

const providerSlugSchema = z.string().trim().toLowerCase().min(2).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/);
const MAX_MANAGED_CATALOG_BYTES = 5 * 1024 * 1024;
const MAX_RATE_LIMITS_BYTES = 256 * 1024;
const RATE_LIMIT_SELECT = "provider_model_slug,requests_per_minute,requests_per_day,tokens_per_minute,tokens_per_day";
const rateLimitsBodySchema = z.object({
	// Shape only; entries are validated against the provider's catalog below.
	rate_limits: z.array(z.unknown()).max(1_000),
	// Null until the provider first declares limits.
	expectedVersion: z.string().datetime({ offset: true }).nullable(),
}).strict();
const EMPTY_WORKSPACE_ID = "00000000-0000-0000-0000-000000000000";

type CatalogAccess = { isAdmin: boolean; workspaceId: string | null; linkStatus: string | null; linkedBy: string | null };

const MODEL_METADATA_FIELDS = ["name", "description", "input_modalities", "output_modalities", "context_length", "max_output_tokens", "available_from", "deprecated_at", "shutdown_at"] as const;
const MODEL_METADATA_OVERRIDE_FIELDS = new Set(["name", "description", "inputModalities", "outputModalities", "contextLength", "maxOutputTokens", "availableFrom", "deprecatedAt", "shutdownAt"]);

function errorResponse(c: any, error: string, status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 503) {
	return c.json({ ok: false, error }, status, PRIVATE_NO_STORE_HEADERS);
}

async function readManagedCatalogBody(request: Request): Promise<unknown> {
	if (!request.body) return null;
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_MANAGED_CATALOG_BYTES) {
				await reader.cancel();
				throw new Error("catalog_too_large");
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new Error("catalog_json_invalid");
	}
}

async function workspaceIds(client: any, userId: string): Promise<string[]> {
	const memberships = client.from("workspace_members").select("workspace_id,role").eq("user_id", userId).in("role", ["owner", "admin"]);
	const [membershipResult, ownedResult] = await Promise.all([
		memberships,
		client.from("workspaces").select("id").eq("owner_user_id", userId),
	]);
	if (membershipResult.error || ownedResult.error) throw new Error("workspace_membership_unavailable");
	return [...new Set([
		...(membershipResult.data ?? []).map((row: any) => String(row.workspace_id)),
		...(ownedResult.data ?? []).map((row: any) => String(row.id)),
	])];
}

async function providerAccess(client: any, userId: string, providerSlug: string): Promise<CatalogAccess | null> {
	const role = await client.from("users").select("role").eq("user_id", userId).maybeSingle();
	if (role.error) throw new Error("user_role_unavailable");
	if (String(role.data?.role ?? "").toLowerCase() === "admin") return { isAdmin: true, workspaceId: null, linkStatus: null, linkedBy: null };
	const ids = await workspaceIds(client, userId);
	const link = await client.from("provider_account_links")
		.select("workspace_id,role,status,linked_by")
		.eq("provider_slug", providerSlug)
		.in("workspace_id", ids.length ? ids : [EMPTY_WORKSPACE_ID])
		.in("status", ["pending", "active"])
		.in("role", ["owner", "admin", "editor"])
		.order("status", { ascending: true })
		.limit(1)
		.maybeSingle();
	if (link.error) throw new Error("provider_link_unavailable");
	return link.data ? { isAdmin: false, workspaceId: String(link.data.workspace_id), linkStatus: String(link.data.status), linkedBy: link.data.linked_by ? String(link.data.linked_by) : null } : null;
}

function pricingDocument(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((raw) => {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
		const price = raw as Record<string, unknown>;
		return [{
			meter_key: price.meter_key ?? price.meterKey,
			modality: price.modality,
			direction: price.direction,
			unit: price.unit,
			unit_quantity: price.unit_quantity ?? price.unitQuantity,
			price_nanos: price.price_nanos ?? price.priceNanos,
			display_label: price.display_label ?? price.displayLabel,
			display_unit: price.display_unit ?? price.displayUnit,
			...(price.conditions !== undefined ? { conditions: price.conditions } : {}),
		}];
	});
}

function catalogModelDocument(model: any, capabilities: Array<{ id: string; parameters: string[] }>, pricing: unknown): Record<string, unknown> {
	return {
		id: String(model.model_slug),
		name: String(model.name ?? model.model_slug),
		description: model.description ?? null,
		provider_model_slug: String(model.provider_model_slug ?? model.model_slug),
		input_modalities: Array.isArray(model.input_modalities) ? model.input_modalities : [],
		output_modalities: Array.isArray(model.output_modalities) ? model.output_modalities : [],
		context_length: model.context_length ?? null,
		max_output_tokens: model.max_output_tokens ?? null,
		availability: model.availability ?? "ready",
		available_from: model.available_from ?? null,
		deprecated_at: model.deprecated_at ?? null,
		shutdown_at: model.shutdown_at ?? null,
		capabilities,
		pricing: pricingDocument(pricing),
		...(Array.isArray(model.metadata?.serviceTiers) && model.metadata.serviceTiers.length ? {
			service_tiers: model.metadata.serviceTiers.map((tier: any) => ({
				service_tier: tier.serviceTier, provider_model_slug: tier.providerModelSlug,
				upstream_service_tier: tier.upstreamServiceTier, availability: tier.availability,
				pricing: pricingDocument(tier.pricing),
			})),
		} : {}),
	};
}

function catalogDocument(data: Record<string, any>[]) {
	if (!data.some((model) => model.service_tiers?.length)) return { data };
	return { schema_version: "1.1", data: data.map(({ pricing, provider_model_slug, ...model }) => ({
		...model,
		service_tiers: model.service_tiers?.length ? model.service_tiers : [{ service_tier: "standard", provider_model_slug, pricing, availability: model.availability }],
	})) };
}

async function readProviderCatalog(client: any, providerSlug: string, canEditDescription = false) {
	const [providerResult, sourceResult, modelsResult, capabilitiesResult, runResult, eventsResult, rateLimitsResult] = await Promise.all([
		client.from("v2_providers").select("provider_slug,name,status,routable,routing_enabled").eq("provider_slug", providerSlug).maybeSingle(),
		client.from("provider_catalog_sources").select("provider_slug,catalog_url,management_mode,managed_catalog,managed_updated_at,updated_at,last_success_at,last_error,last_polled_at,feed_models,catalog_overrides,overrides_updated_at,catalog_updated_at,refresh_requested,rate_limits_updated_at").eq("provider_slug", providerSlug).maybeSingle(),
		client.from("provider_catalog_models").select("model_slug,provider_model_slug,name,description,input_modalities,output_modalities,context_length,max_output_tokens,status,availability,available_from,deprecated_at,shutdown_at,metadata,updated_at").eq("provider_slug", providerSlug).eq("status", "active").order("model_slug", { ascending: true }),
		client.from("provider_catalog_model_capabilities").select("model_slug,capability_id,parameters,status").eq("provider_slug", providerSlug).eq("status", "active").order("capability_id", { ascending: true }),
		client.from("provider_catalog_sync_runs").select("id,status,review_status,model_count,created_at,completed_at").eq("provider_slug", providerSlug).neq("status", "not_modified").order("created_at", { ascending: false }).limit(1),
		client.from("provider_catalog_edit_events").select("id,model_slug,field,actor_id,actor_name,actor_kind,action,created_at").eq("provider_slug", providerSlug).order("created_at", { ascending: false }).limit(100),
		client.from("provider_rate_limits").select(RATE_LIMIT_SELECT).eq("provider_id", providerSlug),
	]);
	if (providerResult.error || sourceResult.error || modelsResult.error || capabilitiesResult.error || runResult.error || rateLimitsResult.error) throw new Error("provider_catalog_unavailable");
	if (!providerResult.data || !sourceResult.data) return null;

	const capabilitiesByModel = new Map<string, Array<{ id: string; parameters: string[] }>>();
	for (const row of capabilitiesResult.data ?? []) {
		const modelSlug = String(row.model_slug);
		capabilitiesByModel.set(modelSlug, [...(capabilitiesByModel.get(modelSlug) ?? []), {
			id: String(row.capability_id),
			parameters: Array.isArray(row.parameters) ? row.parameters.map(String) : [],
		}]);
	}
	const observedModels = (modelsResult.data ?? []).map((model: any) => catalogModelDocument(
			model,
			capabilitiesByModel.get(String(model.model_slug)) ?? [],
			model.metadata && typeof model.metadata === "object" ? model.metadata.pricing : [],
		));
	const observedDocument = catalogDocument(observedModels);
	const statesResult = runResult.data?.[0]?.id
		? await client.from("provider_catalog_sync_models").select("model_slug,canonical_model_slug,decision,decision_reason,route_projection_status,route_projection_error").eq("run_id", runResult.data[0].id)
		: { data: [], error: null };
	if (statesResult.error) throw new Error("provider_catalog_model_status_unavailable");
	if (eventsResult.error) throw new Error("provider_catalog_activity_unavailable");
	const feedModels = sourceResult.data.feed_models ?? normalizeProviderCatalog(observedDocument).allModels;
	const effectiveDocument = sourceResult.data.management_mode === "remote"
		? normalizedCatalogDocument(applyCatalogOverrides(feedModels, sourceResult.data.catalog_overrides ?? {})) : null;
	const routes = await client.from("v2_model_provider_routes").select("model_slug,provider_model_slug,status,routing_enabled,access_scope,phaseo_status,v2_route_capabilities(status,effective_from,effective_to)").eq("provider_slug", providerSlug);
	const modelStates = Object.fromEntries((statesResult.data ?? []).map((model: any) => [model.model_slug, model])) as Record<string, any>;
	for (const model of applyCatalogOverrides(feedModels, sourceResult.data.catalog_overrides ?? {})) {
		const slugs = new Set([model.providerModelSlug, ...(model.serviceTiers ?? []).map((tier) => tier.providerModelSlug)]);
		const current = modelStates[model.id] ?? {};
		const offers = (routes.data ?? []).filter((route: any) => slugs.has(route.provider_model_slug) && [model.id, current.canonical_model_slug].includes(route.model_slug));
		const now = Date.now();
		const live = providerResult.data.routable && providerResult.data.routing_enabled && offers.some((route: any) => route.access_scope === "public" && route.routing_enabled && ["active", "degraded"].includes(route.status) && route.v2_route_capabilities?.some((capability: any) => ["active", "degraded"].includes(capability.status) && (!capability.effective_from || Date.parse(capability.effective_from) <= now) && (!capability.effective_to || Date.parse(capability.effective_to) > now)));
		const blocked = offers.some((route: any) => route.phaseo_status === "blocked");
		modelStates[model.id] = { ...current, route_projection_status: routes.error ? "unknown" : live ? "enabled" : blocked ? "failed" : "not_projected", route_projection_error: !live && blocked ? "provider_route_blocked" : current.route_projection_error };
	}
	const managedCatalog = sourceResult.data.managed_catalog && typeof sourceResult.data.managed_catalog === "object" && !Array.isArray(sourceResult.data.managed_catalog)
		? sourceResult.data.managed_catalog
		: null;
	const parameterDefinitions = await client.from("v2_capability_parameters").select("capability_id,parameter_key").order("capability_id").order("parameter_key");
	const capabilityOptions: Record<string, string[]> = {};
	for (const row of parameterDefinitions.data ?? []) (capabilityOptions[row.capability_id] ??= []).push(row.parameter_key);
	return {
		permissions: { can_edit_description: canEditDescription, can_edit_model_metadata: canEditDescription },
		capability_options: capabilityOptions,
		provider: providerResult.data,
		source: {
			catalog_url: sourceResult.data.catalog_url,
			management_mode: sourceResult.data.management_mode ?? "remote",
			managed_updated_at: sourceResult.data.managed_updated_at,
			catalog_version: sourceResult.data.management_mode === "remote" ? sourceResult.data.catalog_updated_at ?? sourceResult.data.updated_at : sourceResult.data.managed_updated_at ?? sourceResult.data.updated_at,
			updated_at: sourceResult.data.updated_at,
			last_success_at: sourceResult.data.last_success_at,
			last_error: sourceResult.data.last_error,
			last_polled_at: sourceResult.data.last_polled_at,
			refresh_requested: Boolean(sourceResult.data.refresh_requested || (sourceResult.data.overrides_updated_at && (!sourceResult.data.last_success_at || Date.parse(sourceResult.data.overrides_updated_at) > Date.parse(sourceResult.data.last_success_at))) || (sourceResult.data.management_mode === "managed" && sourceResult.data.managed_updated_at && (!sourceResult.data.last_success_at || Date.parse(sourceResult.data.managed_updated_at) > Date.parse(sourceResult.data.last_success_at)))),
		},
		overrides: sourceResult.data.catalog_overrides ?? {},
		feed_models: feedModels,
		activity: eventsResult.data ?? [],
		model_states: modelStates,
		catalog: effectiveDocument ?? managedCatalog ?? observedDocument,
		models: (effectiveDocument ?? managedCatalog) && Array.isArray((effectiveDocument ?? managedCatalog as any).data) ? (effectiveDocument ?? managedCatalog as any).data.map((model: any) => {
			const standard = model.service_tiers?.find((tier: any) => tier.service_tier === "standard");
			return standard ? { ...model, provider_model_slug: standard.provider_model_slug, pricing: standard.pricing } : model;
		}) : observedModels,
		latest_run: runResult.data?.[0] ?? null,
		rate_limits: { version: sourceResult.data.rate_limits_updated_at ?? null, limits: rateLimitsFromRows(rateLimitsResult.data ?? []) },
	};
}

/** Whether a pending or rejected provider application still blocks this editor's catalog changes. */
function catalogEditsBlocked(client: any, providerSlug: string, access: CatalogAccess, userId: string): Promise<boolean> {
	if (access.isAdmin) return Promise.resolve(false);
	return isProviderCatalogBlockedByReview(client, providerSlug, { status: access.linkStatus, linkedBy: access.linkedBy ?? userId });
}

export const accountSettingsProviderCatalogRouter = new Hono<{ Bindings: Env }>();

accountSettingsProviderCatalogRouter.get("/provider-onboarding/catalog/:providerSlug/events/:eventId", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return errorResponse(c, "unauthorized", 401);
	const slug = providerSlugSchema.safeParse(c.req.param("providerSlug"));
	const id = z.string().uuid().safeParse(c.req.param("eventId"));
	if (!slug.success || !id.success) return errorResponse(c, "invalid_catalog_event", 400);
	const client = getDataClient(c.env);
	try {
		if (!await providerAccess(client, user.id, slug.data)) return errorResponse(c, "forbidden", 403);
		const result = await client.from("provider_catalog_edit_events").select("previous_value,value").eq("provider_slug", slug.data).eq("id", id.data).maybeSingle();
		if (result.error) throw result.error;
		if (!result.data) return errorResponse(c, "catalog_event_not_found", 404);
		return c.json({ ok: true, ...result.data }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch { return errorResponse(c, "provider_catalog_activity_unavailable", 503); }
});

accountSettingsProviderCatalogRouter.get("/provider-onboarding/catalog/:providerSlug/version", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return errorResponse(c, "unauthorized", 401);
	const parsedSlug = providerSlugSchema.safeParse(c.req.param("providerSlug"));
	if (!parsedSlug.success) return errorResponse(c, "invalid_provider_slug", 400);
	const client = getDataClient(c.env);
	try {
		if (!await providerAccess(client, user.id, parsedSlug.data)) return errorResponse(c, "forbidden", 403);
		const result = await client.from("provider_catalog_sources").select("management_mode,managed_updated_at,updated_at,catalog_updated_at").eq("provider_slug", parsedSlug.data).maybeSingle();
		if (result.error) throw result.error;
		if (!result.data) return errorResponse(c, "provider_catalog_source_not_found", 404);
		return c.json({ ok: true, catalog_version: result.data.management_mode === "remote" ? result.data.catalog_updated_at ?? result.data.updated_at : result.data.managed_updated_at ?? result.data.updated_at }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("provider_catalog_version_read_failed", { providerSlug: parsedSlug.data, error: error instanceof Error ? error.message : String(error) });
		return errorResponse(c, "provider_catalog_unavailable", 503);
	}
});

accountSettingsProviderCatalogRouter.get("/provider-onboarding/catalog/:providerSlug", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return errorResponse(c, "unauthorized", 401);
	const parsedSlug = providerSlugSchema.safeParse(c.req.param("providerSlug"));
	if (!parsedSlug.success) return errorResponse(c, "invalid_provider_slug", 400);
	const client = getDataClient(c.env);
	try {
		const access = await providerAccess(client, user.id, parsedSlug.data);
		if (!access) return errorResponse(c, "forbidden", 403);
		const catalog = await readProviderCatalog(client, parsedSlug.data, access.isAdmin);
		return catalog ? c.json({ ok: true, ...catalog }, 200, PRIVATE_NO_STORE_HEADERS) : errorResponse(c, "provider_catalog_not_found", 404);
	} catch (error) {
		console.error("provider_catalog_read_failed", { providerSlug: parsedSlug.data, error: error instanceof Error ? error.message : String(error) });
		return errorResponse(c, "provider_catalog_unavailable", 503);
	}
});

accountSettingsProviderCatalogRouter.put("/provider-onboarding/catalog/:providerSlug", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return errorResponse(c, "unauthorized", 401);
	const parsedSlug = providerSlugSchema.safeParse(c.req.param("providerSlug"));
	if (!parsedSlug.success) return errorResponse(c, "invalid_provider_slug", 400);
	const contentLength = Number(c.req.header("content-length") ?? 0);
	if (contentLength > MAX_MANAGED_CATALOG_BYTES) return errorResponse(c, "catalog_too_large", 413);
	let body: any;
	try {
		body = await readManagedCatalogBody(c.req.raw);
	} catch (error) {
		const reason = error instanceof Error ? error.message : "catalog_json_invalid";
		return reason === "catalog_too_large"
			? errorResponse(c, "catalog_too_large", 413)
			: errorResponse(c, "catalog_json_invalid", 400);
	}
	const client = getDataClient(c.env);
	try {
		const access = await providerAccess(client, user.id, parsedSlug.data);
		if (!access) return errorResponse(c, "forbidden", 403);
		if (await catalogEditsBlocked(client, parsedSlug.data, access, user.id)) return errorResponse(c, "provider_application_not_approved", 409);
		const source = await client.from("provider_catalog_sources").select("provider_slug,catalog_url,management_mode,managed_catalog,managed_updated_at,updated_at,feed_models,catalog_overrides").eq("provider_slug", parsedSlug.data).maybeSingle();
		if (source.error) throw source.error;
		if (!source.data) return errorResponse(c, "provider_catalog_source_not_found", 404);
		if (body?.expectedUpdatedAt !== undefined && !z.string().datetime({ offset: true }).safeParse(body.expectedUpdatedAt).success) return errorResponse(c, "invalid_catalog_version", 400);
		if (body?.mode === "remote" || body?.catalog?.mode === "remote") {
			if (!source.data.catalog_url) return errorResponse(c, "No remote catalog URL configured.", 422);
			const updated = await client.rpc("restore_provider_catalog_feed", { p_provider_slug: parsedSlug.data, p_actor_id: user.id, p_actor_kind: access.isAdmin ? "phaseo" : "provider", p_expected_version: body.expectedUpdatedAt ?? source.data.managed_updated_at ?? source.data.updated_at });
			if (updated.error?.message?.includes("version_conflict")) return errorResponse(c, "Catalog changed. Reload before saving again.", 409);
			if (updated.error) throw updated.error;
			let syncWarning: string | null = null;
			try {
				await syncProviderCatalog(c.env, parsedSlug.data, "manual");
			} catch (error) {
				syncWarning = "Catalog saved. Synchronization will retry in the background.";
				console.error("provider_catalog_sync_after_save_failed", { providerSlug: parsedSlug.data, error: error instanceof Error ? error.message : String(error) });
			}
			const catalog = await readProviderCatalog(client, parsedSlug.data, access.isAdmin);
			return catalog ? c.json({ ok: true, ...catalog, sync_warning: syncWarning }, 200, PRIVATE_NO_STORE_HEADERS) : errorResponse(c, "provider_catalog_not_found", 404);
		}
		if (body?.catalog?.refresh === true) {
			await syncProviderCatalog(c.env, parsedSlug.data, "manual");
			const refreshed = await readProviderCatalog(client, parsedSlug.data, access.isAdmin);
			return c.json({ ok: true, ...refreshed }, 200, PRIVATE_NO_STORE_HEADERS);
		}

		const revert = body?.catalog?.revert ?? body?.revert;
		if (!access.isAdmin && MODEL_METADATA_OVERRIDE_FIELDS.has(revert?.field)) return errorResponse(c, "forbidden", 403);
		let document = body?.catalog ?? body;
		// Limits have their own version and endpoint, so a catalog save cannot overwrite a concurrent limit edit.
		if (document && typeof document === "object" && Object.hasOwn(document, "rate_limits")) {
			return c.json({ ok: false, error: "catalog_invalid", message: "rate_limits: Save rate limits from the Rate limits section.", issues: [{ path: "rate_limits", message: "Save rate limits from the Rate limits section." }] }, 422, PRIVATE_NO_STORE_HEADERS);
		}
		let changes: Array<{ model_id: string; field: string; value?: unknown; revert?: boolean }> | null = null;
		if (source.data.management_mode === "remote") {
			const current = await readProviderCatalog(client, parsedSlug.data, access.isAdmin);
			if (!current) return errorResponse(c, "provider_catalog_not_found", 404);
			const feed = current.feed_models;
			const overrides = current.overrides as CatalogOverrides;
			if (revert) {
				if (typeof revert.modelId !== "string" || typeof revert.field !== "string" || !Object.hasOwn(overrides[revert.modelId] ?? {}, revert.field)) return errorResponse(c, "invalid_override_field", 400);
				const restored = structuredClone(overrides);
				if (restored[revert.modelId]) delete restored[revert.modelId][revert.field];
				document = normalizedCatalogDocument(applyCatalogOverrides(feed, restored));
				changes = [{ model_id: revert.modelId, field: revert.field, revert: true }];
			} else {
				const submitted = normalizeProviderCatalog(document);
				if (submitted.valid) changes = catalogOverrideChanges(feed, overrides, submitted.allModels);
			}
		}
		const preview = await validateProviderCatalogPricingMeters(client, normalizeProviderCatalog(document));
		if (!preview.valid) return c.json({ ok: false, error: "catalog_invalid", message: preview.issues.map((issue) => `${issue.path}: ${issue.message}`).slice(0, 5).join("; "), issues: preview.issues }, 422, PRIVATE_NO_STORE_HEADERS);
		if (!access.isAdmin) {
			const current = await readProviderCatalog(client, parsedSlug.data, access.isAdmin);
			if (!current) return errorResponse(c, "provider_catalog_not_found", 404);
			const existingModels = new Map<string, any>(current.models.map((model: any) => [model.id, model]));
			const submittedModels = normalizedCatalogDocument(preview.allModels).data;
			if (submittedModels.some((model: any) => {
				const existing = existingModels.get(model.id) ?? { name: model.id, description: null, input_modalities: ["text"], output_modalities: ["text"], context_length: null, max_output_tokens: null, available_from: null, deprecated_at: null, shutdown_at: null };
				return MODEL_METADATA_FIELDS.some((field) => JSON.stringify(model[field] ?? null) !== JSON.stringify(existing[field] ?? null));
			})) return errorResponse(c, "forbidden", 403);
		}
		if (changes) {
			const saved = await client.rpc("save_provider_catalog_overrides", { p_provider_slug: parsedSlug.data, p_actor_id: user.id, p_actor_kind: access.isAdmin ? "phaseo" : "provider", p_expected_version: body.expectedUpdatedAt ?? null, p_changes: changes, p_feed_models: source.data.feed_models ?? (await readProviderCatalog(client, parsedSlug.data, access.isAdmin))?.feed_models });
			if (saved.error?.message?.includes("version_conflict")) return errorResponse(c, "Catalog changed. Reload before saving again.", 409);
			if (saved.error) throw saved.error;
			let syncWarning: string | null = null;
			try { await syncProviderCatalog(c.env, parsedSlug.data, "manual"); }
			catch { syncWarning = "Catalog saved. Synchronization will retry in the background."; }
			const catalog = await readProviderCatalog(client, parsedSlug.data, access.isAdmin);
			return c.json({ ok: true, ...catalog, sync_warning: syncWarning }, 200, PRIVATE_NO_STORE_HEADERS);
		}
		const managedDocument = catalogDocument(preview.allModels.map((model) => catalogModelDocument({
			metadata: { serviceTiers: model.serviceTiers },
			model_slug: model.id,
			provider_model_slug: model.providerModelSlug,
			name: model.name,
			description: model.description,
			input_modalities: model.inputModalities,
			output_modalities: model.outputModalities,
			context_length: model.contextLength,
			max_output_tokens: model.maxOutputTokens,
			availability: model.availability,
			available_from: model.availableFrom,
			deprecated_at: model.deprecatedAt,
			shutdown_at: model.shutdownAt,
		}, model.capabilities, model.pricing)));
		const updated = await client.rpc("save_provider_managed_catalog", { p_provider_slug: parsedSlug.data, p_actor_id: user.id, p_actor_kind: access.isAdmin ? "phaseo" : "provider", p_expected_version: body.expectedUpdatedAt ?? source.data.managed_updated_at ?? source.data.updated_at, p_document: managedDocument });
		if (updated.error?.message?.includes("version_conflict")) return errorResponse(c, "Catalog changed. Reload before saving again.", 409);
		if (updated.error) throw updated.error;
		let syncWarning: string | null = null;
		try {
			await syncProviderCatalog(c.env, parsedSlug.data, "manual");
		} catch (error) {
			syncWarning = error instanceof Error ? error.message : "Catalog saved. Synchronization will retry in the background.";
			console.error("provider_catalog_sync_after_save_failed", { providerSlug: parsedSlug.data, error: error instanceof Error ? error.message : String(error) });
		}
		const catalog = await readProviderCatalog(client, parsedSlug.data, access.isAdmin);
		return catalog ? c.json({ ok: true, ...catalog, sync_warning: syncWarning }, 200, PRIVATE_NO_STORE_HEADERS) : errorResponse(c, "provider_catalog_not_found", 404);
	} catch (error) {
		console.error("provider_catalog_write_failed", { providerSlug: parsedSlug.data, error: error instanceof Error ? error.message : String(error) });
		return errorResponse(c, "provider_catalog_update_failed", 503);
	}
});

// Providers publish their own limits without review: reaching one only ranks the provider lower
// in routing. Approval of the provider application still gates every catalog change.
accountSettingsProviderCatalogRouter.put("/provider-onboarding/catalog/:providerSlug/rate-limits", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return errorResponse(c, "unauthorized", 401);
	const parsedSlug = providerSlugSchema.safeParse(c.req.param("providerSlug"));
	if (!parsedSlug.success) return errorResponse(c, "invalid_provider_slug", 400);
	if (Number(c.req.header("content-length") ?? 0) > MAX_RATE_LIMITS_BYTES) return errorResponse(c, "rate_limits_too_large", 413);
	let raw: string;
	try { raw = await readLimitedText(c.req.raw, MAX_RATE_LIMITS_BYTES); }
	catch { return errorResponse(c, "rate_limits_too_large", 413); }
	let json: unknown;
	try { json = JSON.parse(raw); }
	catch { return errorResponse(c, "rate_limits_json_invalid", 400); }
	const body = rateLimitsBodySchema.safeParse(json);
	if (!body.success) return errorResponse(c, "invalid_rate_limits", 400);
	const client = getDataClient(c.env);
	try {
		const access = await providerAccess(client, user.id, parsedSlug.data);
		if (!access) return errorResponse(c, "forbidden", 403);
		if (await catalogEditsBlocked(client, parsedSlug.data, access, user.id)) return errorResponse(c, "provider_application_not_approved", 409);
		const current = await readProviderCatalog(client, parsedSlug.data, access.isAdmin);
		if (!current) return errorResponse(c, "provider_catalog_not_found", 404);
		// Limits may name any upstream model in the current catalog. Already-declared models stay
		// accepted so a limit for a model since removed from the catalog never blocks other edits.
		const known = new Set<string>();
		for (const model of current.models) {
			if (model?.provider_model_slug) known.add(String(model.provider_model_slug));
			for (const tier of model?.service_tiers ?? []) if (tier?.provider_model_slug) known.add(String(tier.provider_model_slug));
		}
		for (const limit of current.rate_limits.limits) if (limit.model) known.add(limit.model);
		const declared = normalizeProviderRateLimits(body.data.rate_limits, known);
		if (declared.issues.length) return c.json({ ok: false, error: "rate_limits_invalid", message: declared.issues.map((issue) => `${issue.path}: ${issue.message}`).slice(0, 5).join("; "), issues: declared.issues }, 422, PRIVATE_NO_STORE_HEADERS);
		const saved = await client.rpc("save_provider_rate_limits", {
			p_provider_slug: parsedSlug.data, p_actor_id: user.id, p_actor_kind: access.isAdmin ? "phaseo" : "provider",
			p_expected_version: body.data.expectedVersion, p_limits: declared.limits, p_check_version: true,
		});
		if (saved.error?.message?.includes("version_conflict")) return errorResponse(c, "Rate limits changed. Reload before saving again.", 409);
		if (saved.error) throw saved.error;
		const limits = await client.from("provider_rate_limits").select(RATE_LIMIT_SELECT).eq("provider_id", parsedSlug.data);
		if (limits.error) throw limits.error;
		return c.json({ ok: true, rate_limits: { version: saved.data ?? null, limits: rateLimitsFromRows(limits.data ?? []) } }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		console.error("provider_rate_limits_write_failed", { providerSlug: parsedSlug.data, error: error instanceof Error ? error.message : String(error) });
		return errorResponse(c, "provider_rate_limits_update_failed", 503);
	}
});
