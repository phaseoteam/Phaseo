import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "@/auth/requireUser";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
import { requireAccountWorkspace } from "./context";
import {
	fetchAndValidateProviderCatalog,
	sameOrSubdomain,
	validateCatalogUrl,
	validateProviderCatalogPricingMeters,
	type ProviderCatalogPreview,
} from "./provider-catalog";
import {
	encryptProviderCatalogWebhookSecret,
	generateProviderCatalogWebhookSecret,
	syncProviderCatalog,
} from "./provider-catalog-sync";

const providerSlugSchema = z.string().trim().toLowerCase().min(2).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/);
const MAX_PROVIDER_SOURCES_PER_USER = 5;
const MAX_PROVIDER_SUBMISSIONS_PER_USER_PER_DAY = 5;
const httpsUrlSchema = z.string().trim().url().refine((value) => new URL(value).protocol === "https:");
const profileSchema = z.object({
	workspaceId: z.string().uuid(),
	providerSlug: providerSlugSchema,
	providerName: z.string().trim().min(2).max(120),
	websiteUrl: httpsUrlSchema,
	logoUrl: httpsUrlSchema.optional().or(z.literal("")),
	catalogUrl: httpsUrlSchema,
	claimChallengeId: z.string().uuid().optional(),
});

export function providerWorkspaceAccess(workspaceKind: string, role: string) {
	return {
		eligible: ["organization", "enterprise", "provider"].includes(workspaceKind),
		canManage: role === "owner" || role === "admin",
	};
}

async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function claimUrl(domain: string): string { return `https://${domain}/.well-known/phaseo-provider-claim.txt`; }

async function verifyClaimFile(domain: string, expectedHash: string): Promise<boolean> {
	const response = await fetch(claimUrl(domain), { method: "GET", redirect: "error", signal: AbortSignal.timeout(10_000) });
	if (!response.ok) return false;
	const length = Number(response.headers.get("content-length") ?? 0);
	if (length > 4_096) return false;
	if (!response.body) return false;
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > 4_096) { await reader.cancel(); return false; } chunks.push(value); }
	const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
	const value = new TextDecoder().decode(bytes).trim();
	return value.length <= 4_096 && await sha256(value) === expectedHash;
}

function responseError(c: any, message: string, status = 400) {
	return c.json({ ok: false, error: "invalid_request", message }, status, PRIVATE_NO_STORE_HEADERS);
}

function hostFromUrl(value: string): string {
	return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
}

function providerCatalogWebhookUrl(env: Env, providerSlug: string): string {
	const origin = env.NEXT_PUBLIC_API_URL?.trim() || "https://phaseo.app";
	const url = new URL(origin);
	url.pathname = `/api/internal/provider-catalog/${providerSlug}`;
	url.search = "";
	return url.toString();
}

function publicPreview(preview: ProviderCatalogPreview) {
	return {
		valid: preview.valid,
		modelCount: preview.modelCount,
		truncated: preview.truncated,
		issues: preview.issues,
		models: preview.models,
	};
}

async function enforceOnboardingRateLimit(c: any, userId: string) {
	const limiter = c.env.PROVIDER_ONBOARDING_RATE_LIMITER;
	if (!limiter) {
		return c.env.ENV === "production"
			? c.json({ error: "provider_onboarding_rate_limit_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS)
			: null;
	}
	try {
		if (!(await limiter.limit({ key: userId })).success) {
			return c.json({ error: "rate_limited", message: "Too many provider catalog requests. Try again shortly." }, 429, {
				...PRIVATE_NO_STORE_HEADERS,
				"retry-after": "60",
			});
		}
		return null;
	} catch (error) {
		console.error("provider_onboarding_rate_limit_failed", { userId, error: error instanceof Error ? error.message : String(error) });
		return c.env.ENV === "production"
			? c.json({ error: "provider_onboarding_rate_limit_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS)
			: null;
	}
}

async function reserveProviderSubmissionSlot(client: any, userId: string): Promise<boolean> {
	const result = await client.rpc("reserve_provider_onboarding_submission_slot", { p_user_id: userId });
	if (result.error) throw new Error("provider_submission_quota_unavailable");
	return result.data === true;
}

async function manageableWorkspaceIds(client: any, userId: string): Promise<string[]> {
	const [memberships, owned] = await Promise.all([
		client.from("workspace_members").select("workspace_id,role").eq("user_id", userId).in("role", ["owner", "admin"]),
		client.from("workspaces").select("id").eq("owner_user_id", userId),
	]);
	if (memberships.error || owned.error) throw new Error("workspace_membership_unavailable");
	return [...new Set([...(memberships.data ?? []).map((row: any) => String(row.workspace_id)), ...(owned.data ?? []).map((row: any) => String(row.id))])];
}

export const accountSettingsProviderOnboardingRouter = new Hono<{ Bindings: Env }>();

accountSettingsProviderOnboardingRouter.post("/provider-onboarding/claims/start", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const parsed = z.object({ providerSlug: providerSlugSchema, websiteUrl: httpsUrlSchema }).safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return responseError(c, "Enter the existing provider slug and website URL.");
	const client = getDataClient(c.env);
	const provider = await client.from("v2_providers").select("provider_slug,metadata").eq("provider_slug", parsed.data.providerSlug).maybeSingle();
	if (provider.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!provider.data) return c.json({ error: "provider_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const metadata = provider.data.metadata && typeof provider.data.metadata === "object" && !Array.isArray(provider.data.metadata) ? provider.data.metadata as Record<string, unknown> : {};
	const existingWebsite = typeof metadata.website_url === "string" ? metadata.website_url : typeof metadata.link === "string" ? metadata.link : null;
	if (!existingWebsite) return responseError(c, "This provider has no verified domain and requires manual ownership review.", 409);
	const domain = hostFromUrl(existingWebsite);
	if (!sameOrSubdomain(hostFromUrl(parsed.data.websiteUrl), domain)) return responseError(c, "The website does not match the provider's verified domain.", 409);
	const token = `phaseo_claim_${crypto.randomUUID().replaceAll("-", "")}`;
	const challenge = await client.from("provider_claim_challenges").insert({ provider_slug: parsed.data.providerSlug, requested_by: user.id, domain, token_hash: await sha256(token) }).select("id,expires_at").single();
	if (challenge.error) return c.json({ error: "claim_challenge_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true, challengeId: challenge.data.id, token, verificationUrl: claimUrl(domain), expiresAt: challenge.data.expires_at }, 201, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsProviderOnboardingRouter.get("/provider-onboarding", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const client = getDataClient(c.env);
	const workspaceId = String(c.req.query("workspaceId") ?? "").trim();
	const context = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId });
	if (!context) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [workspace, submissions, links, events, role] = await Promise.all([
		client.from("workspaces").select("id,name,slug,workspace_kind").eq("id", workspaceId).maybeSingle(),
		client.from("provider_onboarding_submissions")
			.select("id,provider_slug,provider_name,catalog_url,status,model_count,validation_summary,submitted_at,created_at")
			.eq("workspace_id", workspaceId)
			.order("created_at", { ascending: false })
			.limit(20),
		client.from("provider_account_links")
			.select("provider_slug,workspace_id,role,status,verified_at")
			.eq("workspace_id", workspaceId)
			.in("status", ["pending", "active"])
			.order("created_at", { ascending: false }),
		client.from("provider_catalog_events").select("id,provider_slug,run_id,event_type,title,message,payload,read_at,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50),
		client.from("users").select("role").eq("user_id", user.id).maybeSingle(),
	]);
	if (workspace.error || submissions.error || links.error || events.error || role.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!workspace.data) return c.json({ error: "workspace_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const workspaceKind = String(workspace.data.workspace_kind ?? "personal");
	const providerAccess = providerWorkspaceAccess(workspaceKind, context.role);
	const linkedSlugs = (links.data ?? []).map((link) => String(link.provider_slug));
	const sources = linkedSlugs.length
		? await client.from("provider_catalog_sources").select("provider_slug,status,delivery_mode,catalog_url,last_success_at,last_polled_at,last_catalog_sha256,consecutive_failures,last_error,etag,last_modified,next_poll_at").in("provider_slug", linkedSlugs)
		: { data: [], error: null };
	if (sources.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const reviewRuns = linkedSlugs.length
		? await client.from("provider_catalog_sync_runs").select("id,provider_slug,trigger,status,review_status,review_summary,model_count,error_message,created_at,completed_at").in("provider_slug", linkedSlugs).order("created_at", { ascending: false }).limit(20)
		: { data: [], error: null };
	if (reviewRuns.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const reviewRunIds = (reviewRuns.data ?? []).map((run) => String(run.id));
	const reviewModels = reviewRunIds.length
		? await client.from("provider_catalog_sync_models").select("run_id,model_slug,canonical_model_slug,match_type,provider_model_slug,name,availability,available_from,deprecated_at,shutdown_at,decision,decision_reason,route_projection_status,route_projection_error,reviewed_at").in("run_id", reviewRunIds).order("model_slug", { ascending: true })
		: { data: [], error: null };
	if (reviewModels.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const modelsByRun = new Map<string, any[]>();
	for (const model of reviewModels.data ?? []) modelsByRun.set(String(model.run_id), [...(modelsByRun.get(String(model.run_id)) ?? []), model]);
	return c.json({
		signedIn: true,
		isAdmin: String(role.data?.role ?? "").toLowerCase() === "admin",
		workspace: { id: workspaceId, name: workspace.data.name, slug: workspace.data.slug, kind: workspaceKind, role: context.role },
		canManageProvider: providerAccess.canManage,
		providerEligible: providerAccess.eligible,
		linkedProviders: links.data ?? [],
		submissions: submissions.data ?? [],
		syncSources: (sources.data ?? []).map((source) => ({ ...source, webhookUrl: providerCatalogWebhookUrl(c.env, String(source.provider_slug)) })),
		reviewRevisions: (reviewRuns.data ?? []).map((run) => ({ ...run, models: modelsByRun.get(String(run.id)) ?? [] })),
		events: events.data ?? [],
		contracts: { schemaUrl: "/api/internal/provider-catalog/schema", openApiUrl: "/api/internal/provider-catalog/openapi" },
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsProviderOnboardingRouter.post("/provider-onboarding/preview", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const rateLimitResponse = await enforceOnboardingRateLimit(c, user.id);
	if (rateLimitResponse) return rateLimitResponse;
	const body = await c.req.json<{ catalogUrl?: unknown }>().catch((): { catalogUrl?: unknown } => ({}));
	const url = validateCatalogUrl(body.catalogUrl);
	if (url.ok === false) return responseError(c, url.message);
	try {
		const result = await fetchAndValidateProviderCatalog(url.url);
		const preview = await validateProviderCatalogPricingMeters(getDataClient(c.env), result.preview);
		return c.json({ ok: true, catalogUrl: url.url, sha256: result.sha256, preview: publicPreview(preview) }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch (error) {
		return responseError(c, error instanceof Error ? error.message : "Could not read the provider catalog.", 422);
	}
});

accountSettingsProviderOnboardingRouter.post("/provider-onboarding/submit", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const rateLimitResponse = await enforceOnboardingRateLimit(c, user.id);
	if (rateLimitResponse) return rateLimitResponse;
	const rawBody = await c.req.json().catch(() => null);
	const parsed = profileSchema.safeParse(rawBody);
	if (!parsed.success) return responseError(c, parsed.error.issues[0]?.message ?? "Complete all provider fields.");
	const input = parsed.data;
	const workspaceContext = await requireAccountWorkspace({ request: c.req.raw, env: c.env, workspaceId: input.workspaceId });
	if (!workspaceContext || !providerWorkspaceAccess("organization", workspaceContext.role).canManage) return c.json({ error: "provider_workspace_admin_required" }, 403, PRIVATE_NO_STORE_HEADERS);
	const workspace = await workspaceContext.client.from("workspaces").select("workspace_kind").eq("id", input.workspaceId).maybeSingle();
	if (workspace.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!workspace.data || !providerWorkspaceAccess(String(workspace.data.workspace_kind), workspaceContext.role).eligible) return responseError(c, "Provider capabilities can only be enabled for an organisation workspace.", 409);
	const websiteHost = hostFromUrl(input.websiteUrl);
	const catalogHost = hostFromUrl(input.catalogUrl);
	if (!sameOrSubdomain(catalogHost, websiteHost)) {
		return responseError(c, "The catalog URL must be hosted on the provider website domain or a subdomain.");
	}
	const client = getDataClient(c.env);
	const existingSourcePreflight = await client.from("provider_catalog_sources")
		.select("provider_slug,status")
		.eq("provider_slug", input.providerSlug)
		.maybeSingle();
	if (existingSourcePreflight.error) return c.json({ error: "provider_sync_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!existingSourcePreflight.data) {
		const ownedSourceCount = await client.from("provider_catalog_sources")
			.select("provider_slug", { count: "exact", head: true })
			.eq("created_by", user.id);
		if (ownedSourceCount.error) return c.json({ error: "provider_sync_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		if ((ownedSourceCount.count ?? 0) >= MAX_PROVIDER_SOURCES_PER_USER) {
			return responseError(c, `A user can manage at most ${MAX_PROVIDER_SOURCES_PER_USER} provider catalog sources.`, 409);
		}
	}

	let catalog: Awaited<ReturnType<typeof fetchAndValidateProviderCatalog>>;
	try {
		catalog = await fetchAndValidateProviderCatalog(input.catalogUrl);
		catalog = { ...catalog, preview: await validateProviderCatalogPricingMeters(client, catalog.preview) };
	} catch (error) {
		return responseError(c, error instanceof Error ? error.message : "Could not read the provider catalog.", 422);
	}
	if (!catalog.preview.valid) {
		return c.json({ ok: false, error: "catalog_invalid", message: "Fix the catalog validation issues before submitting.", preview: publicPreview(catalog.preview) }, 422, PRIVATE_NO_STORE_HEADERS);
	}

	const existing = await client.from("v2_providers")
		.select("provider_slug,name,metadata,status,routing_enabled,routable")
		.eq("provider_slug", input.providerSlug)
		.maybeSingle();
	if (existing.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const existingMetadata = existing.data?.metadata && typeof existing.data.metadata === "object" && !Array.isArray(existing.data.metadata)
		? existing.data.metadata as Record<string, unknown>
		: {};
	const link = await client.from("provider_account_links")
		.select("workspace_id,role,status")
		.eq("provider_slug", input.providerSlug)
		.in("status", ["pending", "active"])
		.maybeSingle();
	if (link.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const userManageableWorkspaceIds = await manageableWorkspaceIds(client, user.id).catch(() => []);
	if (link.data && String(link.data.workspace_id) !== input.workspaceId) {
		return responseError(c, "This provider profile is already controlled by another provider workspace. Contact Phaseo to resolve the ownership conflict.", 409);
	}
	if (!userManageableWorkspaceIds.includes(input.workspaceId)) return c.json({ error: "provider_workspace_admin_required" }, 403, PRIVATE_NO_STORE_HEADERS);
	if (existing.data && !link.data) {
		const existingWebsite = typeof existingMetadata.website_url === "string" ? existingMetadata.website_url : typeof existingMetadata.link === "string" ? existingMetadata.link : null;
		if (!existingWebsite) return responseError(c, "This existing provider has no verified ownership domain and must be claimed through manual verification.", 409);
		try {
			if (!sameOrSubdomain(websiteHost, hostFromUrl(existingWebsite))) return responseError(c, "That provider slug belongs to a different verified domain.", 409);
		} catch { return responseError(c, "That provider profile needs manual verification before it can be claimed.", 409); }
		if (!input.claimChallengeId) return responseError(c, "Start the ownership proof and publish its verification token before claiming this provider.", 409);
		const challenge = await client.from("provider_claim_challenges").select("id,domain,token_hash,status,expires_at").eq("id", input.claimChallengeId).eq("provider_slug", input.providerSlug).eq("requested_by", user.id).eq("status", "pending").gt("expires_at", new Date().toISOString()).maybeSingle();
		if (challenge.error) return c.json({ error: "claim_verification_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		if (!challenge.data || challenge.data.domain !== hostFromUrl(existingWebsite) || !await verifyClaimFile(challenge.data.domain, challenge.data.token_hash)) return responseError(c, "The provider ownership token could not be verified.", 409);
		const verified = await client.from("provider_claim_challenges").update({ status: "verified", verified_at: new Date().toISOString() }).eq("id", challenge.data.id).eq("status", "pending").select("id").maybeSingle();
		if (verified.error) return c.json({ error: "claim_verification_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		if (!verified.data) return responseError(c, "This ownership proof has already been used.", 409);
	}
	try {
		if (!await reserveProviderSubmissionSlot(client, user.id)) {
			return c.json({ ok: false, error: "rate_limited", message: "Provider onboarding submissions are limited to five per user per day." }, 429, PRIVATE_NO_STORE_HEADERS);
		}
	} catch {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}

	const providerMetadata = {
		...existingMetadata,
		website_url: input.websiteUrl,
		logo_url: input.logoUrl || null,
		catalog_url: input.catalogUrl,
		self_serve: {
			status: "submitted",
			catalog_sha256: catalog.sha256,
			last_submitted_by: user.id,
			last_submitted_at: new Date().toISOString(),
		},
	};
	const provider = await client.from("v2_providers").upsert({
		provider_slug: input.providerSlug,
		name: input.providerName,
		status: existing.data?.status ?? "not_ready",
		routing_enabled: existing.data?.routing_enabled ?? false,
		routable: existing.data?.routable ?? false,
		metadata: providerMetadata,
	}, { onConflict: "provider_slug" }).select("provider_slug,name,status,routable,routing_enabled").single();
	if (provider.error) return c.json({ error: "provider_profile_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);

	const existingSource = existingSourcePreflight.data
		? await client.from("provider_catalog_sources")
			.select("provider_slug,status,delivery_mode,catalog_url")
			.eq("provider_slug", input.providerSlug)
			.maybeSingle()
		: { data: null, error: null };
	if (existingSource.error) return c.json({ error: "provider_sync_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	let webhookSecret: string | null = null;
	if (!existingSource.data) {
		webhookSecret = generateProviderCatalogWebhookSecret();
		const encrypted = await encryptProviderCatalogWebhookSecret(c.env, webhookSecret);
		const source = await client.from("provider_catalog_sources").insert({
			provider_slug: input.providerSlug,
			catalog_url: input.catalogUrl,
			status: "active",
			delivery_mode: "webhook_and_polling",
			created_by: user.id,
			...encrypted,
		});
		if (source.error) return c.json({ error: "provider_sync_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	} else {
		const source = await client.from("provider_catalog_sources").update({ catalog_url: input.catalogUrl, etag: null, last_modified: null, next_poll_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("provider_slug", input.providerSlug);
		if (source.error) return c.json({ error: "provider_sync_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}

	const submission = await client.from("provider_onboarding_submissions").insert({
		provider_slug: input.providerSlug,
		workspace_id: input.workspaceId,
		submitted_by: user.id,
		provider_name: input.providerName,
		website_url: input.websiteUrl,
		logo_url: input.logoUrl || null,
		catalog_url: input.catalogUrl,
		status: "submitted",
		model_count: catalog.preview.modelCount,
		catalog_sha256: catalog.sha256,
		catalog_preview: { models: catalog.preview.models, truncated: catalog.preview.truncated },
		validation_summary: { valid: true, issues: [], checked_at: new Date().toISOString() },
	}).select("id,provider_slug,provider_name,status,model_count,submitted_at").single();
	if (submission.error) return c.json({ error: "submission_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);

	const providerWorkspaceId = input.workspaceId;
	if (!link.data) {
		const accountLink = await client.from("provider_account_links").insert({
			provider_slug: input.providerSlug,
			workspace_id: providerWorkspaceId,
			linked_by: user.id,
			role: "owner",
			status: "active",
			proof_method: "catalog_domain_match",
			proof_subject: catalogHost,
			verified_at: new Date().toISOString(),
		}).select("provider_slug,workspace_id,role,status,verified_at").single();
		if (accountLink.error) return c.json({ error: "provider_link_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	} else if (link.data.status === "pending") {
		const accountLink = await client.from("provider_account_links").update({ status: "active", proof_method: "catalog_domain_match", proof_subject: catalogHost, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("provider_slug", input.providerSlug).eq("workspace_id", providerWorkspaceId);
		if (accountLink.error) return c.json({ error: "provider_link_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	c.executionCtx.waitUntil(syncProviderCatalog(c.env, input.providerSlug, "manual", String(submission.data.id)).catch((error) => {
		console.error("provider_catalog_initial_sync_failed", { providerSlug: input.providerSlug, error: error instanceof Error ? error.message : String(error) });
	}));

	return c.json({
		ok: true,
		provider: provider.data,
		submission: submission.data,
		preview: publicPreview(catalog.preview),
		catalogSync: {
			deliveryMode: "webhook_and_polling",
			webhookUrl: providerCatalogWebhookUrl(c.env, input.providerSlug),
			webhookSecret,
		},
		providerWorkspaceId,
		message: "Provider profile submitted. Account ownership is pending verification, and models are queued for route checks before production traffic is enabled.",
	}, 201, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsProviderOnboardingRouter.post("/provider-onboarding/webhook/rotate", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const body = await c.req.json<{ providerSlug?: unknown }>().catch((): { providerSlug?: unknown } => ({}));
	const providerSlug = typeof body.providerSlug === "string" ? body.providerSlug.trim().toLowerCase() : "";
	if (!providerSlugSchema.safeParse(providerSlug).success) return responseError(c, "Enter a valid provider slug.");
	const client = getDataClient(c.env);
	const workspaceIds = await manageableWorkspaceIds(client, user.id).catch(() => []);
	const link = await client.from("provider_account_links").select("provider_slug,workspace_id,role,status").eq("provider_slug", providerSlug).in("workspace_id", workspaceIds.length ? workspaceIds : ["00000000-0000-0000-0000-000000000000"]).in("status", ["pending", "active"]).in("role", ["owner", "admin"]).maybeSingle();
	if (link.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!link.data) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const source = await client.from("provider_catalog_sources").select("provider_slug").eq("provider_slug", providerSlug).maybeSingle();
	if (source.error) return c.json({ error: "provider_sync_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!source.data) return c.json({ error: "provider_sync_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const webhookSecret = generateProviderCatalogWebhookSecret();
	const updated = await client.from("provider_catalog_sources").update({ ...await encryptProviderCatalogWebhookSecret(c.env, webhookSecret), updated_at: new Date().toISOString() }).eq("provider_slug", providerSlug);
	if (updated.error) return c.json({ error: "provider_sync_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true, webhookUrl: providerCatalogWebhookUrl(c.env, providerSlug), webhookSecret }, 200, PRIVATE_NO_STORE_HEADERS);
});
