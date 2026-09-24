import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import {
	normalizeProviderCatalog,
	validateProviderCatalogPricingMeters,
	type ProviderCatalogPreview,
} from "./provider-catalog";
import { syncProviderCatalog } from "./provider-catalog-sync";
import { isProviderAccessBlockedByReview } from "./provider-review-access";

const providerSlugSchema = z.string().trim().toLowerCase().min(2).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/);
const MAX_MANAGED_CATALOG_BYTES = 5 * 1024 * 1024;
const EMPTY_WORKSPACE_ID = "00000000-0000-0000-0000-000000000000";

type CatalogAccess = { isAdmin: boolean; workspaceId: string | null; linkStatus: string | null };

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
	if (String(role.data?.role ?? "").toLowerCase() === "admin") return { isAdmin: true, workspaceId: null, linkStatus: null };
	const ids = await workspaceIds(client, userId);
	const link = await client.from("provider_account_links")
		.select("workspace_id,role,status")
		.eq("provider_slug", providerSlug)
		.in("workspace_id", ids.length ? ids : [EMPTY_WORKSPACE_ID])
		.in("status", ["pending", "active"])
		.in("role", ["owner", "admin", "editor"])
		.order("status", { ascending: true })
		.limit(1)
		.maybeSingle();
	if (link.error) throw new Error("provider_link_unavailable");
	return link.data ? { isAdmin: false, workspaceId: String(link.data.workspace_id), linkStatus: String(link.data.status) } : null;
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
	};
}

async function readProviderCatalog(client: any, providerSlug: string) {
	const [providerResult, sourceResult, modelsResult, capabilitiesResult, runResult] = await Promise.all([
		client.from("v2_providers").select("provider_slug,name,status").eq("provider_slug", providerSlug).maybeSingle(),
		client.from("provider_catalog_sources").select("provider_slug,catalog_url,management_mode,managed_catalog,managed_updated_at,updated_at,last_success_at,last_error,last_polled_at").eq("provider_slug", providerSlug).maybeSingle(),
		client.from("provider_catalog_models").select("model_slug,provider_model_slug,name,description,input_modalities,output_modalities,context_length,max_output_tokens,status,availability,available_from,deprecated_at,shutdown_at,metadata,updated_at").eq("provider_slug", providerSlug).eq("status", "active").order("model_slug", { ascending: true }),
		client.from("provider_catalog_model_capabilities").select("model_slug,capability_id,parameters,status").eq("provider_slug", providerSlug).eq("status", "active").order("capability_id", { ascending: true }),
		client.from("provider_catalog_sync_runs").select("id,status,review_status,model_count,created_at,completed_at").eq("provider_slug", providerSlug).order("created_at", { ascending: false }).limit(1),
	]);
	if (providerResult.error || sourceResult.error || modelsResult.error || capabilitiesResult.error || runResult.error) throw new Error("provider_catalog_unavailable");
	if (!providerResult.data || !sourceResult.data) return null;

	const capabilitiesByModel = new Map<string, Array<{ id: string; parameters: string[] }>>();
	for (const row of capabilitiesResult.data ?? []) {
		const modelSlug = String(row.model_slug);
		capabilitiesByModel.set(modelSlug, [...(capabilitiesByModel.get(modelSlug) ?? []), {
			id: String(row.capability_id),
			parameters: Array.isArray(row.parameters) ? row.parameters.map(String) : [],
		}]);
	}
	const observedDocument = {
		data: (modelsResult.data ?? []).map((model: any) => catalogModelDocument(
			model,
			capabilitiesByModel.get(String(model.model_slug)) ?? [],
			model.metadata && typeof model.metadata === "object" ? model.metadata.pricing : [],
		)),
	};
	const managedCatalog = sourceResult.data.managed_catalog && typeof sourceResult.data.managed_catalog === "object" && !Array.isArray(sourceResult.data.managed_catalog)
		? sourceResult.data.managed_catalog
		: null;
	return {
		provider: providerResult.data,
		source: {
			catalog_url: sourceResult.data.catalog_url,
			management_mode: sourceResult.data.management_mode ?? "remote",
			managed_updated_at: sourceResult.data.managed_updated_at,
			catalog_version: sourceResult.data.managed_updated_at ?? sourceResult.data.updated_at,
			updated_at: sourceResult.data.updated_at,
			last_success_at: sourceResult.data.last_success_at,
			last_error: sourceResult.data.last_error,
			last_polled_at: sourceResult.data.last_polled_at,
		},
		catalog: managedCatalog ?? observedDocument,
		models: managedCatalog && Array.isArray((managedCatalog as any).data) ? (managedCatalog as any).data : observedDocument.data,
		latest_run: runResult.data?.[0] ?? null,
	};
}

export const accountSettingsProviderCatalogRouter = new Hono<{ Bindings: Env }>();

accountSettingsProviderCatalogRouter.get("/provider-onboarding/catalog/:providerSlug/version", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return errorResponse(c, "unauthorized", 401);
	const parsedSlug = providerSlugSchema.safeParse(c.req.param("providerSlug"));
	if (!parsedSlug.success) return errorResponse(c, "invalid_provider_slug", 400);
	const client = getDataClient(c.env);
	try {
		if (!await providerAccess(client, user.id, parsedSlug.data)) return errorResponse(c, "forbidden", 403);
		const result = await client.from("provider_catalog_sources").select("managed_updated_at,updated_at").eq("provider_slug", parsedSlug.data).maybeSingle();
		if (result.error) throw result.error;
		if (!result.data) return errorResponse(c, "provider_catalog_source_not_found", 404);
		return c.json({ ok: true, catalog_version: result.data.managed_updated_at ?? result.data.updated_at }, 200, PRIVATE_NO_STORE_HEADERS);
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
		if (!await providerAccess(client, user.id, parsedSlug.data)) return errorResponse(c, "forbidden", 403);
		const catalog = await readProviderCatalog(client, parsedSlug.data);
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
		if (!access.isAdmin) {
			const [provider, application] = await Promise.all([
				client.from("v2_providers").select("metadata").eq("provider_slug", parsedSlug.data).maybeSingle(),
				client.from("provider_onboarding_submissions").select("application_type,provider_review_status").eq("provider_slug", parsedSlug.data).order("created_at", { ascending: false }).limit(1),
			]);
			if (provider.error) throw provider.error;
			if (application.error) throw application.error;
			if (isProviderAccessBlockedByReview({
				application: application.data?.[0],
				fallbackReviewStatus: provider.data?.metadata?.self_serve?.provider_review_status,
				linkStatus: access.linkStatus,
			})) {
				return errorResponse(c, "provider_application_not_approved", 409);
			}
		}
		const source = await client.from("provider_catalog_sources").select("provider_slug,catalog_url,management_mode,managed_catalog,managed_updated_at").eq("provider_slug", parsedSlug.data).maybeSingle();
		if (source.error) throw source.error;
		if (!source.data) return errorResponse(c, "provider_catalog_source_not_found", 404);
		if (body?.expectedUpdatedAt !== undefined && !z.string().datetime({ offset: true }).safeParse(body.expectedUpdatedAt).success) return errorResponse(c, "invalid_catalog_version", 400);
		const updateSource = async (values: Record<string, unknown>) => {
			let query = client.from("provider_catalog_sources").update(values).eq("provider_slug", parsedSlug.data);
			if (body?.expectedUpdatedAt) query = query.eq(source.data.managed_updated_at ? "managed_updated_at" : "updated_at", body.expectedUpdatedAt);
			return query.select("provider_slug").maybeSingle();
		};
		if (body?.mode === "remote" || body?.catalog?.mode === "remote") {
			if (!source.data.catalog_url) return errorResponse(c, "No remote catalog URL configured.", 422);
			const updated = await updateSource({ management_mode: "remote", managed_catalog: null, managed_updated_by: null, managed_updated_at: null, refresh_requested: true, next_poll_at: new Date().toISOString(), updated_at: new Date().toISOString() });
			if (updated.error) throw updated.error;
			if (!updated.data) return errorResponse(c, "Catalog changed. Reload before saving again.", 409);
			let syncWarning: string | null = null;
			try {
				await syncProviderCatalog(c.env, parsedSlug.data, "manual");
			} catch (error) {
				syncWarning = "Catalog saved. Synchronization will retry in the background.";
				console.error("provider_catalog_sync_after_save_failed", { providerSlug: parsedSlug.data, error: error instanceof Error ? error.message : String(error) });
			}
			const catalog = await readProviderCatalog(client, parsedSlug.data);
			return catalog ? c.json({ ok: true, ...catalog, sync_warning: syncWarning }, 200, PRIVATE_NO_STORE_HEADERS) : errorResponse(c, "provider_catalog_not_found", 404);
		}

		const document = body?.catalog ?? body;
		const preview = await validateProviderCatalogPricingMeters(client, normalizeProviderCatalog(document));
		if (!preview.valid) return c.json({ ok: false, error: "catalog_invalid", issues: preview.issues }, 422, PRIVATE_NO_STORE_HEADERS);
		const managedDocument = { data: preview.allModels.map((model) => catalogModelDocument({
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
		}, model.capabilities, model.pricing)) };
		const updated = await updateSource({ management_mode: "managed", managed_catalog: managedDocument, managed_updated_by: user.id, managed_updated_at: new Date().toISOString(), refresh_requested: true, next_poll_at: new Date().toISOString(), etag: null, last_modified: null, last_error: null, updated_at: new Date().toISOString() });
		if (updated.error) throw updated.error;
		if (!updated.data) return errorResponse(c, "Catalog changed. Reload before saving again.", 409);
		let syncWarning: string | null = null;
		try {
			await syncProviderCatalog(c.env, parsedSlug.data, "manual");
		} catch (error) {
			syncWarning = "Catalog saved. Synchronization will retry in the background.";
			console.error("provider_catalog_sync_after_save_failed", { providerSlug: parsedSlug.data, error: error instanceof Error ? error.message : String(error) });
		}
		const catalog = await readProviderCatalog(client, parsedSlug.data);
		return catalog ? c.json({ ok: true, ...catalog, sync_warning: syncWarning }, 200, PRIVATE_NO_STORE_HEADERS) : errorResponse(c, "provider_catalog_not_found", 404);
	} catch (error) {
		console.error("provider_catalog_write_failed", { providerSlug: parsedSlug.data, error: error instanceof Error ? error.message : String(error) });
		return errorResponse(c, "provider_catalog_update_failed", 503);
	}
});
