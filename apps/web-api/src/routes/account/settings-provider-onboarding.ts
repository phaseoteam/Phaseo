import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "@/auth/requireUser";
import { getAuthenticatedDataClient, getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/http/cache";
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
import { isProviderAccessBlockedByReview, latestApplicableProviderReviewApplication } from "./provider-review-access";

const providerSlugSchema = z.string().trim().toLowerCase().min(2).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/);
const MAX_PROVIDER_SOURCES_PER_USER = 5;
const MAX_PROVIDER_SUBMISSIONS_PER_USER_PER_DAY = 5;
const httpsUrlSchema = z.string().trim().url().refine((value) => new URL(value).protocol === "https:");
const optionalHttpsUrlSchema = z.preprocess((value) => value === "" ? undefined : value, httpsUrlSchema.optional());
const profileSchema = z.object({
	providerSlug: providerSlugSchema,
	providerName: z.string().trim().min(2).max(120),
	websiteUrl: httpsUrlSchema,
	logoUrl: optionalHttpsUrlSchema,
	catalogUrl: optionalHttpsUrlSchema,
	catalogMode: z.enum(["remote", "managed"]).default("remote"),
	claimChallengeId: z.string().uuid().optional(),
});

async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function claimUrl(domain: string): string { return `https://${domain}/.well-known/phaseo-provider-claim.txt`; }

async function verifyClaimFile(domain: string, expectedHash: string): Promise<boolean> {
	const response = await fetch(claimUrl(domain), { method: "GET", redirect: "manual", signal: AbortSignal.timeout(10_000) });
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

function providerCatalogWebhookUrl(env: Env, providerSlug: string, requestUrl: string): string {
	const request = new URL(requestUrl);
	const origin = env.ENV === "production" || request.hostname === "phaseo.app" || request.hostname === "www.phaseo.app"
		? "https://phaseo.app"
		: request.origin;
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

async function accessibleWorkspaceIds(client: any, userId: string): Promise<string[]> {
	const [memberships, owned] = await Promise.all([
		client.from("workspace_members").select("workspace_id").eq("user_id", userId),
		client.from("workspaces").select("id").eq("owner_user_id", userId),
	]);
	if (memberships.error || owned.error) throw new Error("workspace_membership_unavailable");
	return [...new Set([...(memberships.data ?? []).map((row: any) => String(row.workspace_id)), ...(owned.data ?? []).map((row: any) => String(row.id))])];
}

async function manageableWorkspaceIds(client: any, userId: string): Promise<string[]> {
	const [memberships, owned] = await Promise.all([
		client.from("workspace_members").select("workspace_id,role").eq("user_id", userId).in("role", ["owner", "admin"]),
		client.from("workspaces").select("id").eq("owner_user_id", userId),
	]);
	if (memberships.error || owned.error) throw new Error("workspace_membership_unavailable");
	return [...new Set([...(memberships.data ?? []).map((row: any) => String(row.workspace_id)), ...(owned.data ?? []).map((row: any) => String(row.id))])];
}

function previewAvailability(model: any, now = Date.now()): { status: "coming_soon" | "not_active"; reason: string } {
	const availability = String(model.availability ?? "ready").trim().toLowerCase();
	if (availability === "retired") return { status: "not_active", reason: "retired" };
	if (availability === "deprecated") return { status: "not_active", reason: "deprecated" };
	const availableFrom = Date.parse(String(model.available_from ?? ""));
	if (Number.isFinite(availableFrom) && availableFrom > now) return { status: "coming_soon", reason: "scheduled" };
	if (availability === "not_ready") return { status: "coming_soon", reason: "provider_not_ready" };
	if (availability === "degraded") return { status: "coming_soon", reason: "provider_degraded" };
	if (String(model.decision ?? "pending") === "needs_changes") return { status: "coming_soon", reason: "needs_changes" };
	if (String(model.route_projection_status ?? "not_projected") === "failed") return { status: "coming_soon", reason: "endpoint_checks_failed" };
	if (String(model.decision ?? "pending") !== "approved") return { status: "coming_soon", reason: "pending_review" };
	return { status: "coming_soon", reason: "pending_endpoint_checks" };
}

function uniqueStringValues(values: unknown[]): string[] {
	return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

type PreviewTestBlockedReason =
	| "model_not_testable"
	| "provider_endpoint_missing"
	| "provider_adapter_missing"
	| "provider_credentials_missing"
	| "route_not_staged";

function providerCatalogPreviewRouteMatches(model: any, route: any): boolean {
	if (String(route?.provider_slug ?? "").trim() !== String(model?.provider_slug ?? "").trim()) return false;
	const modelCandidates = new Set([
		model?.model_slug,
		model?.canonical_model_slug,
		model?.provider_model_slug,
	].map((value) => String(value ?? "").trim()).filter(Boolean));
	if (![route?.model_slug, route?.provider_model_slug]
		.map((value) => String(value ?? "").trim())
		.some((value) => modelCandidates.has(value))) return false;
	if (String(route?.access_scope ?? "").trim().toLowerCase() !== "internal") return false;
	if (!["testing", "enabled"].includes(String(route?.phaseo_status ?? "").trim().toLowerCase())) return false;
	if (!["active", "degraded", "disabled"].includes(String(route?.status ?? "").trim().toLowerCase())) return false;
	return ["coming_soon", "preview", "available", "limited_access"]
		.includes(String(route?.provider_availability_status ?? "").trim().toLowerCase());
}

function resolvePreviewTestBlockedReason(
	model: any,
	provider: any,
	routes: any[],
): PreviewTestBlockedReason | null {
	const availability = String(model?.availability ?? "ready").trim().toLowerCase();
	if (["deprecated", "retired"].includes(availability)) return "model_not_testable";
	if (!provider || !String(provider.base_url ?? "").trim()) return "provider_endpoint_missing";
	const metadata = provider.metadata && typeof provider.metadata === "object" && !Array.isArray(provider.metadata)
		? provider.metadata as Record<string, unknown>
		: {};
	if (metadata.adapter_ready !== true) return "provider_adapter_missing";
	if (metadata.credentials_ready !== true) return "provider_credentials_missing";
	if (!routes.some((route) => providerCatalogPreviewRouteMatches(model, route))) return "route_not_staged";
	return null;
}

async function providerCatalogPreviewPayload(client: any, providerSlugs: string[]) {
	if (!providerSlugs.length) return [];
	const runsResult = await client.from("provider_catalog_sync_runs")
		.select("id,provider_slug,status,review_status,created_at")
		.eq("status", "applied")
		.in("provider_slug", providerSlugs)
		.order("created_at", { ascending: false })
		.limit(5000);
	if (runsResult.error) throw runsResult.error;
	const latestRuns = new Map<string, any>();
	for (const run of runsResult.data ?? []) {
		const providerSlug = String(run.provider_slug ?? "").trim();
		if (!providerSlug || latestRuns.has(providerSlug) || String(run.review_status ?? "pending") === "rejected") continue;
		latestRuns.set(providerSlug, run);
	}
	const runs = [...latestRuns.values()];
	if (!runs.length) return [];
	const runIds = runs.map((run) => String(run.id));
	const [modelsResult, capabilitiesResult, providersResult, routesResult] = await Promise.all([
		client.from("provider_catalog_sync_models")
			.select("run_id,provider_slug,model_slug,canonical_model_slug,match_type,provider_model_slug,name,description,input_modalities,output_modalities,context_length,max_output_tokens,availability,available_from,deprecated_at,shutdown_at,decision,route_projection_status,created_at,metadata")
			.in("run_id", runIds)
			.order("model_slug", { ascending: true }),
		client.from("provider_catalog_sync_model_capabilities")
			.select("run_id,model_slug,capability_id,parameters")
			.in("run_id", runIds)
			.order("capability_id", { ascending: true }),
		client.from("v2_providers")
			.select("provider_slug,name,status,base_url,metadata")
			.in("provider_slug", runs.map((run) => String(run.provider_slug))),
		client.from("v2_model_provider_routes")
			.select("provider_slug,model_slug,provider_model_slug,status,provider_availability_status,phaseo_status,access_scope")
			.in("provider_slug", runs.map((run) => String(run.provider_slug))),
	]);
	if (modelsResult.error || capabilitiesResult.error || providersResult.error) throw new Error("provider_catalog_preview_unavailable");
	const capabilitiesByModel = new Map<string, any[]>();
	for (const capability of capabilitiesResult.data ?? []) {
		const key = `${capability.run_id}:${capability.model_slug}`;
		capabilitiesByModel.set(key, [...(capabilitiesByModel.get(key) ?? []), capability]);
	}
	const providers = new Map<string, any>((providersResult.data ?? []).map((provider: any) => [String(provider.provider_slug), provider] as [string, any]));
	const routesByProvider = new Map<string, any[]>();
	for (const route of routesResult.error ? [] : routesResult.data ?? []) {
		const providerSlug = String(route?.provider_slug ?? "").trim();
		if (providerSlug) routesByProvider.set(providerSlug, [...(routesByProvider.get(providerSlug) ?? []), route]);
	}
	const now = Date.now();
	const allowedProviderSlugs = new Set(providerSlugs.map((slug) => String(slug).trim().toLowerCase()));
	return (modelsResult.data ?? [])
		.filter((model: any) => allowedProviderSlugs.has(String(model.provider_slug ?? "").trim().toLowerCase()))
		.filter((model: any) => String(model.decision ?? "pending") !== "rejected")
		.filter((model: any) => String(model.route_projection_status ?? "not_projected") !== "enabled")
		.map((model: any) => {
			const providerSlug = String(model.provider_slug ?? "").trim();
			const modelId = String(model.model_slug ?? "").trim();
			const providerModelSlug = String(model.provider_model_slug ?? modelId).trim() || modelId;
			const metadata = model.metadata && typeof model.metadata === "object" && !Array.isArray(model.metadata)
				? model.metadata as Record<string, unknown>
				: {};
			const pricing = Array.isArray(metadata.pricing)
				? metadata.pricing
						.filter((price): price is Record<string, unknown> => Boolean(price) && typeof price === "object")
						.map((price) => ({
							meterKey: String(price.meterKey ?? "").trim(),
							modality: String(price.modality ?? "").trim(),
							direction: price.direction == null ? null : String(price.direction).trim(),
							unit: String(price.unit ?? "").trim(),
							unitQuantity: Number(price.unitQuantity ?? 1),
							priceNanos: Number(price.priceNanos ?? 0),
							displayLabel: String(price.displayLabel ?? price.meterKey ?? "").trim(),
							displayUnit: String(price.displayUnit ?? price.unit ?? "").trim(),
						}))
						.filter((price) => price.meterKey && price.unit && Number.isFinite(price.priceNanos))
				: [];
			const capabilities = capabilitiesByModel.get(`${model.run_id}:${model.model_slug}`) ?? [];
			const availability = previewAvailability(model, now);
			const testBlockedReason = resolvePreviewTestBlockedReason(
				model,
				providers.get(providerSlug),
				routesByProvider.get(providerSlug) ?? [],
			);
			return {
				model_id: modelId,
				canonical_model_slug: model.canonical_model_slug ?? null,
				match_type: model.match_type ?? null,
				pricing,
				api_model_id: providerModelSlug,
				model_name: String(model.name ?? modelId).trim() || modelId,
				provider_model_slug: providerModelSlug,
				provider_slug: providerSlug,
				provider_name: String(providers.get(providerSlug)?.name ?? providerSlug).trim() || providerSlug,
				description: model.description ?? null,
				endpoints: uniqueStringValues(capabilities.map((capability) => capability.capability_id)),
				supported_params: uniqueStringValues(capabilities.flatMap((capability) => Array.isArray(capability.parameters) ? capability.parameters : [])),
				input_modalities: Array.isArray(model.input_modalities) ? model.input_modalities : [],
				output_modalities: Array.isArray(model.output_modalities) ? model.output_modalities : [],
				context_length: model.context_length ?? null,
				max_output_tokens: model.max_output_tokens ?? null,
				availability_status: availability.status,
				availability_reason: availability.reason,
				available_from: model.available_from ?? null,
				deprecated_at: model.deprecated_at ?? null,
				shutdown_at: model.shutdown_at ?? null,
				release_date: model.available_from ?? null,
				announcement_date: model.created_at ?? null,
				created_at: model.created_at ?? null,
				is_active_gateway: false,
				decision: String(model.decision ?? "pending"),
				route_projection_status: String(model.route_projection_status ?? "not_projected"),
				can_test: testBlockedReason === null,
				test_blocked_reason: testBlockedReason,
			};
		});
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
	let workspaceIds: string[];
	try { workspaceIds = await accessibleWorkspaceIds(client, user.id); }
	catch { return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); }
	const [submissions, links, events, role] = await Promise.all([
		client.from("provider_onboarding_submissions")
			.select("id,provider_slug,provider_name,website_url,logo_url,catalog_url,catalog_mode,application_type,status,model_count,validation_summary,submitted_at,created_at,provider_review_status,provider_review_reason")
			.eq("submitted_by", user.id)
			.order("created_at", { ascending: false })
			.limit(20),
		client.from("provider_account_links")
			.select("provider_slug,workspace_id,role,status,verified_at,linked_by")
			.in("workspace_id", workspaceIds.length ? workspaceIds : ["00000000-0000-0000-0000-000000000000"])
			.in("status", ["pending", "active"])
			.order("created_at", { ascending: false }),
		client.from("provider_catalog_events").select("id,provider_slug,run_id,event_type,title,message,payload,read_at,created_at").in("workspace_id", workspaceIds.length ? workspaceIds : ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }).limit(50),
		client.from("users").select("role").eq("user_id", user.id).maybeSingle(),
	]);
	if (submissions.error || links.error || events.error || role.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const submittedProviderSlugs = uniqueStringValues((submissions.data ?? []).map((submission: any) => submission.provider_slug));
	const submissionProviders = submittedProviderSlugs.length
		? await client.from("v2_providers").select("provider_slug,metadata").in("provider_slug", submittedProviderSlugs)
		: { data: [], error: null };
	if (submissionProviders.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const reviewStateByProvider = new Map((submissionProviders.data ?? []).map((provider: any) => {
		const selfServe = provider.metadata?.self_serve;
		return [String(provider.provider_slug), {
			status: typeof selfServe?.provider_review_status === "string" ? selfServe.provider_review_status : "awaiting_approval",
			reason: typeof selfServe?.provider_review_reason === "string" ? selfServe.provider_review_reason : null,
		}];
	}));
	const linkedSlugs = (links.data ?? []).map((link) => String(link.provider_slug));
	const isAdmin = String(role.data?.role ?? "").toLowerCase() === "admin";
	const catalogProviderSources = isAdmin
		? await client.from("provider_catalog_sources").select("provider_slug").order("provider_slug", { ascending: true }).limit(5000)
		: { data: links.data ?? [], error: null };
	if (catalogProviderSources.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const catalogSlugs = (catalogProviderSources.data ?? []).map((provider) => String(provider.provider_slug));
	const [providers, sources, catalogApplications] = await Promise.all([
		catalogSlugs.length
			? client.from("v2_providers").select("provider_slug,name,status,routable,routing_enabled,metadata").in("provider_slug", catalogSlugs)
			: Promise.resolve({ data: [], error: null }),
		catalogSlugs.length
			? client.from("provider_catalog_sources").select("provider_slug,status,delivery_mode,management_mode,catalog_url,last_success_at,last_polled_at,last_catalog_sha256,consecutive_failures,last_error,etag,last_modified,next_poll_at,webhook_secret_hash").in("provider_slug", catalogSlugs)
			: Promise.resolve({ data: [], error: null }),
		catalogSlugs.length
			? client.from("provider_onboarding_submissions").select("provider_slug,application_type,catalog_mode,provider_review_status,provider_review_reason,submitted_by,created_at").in("provider_slug", catalogSlugs).order("created_at", { ascending: false })
			: Promise.resolve({ data: [], error: null }),
	]);
	if (providers.error || catalogApplications.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (sources.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const sourceByProvider = new Map((sources.data ?? []).map((source: any) => [String(source.provider_slug), source]));
	const catalogApplicationsByProvider = new Map<string, any[]>();
	for (const application of catalogApplications.data ?? []) {
		const slug = String(application.provider_slug);
		catalogApplicationsByProvider.set(slug, [...(catalogApplicationsByProvider.get(slug) ?? []), application]);
	}
	const submissionsWithReview = (submissions.data ?? []).map((submission: any) => {
		const fallbackReview = reviewStateByProvider.get(String(submission.provider_slug));
		return {
			...submission,
			catalog_mode: submission.catalog_mode ?? sourceByProvider.get(String(submission.provider_slug))?.management_mode ?? (submission.catalog_url ? "remote" : "managed"),
			provider_review_status: submission.provider_review_status ?? fallbackReview?.status ?? "awaiting_approval",
			provider_review_reason: submission.provider_review_reason ?? fallbackReview?.reason ?? null,
		};
	});
	const reviewRuns = catalogSlugs.length
		? await client.from("provider_catalog_sync_runs").select("id,provider_slug,trigger,status,review_status,review_summary,model_count,error_message,created_at,completed_at").in("provider_slug", catalogSlugs).order("created_at", { ascending: false }).limit(20)
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
		isAdmin,
		linkedProviders: links.data ?? [],
		catalogProviders: (catalogProviderSources.data ?? []).map((provider) => {
			const slug = String(provider.provider_slug);
			const providerState = providers.data?.find((row: any) => row.provider_slug === provider.provider_slug);
			const selfServe = providerState?.metadata?.self_serve;
			const providerLinks = (links.data ?? []).filter((link: any) => String(link.provider_slug) === slug);
			const currentLink = providerLinks.find((link: any) => link.status === "active") ?? providerLinks[0];
			const application = isAdmin
				? catalogApplicationsByProvider.get(slug)?.[0]
				: latestApplicableProviderReviewApplication(catalogApplicationsByProvider.get(slug), currentLink?.linked_by ?? user.id);
			const reviewStatus = application?.provider_review_status
				?? (typeof selfServe?.provider_review_status === "string" ? selfServe.provider_review_status : null);
			return {
				provider_slug: slug,
				name: providerState?.name ?? provider.provider_slug,
				provider_review_status: reviewStatus,
				canManageCatalog: isAdmin || !isProviderAccessBlockedByReview({
					application,
					fallbackReviewStatus: typeof selfServe?.provider_review_status === "string" ? selfServe.provider_review_status : null,
					linkStatus: currentLink?.status ?? null,
				}),
				operatingStatus: (() => {
					const state = providerState;
					if (!state) return "Status unavailable";
					if (reviewStatus === "needs_changes") return "Changes requested";
					if (reviewStatus === "rejected") return "Rejected";
					if (reviewStatus === "paused") return "Paused";
					if (reviewStatus && reviewStatus !== "approved") return "Application in review";
					if (state.status === "not_ready" && reviewStatus !== "approved") return "In review";
					if (reviewStatus === "approved" && !(state.routable && state.routing_enabled)) return "Approved · route setup";
					if (state.status === "retired") return "Retired";
					return state.routable && state.routing_enabled ? "Active" : "Paused";
				})(),
				workspace_id: "",
				role: isAdmin ? "admin" : String((provider as any).role ?? "member"),
				status: "active" as const,
				verified_at: null,
			};
		}),
		submissions: submissionsWithReview,
		syncSources: (sources.data ?? []).map(({ webhook_secret_hash, ...source }) => ({ ...source, webhookConfigured: Boolean(webhook_secret_hash), webhookUrl: providerCatalogWebhookUrl(c.env, String(source.provider_slug), c.req.url) })),
		reviewRevisions: (reviewRuns.data ?? []).map((run) => ({ ...run, models: modelsByRun.get(String(run.id)) ?? [] })),
		events: events.data ?? [],
		contracts: { schemaUrl: "/api/internal/provider-catalog/schema", openApiUrl: "/api/internal/provider-catalog/openapi" },
	}, 200, PRIVATE_NO_STORE_HEADERS);
});

accountSettingsProviderOnboardingRouter.get("/provider-onboarding/catalogue-previews", async (c) => {
	const user = await requireUser(c.req.raw, c.env);
	if (!user) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const requestedProvider = c.req.query("providerSlug");
	if (requestedProvider) {
		const parsedProvider = providerSlugSchema.safeParse(requestedProvider);
		if (!parsedProvider.success) return responseError(c, "Invalid provider slug.");
	}
	const client = getDataClient(c.env);
	const role = await client.from("users").select("role").eq("user_id", user.id).maybeSingle();
	if (role.error) return c.json({ error: "provider_catalog_preview_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const isAdmin = String(role.data?.role ?? "").toLowerCase() === "admin";
	let providerSlugs: string[] = [];
	if (isAdmin) {
		if (requestedProvider) providerSlugs = [String(requestedProvider).trim().toLowerCase()];
		else {
			const providers = await client.from("v2_providers").select("provider_slug").order("provider_slug", { ascending: true }).limit(5000);
			if (providers.error) return c.json({ error: "provider_catalog_preview_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
			providerSlugs = (providers.data ?? []).map((provider: any) => String(provider.provider_slug)).filter(Boolean);
		}
	} else {
		let workspaceIds: string[];
		try { workspaceIds = await accessibleWorkspaceIds(client, user.id); }
		catch { return c.json({ error: "provider_catalog_preview_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS); }
		if (workspaceIds.length) {
			const links = await client.from("provider_account_links")
				.select("provider_slug")
				.in("workspace_id", workspaceIds)
				.in("status", ["pending", "active"]);
			if (links.error) return c.json({ error: "provider_catalog_preview_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
			providerSlugs = uniqueStringValues((links.data ?? []).map((link: any) => link.provider_slug)).map((slug) => slug.toLowerCase());
		}
		if (requestedProvider) providerSlugs = providerSlugs.filter((slug) => slug === String(requestedProvider).trim().toLowerCase());
	}
	try {
		const models = await providerCatalogPreviewPayload(client, providerSlugs);
		return c.json({ authenticated: true, isAdmin, models }, 200, PRIVATE_NO_STORE_HEADERS);
	} catch {
		return c.json({ error: "provider_catalog_preview_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
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
	const websiteHost = hostFromUrl(input.websiteUrl);
	const contactHost = user.email?.split("@").at(-1)?.toLowerCase() ?? "";
	if (!contactHost) return responseError(c, "Sign in with a provider email address before enrolling.");
	const contactDomainMatchesWebsite = sameOrSubdomain(contactHost, websiteHost) || sameOrSubdomain(websiteHost, contactHost);
	if (input.catalogMode === "remote" && !input.catalogUrl) return responseError(c, "Enter a catalog URL or choose to manage models in Phaseo.");
	const catalogHost = input.catalogUrl ? hostFromUrl(input.catalogUrl) : websiteHost;
	if (input.catalogMode === "remote" && !sameOrSubdomain(catalogHost, websiteHost)) {
		return responseError(c, "The catalog URL must be hosted on the provider website domain or a subdomain.");
	}
	const client = getDataClient(c.env);
	const authenticatedClient = getAuthenticatedDataClient(c.env, c.req.raw);
	if (!authenticatedClient) return c.json({ error: "unauthorized" }, 401, PRIVATE_NO_STORE_HEADERS);
	const existingSourcePreflight = await client.from("provider_catalog_sources")
		.select("provider_slug,status,created_by")
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
		catalog = input.catalogMode === "managed"
			? { preview: { valid: true, modelCount: 0, models: [], allModels: [], issues: [], truncated: false }, sha256: await sha256(JSON.stringify({ data: [] })), etag: null, lastModified: null, notModified: false }
			: await fetchAndValidateProviderCatalog(input.catalogUrl!);
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
	const providerLinks = await client.from("provider_account_links")
		.select("workspace_id,role,status,linked_by")
		.eq("provider_slug", input.providerSlug)
		.in("status", ["pending", "active"])
		.order("status", { ascending: true })
		.limit(20);
	if (providerLinks.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const userWorkspaceIds = await accessibleWorkspaceIds(client, user.id).catch(() => []);
	const userManageableWorkspaceIds = await manageableWorkspaceIds(client, user.id).catch(() => []);
	const link = (providerLinks.data ?? []).find((providerLink) => userWorkspaceIds.includes(String(providerLink.workspace_id))) ?? null;
	if (link && !userManageableWorkspaceIds.includes(String(link.workspace_id))) return c.json({ error: "provider_workspace_admin_required" }, 403, PRIVATE_NO_STORE_HEADERS);
	const ownsPendingEnrollment = existingSourcePreflight.data?.created_by === user.id
		&& existing.data?.routable === false && existing.data?.routing_enabled === false
		&& (existingMetadata.self_serve as { last_submitted_by?: unknown } | undefined)?.last_submitted_by === user.id;
	let verifiedClaimChallengeId: string | null = null;
	if (existing.data && !link && !ownsPendingEnrollment) {
		const existingWebsite = typeof existingMetadata.website_url === "string" ? existingMetadata.website_url : typeof existingMetadata.link === "string" ? existingMetadata.link : null;
		if (!existingWebsite) return responseError(c, "This existing provider has no verified ownership domain and must be claimed through manual verification.", 409);
		try {
			if (!sameOrSubdomain(websiteHost, hostFromUrl(existingWebsite))) return responseError(c, "That provider slug belongs to a different verified domain.", 409);
		} catch { return responseError(c, "That provider profile needs manual verification before it can be claimed.", 409); }
		if (!input.claimChallengeId) return responseError(c, "Start the ownership proof and publish its verification token before claiming this provider.", 409);
		const challenge = await client.from("provider_claim_challenges").select("id,domain,token_hash,status,expires_at").eq("id", input.claimChallengeId).eq("provider_slug", input.providerSlug).eq("requested_by", user.id).eq("status", "pending").gt("expires_at", new Date().toISOString()).maybeSingle();
		if (challenge.error) return c.json({ error: "claim_verification_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
		if (!challenge.data || challenge.data.domain !== hostFromUrl(existingWebsite) || !await verifyClaimFile(challenge.data.domain, challenge.data.token_hash)) return responseError(c, "The provider ownership token could not be verified.", 409);
		verifiedClaimChallengeId = String(challenge.data.id);
	}
	if (!contactDomainMatchesWebsite && !verifiedClaimChallengeId && !link && !ownsPendingEnrollment) {
		return responseError(c, "Use a provider email address on the organisation website domain, or verify the existing provider domain.");
	}
	try {
		if (!await reserveProviderSubmissionSlot(authenticatedClient, user.id)) {
			return c.json({ ok: false, error: "rate_limited", message: "Provider onboarding submissions are limited to five per user per day." }, 429, PRIVATE_NO_STORE_HEADERS);
		}
	} catch {
		return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}

	const providerMetadata = {
		...existingMetadata,
		website_url: input.websiteUrl,
		logo_url: input.logoUrl || null,
		catalog_url: input.catalogUrl ?? null,
		self_serve: {
			status: "submitted",
			provider_review_status: "awaiting_approval",
			catalog_sha256: catalog.sha256,
			last_submitted_by: user.id,
			last_submitted_at: new Date().toISOString(),
		},
	};
	let webhookSecret: string | null = null;
	let encryptedWebhookSecret: Awaited<ReturnType<typeof encryptProviderCatalogWebhookSecret>> | null = null;
	if (!existingSourcePreflight.data) {
		webhookSecret = generateProviderCatalogWebhookSecret();
		encryptedWebhookSecret = await encryptProviderCatalogWebhookSecret(c.env, webhookSecret);
	}
	const proofMethod = verifiedClaimChallengeId ? "domain_file" : input.catalogMode === "managed" ? "self_declared" : "catalog_domain_match";
	const enrollment = await client.rpc("complete_provider_enrollment", {
		p_user_id: user.id,
		p_provider_slug: input.providerSlug,
		p_provider_name: input.providerName,
		p_provider_metadata: providerMetadata,
		p_website_url: input.websiteUrl,
		p_logo_url: input.logoUrl || null,
		p_catalog_url: input.catalogUrl ?? null,
		p_catalog_mode: input.catalogMode,
		p_catalog_sha256: catalog.sha256,
		p_catalog_preview: { models: catalog.preview.models, truncated: catalog.preview.truncated },
		p_validation_summary: { valid: true, issues: [], checked_at: new Date().toISOString() },
		p_model_count: catalog.preview.modelCount,
		p_proof_method: proofMethod,
		p_proof_subject: catalogHost,
		p_claim_challenge_id: verifiedClaimChallengeId,
		p_webhook_secret_ciphertext: encryptedWebhookSecret?.webhook_secret_ciphertext ?? null,
		p_webhook_secret_iv: encryptedWebhookSecret?.webhook_secret_iv ?? null,
		p_webhook_secret_hash: encryptedWebhookSecret?.webhook_secret_hash ?? null,
	});
	if (enrollment.error || !enrollment.data) {
		if (enrollment.error?.message.includes("provider_claim_already_pending")) {
			return responseError(c, "Another ownership claim for this provider is already awaiting review.", 409);
		}
		console.error("provider_enrollment_transaction_failed", { providerSlug: input.providerSlug, error: enrollment.error?.message ?? "empty result" });
		return c.json({ error: "provider_enrollment_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	}
	const enrollmentData = enrollment.data as { provider: any; submission: any; providerWorkspaceId: string; applicationType?: string };
	const safeSubmission = { ...(enrollmentData.submission ?? {}) };
	delete safeSubmission.pending_webhook_secret_ciphertext;
	delete safeSubmission.pending_webhook_secret_iv;
	delete safeSubmission.pending_webhook_secret_hash;
	const applicationType = enrollmentData.applicationType === "claim" ? "claim" : "new";
	if (catalog.preview.modelCount > 0 && applicationType !== "claim") c.executionCtx.waitUntil(syncProviderCatalog(c.env, input.providerSlug, "manual", String(enrollmentData.submission.id)).catch((error) => {
		console.error("provider_catalog_initial_sync_failed", { providerSlug: input.providerSlug, error: error instanceof Error ? error.message : String(error) });
	}));

	return c.json({
		ok: true,
		provider: enrollmentData.provider,
		submission: safeSubmission,
		preview: publicPreview(catalog.preview),
		catalogSync: {
			deliveryMode: "webhook_and_polling",
			webhookUrl: providerCatalogWebhookUrl(c.env, input.providerSlug, c.req.url),
			webhookSecret,
		},
		applicationType,
		providerWorkspaceId: enrollmentData.providerWorkspaceId,
		message: applicationType === "claim"
			? "Provider claim submitted for Phaseo approval. The existing provider and catalog stay unchanged until the claim is approved."
			: "Provider profile submitted for Phaseo approval. Public routing remains disabled until separate model and route checks are complete.",
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
	const link = await client.from("provider_account_links").select("provider_slug,workspace_id,role,status,linked_by").eq("provider_slug", providerSlug).in("workspace_id", workspaceIds.length ? workspaceIds : ["00000000-0000-0000-0000-000000000000"]).in("status", ["pending", "active"]).in("role", ["owner", "admin"]).order("status", { ascending: true }).limit(1).maybeSingle();
	if (link.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!link.data) return c.json({ error: "forbidden" }, 403, PRIVATE_NO_STORE_HEADERS);
	const [application, provider] = await Promise.all([
		client.from("provider_onboarding_submissions").select("application_type,provider_review_status,submitted_by").eq("provider_slug", providerSlug).order("created_at", { ascending: false }),
		client.from("v2_providers").select("metadata").eq("provider_slug", providerSlug).maybeSingle(),
	]);
	if (application.error || provider.error) return c.json({ error: "settings_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	const reviewApplication = latestApplicableProviderReviewApplication(application.data ?? [], link.data.linked_by ?? user.id);
	if (isProviderAccessBlockedByReview({
		application: reviewApplication,
		fallbackReviewStatus: provider.data?.metadata?.self_serve?.provider_review_status,
		linkStatus: link.data.status,
	})) {
		return responseError(c, "provider_application_not_approved", 409);
	}
	const source = await client.from("provider_catalog_sources").select("provider_slug").eq("provider_slug", providerSlug).maybeSingle();
	if (source.error) return c.json({ error: "provider_sync_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	if (!source.data) return c.json({ error: "provider_sync_not_found" }, 404, PRIVATE_NO_STORE_HEADERS);
	const webhookSecret = generateProviderCatalogWebhookSecret();
	const updated = await client.from("provider_catalog_sources").update({ ...await encryptProviderCatalogWebhookSecret(c.env, webhookSecret), updated_at: new Date().toISOString() }).eq("provider_slug", providerSlug);
	if (updated.error) return c.json({ error: "provider_sync_unavailable" }, 503, PRIVATE_NO_STORE_HEADERS);
	return c.json({ ok: true, webhookUrl: providerCatalogWebhookUrl(c.env, providerSlug, c.req.url), webhookSecret }, 200, PRIVATE_NO_STORE_HEADERS);
});
