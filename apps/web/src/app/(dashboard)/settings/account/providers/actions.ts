"use server";

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";
import { setActiveWorkspaceCookieOrThrow } from "@/utils/workspaceCookie";

export async function activateProviderAccountAction(): Promise<void> {
	const account = await fetchInternalAuthHeaderData();
	if (account.isLoggedIn && account.providerMode && account.currentTeamId) {
		await setActiveWorkspaceCookieOrThrow(account.currentTeamId);
	}
}

async function accessToken(): Promise<string> {
	const context = await getServerAccountContext();
	if (!context.accessToken) throw new Error("Your session has expired. Sign in again to continue.");
	return context.accessToken;
}

export type ProviderCatalogPreview = {
	valid: boolean;
	modelCount: number;
	truncated: boolean;
	issues: Array<{ path: string; message: string }>;
	models: Array<{
		id: string;
		name: string;
		description: string | null;
		providerModelSlug: string;
		inputModalities: string[];
		outputModalities: string[];
		contextLength: number | null;
		maxOutputTokens: number | null;
		availability: "ready" | "not_ready" | "degraded" | "deprecated" | "retired";
		availableFrom: string | null;
		deprecatedAt: string | null;
		shutdownAt: string | null;
		pricing: Array<{ meterKey: string; modality: string; direction: string | null; unit: string; unitQuantity: number; priceNanos: number; displayLabel: string; displayUnit: string }>;
		capabilities: Array<{ id: string; parameters: string[] }>;
	}>;
};

export type ProviderManagedCatalogModel = {
	id: string;
	name: string;
	description: string | null;
	provider_model_slug: string;
	input_modalities: string[];
	output_modalities: string[];
	context_length: number | null;
	max_output_tokens: number | null;
	availability: "ready" | "not_ready" | "degraded" | "deprecated" | "retired";
	available_from: string | null;
	deprecated_at: string | null;
	shutdown_at: string | null;
	capabilities: Array<{ id: string; parameters: string[] }>;
	pricing: Array<{ meter_key: string; modality: string; direction: string | null; unit: string; unit_quantity: number; price_nanos: number; display_label: string; display_unit: string }>;
};

export type ProviderManagedCatalog = {
	provider: { provider_slug: string; name: string; status: string };
	source: { catalog_url: string | null; management_mode: "remote" | "managed"; managed_updated_at: string | null; catalog_version: string; updated_at: string; last_success_at: string | null; last_error: string | null; last_polled_at: string | null };
	catalog: { data: ProviderManagedCatalogModel[] };
	models: ProviderManagedCatalogModel[];
	latest_run: { id: string; status: string; review_status: string; model_count: number | null; created_at: string; completed_at: string | null } | null;
};

export async function previewProviderCatalogAction(catalogUrl: string) {
	return fetchAccountWebApi<{
		ok: true;
		catalogUrl: string;
		sha256: string;
		preview: ProviderCatalogPreview;
	}>(
		"/api/account/settings/provider-onboarding/preview",
		await accessToken(),
		{ method: "POST", body: JSON.stringify({ catalogUrl }) },
	);
}

export async function fetchProviderCatalogAction(providerSlug: string) {
	return fetchAccountWebApi<{ ok: true } & ProviderManagedCatalog>(
		`/api/account/settings/provider-onboarding/catalog/${encodeURIComponent(providerSlug)}`,
		await accessToken(),
		{ method: "GET" },
	);
}

export async function fetchProviderCatalogVersionAction(providerSlug: string) {
	return fetchAccountWebApi<{ ok: true; catalog_version: string }>(
		`/api/account/settings/provider-onboarding/catalog/${encodeURIComponent(providerSlug)}/version`,
		await accessToken(),
		{ method: "GET" },
	);
}

export async function updateProviderCatalogAction(providerSlug: string, catalog: { data: ProviderManagedCatalogModel[] } | { mode: "remote" }, expectedUpdatedAt: string) {
	return fetchAccountWebApi<{ ok: true } & ProviderManagedCatalog>(
		`/api/account/settings/provider-onboarding/catalog/${encodeURIComponent(providerSlug)}`,
		await accessToken(),
		{ method: "PUT", body: JSON.stringify({ catalog, expectedUpdatedAt }) },
	);
}

export async function submitProviderOnboardingAction(input: {
	providerSlug: string;
	providerName: string;
	websiteUrl: string;
	logoUrl: string;
	catalogUrl: string;
	claimChallengeId?: string;
}) {
	return fetchAccountWebApi<{
		ok: true;
		message: string;
		provider: { provider_slug: string; name: string; status: string; routable: boolean; routing_enabled: boolean };
		submission: { id: string; provider_slug: string; provider_name: string; status: string; model_count: number; submitted_at: string };
		catalogSync: { deliveryMode: string; webhookUrl: string; webhookSecret: string | null };
		providerWorkspaceId: string;
	}>(
		"/api/account/settings/provider-onboarding/submit",
		await accessToken(),
		{ method: "POST", body: JSON.stringify(input) },
	);
}

export async function startProviderClaimAction(providerSlug: string, websiteUrl: string) {
	return fetchAccountWebApi<{ ok: true; challengeId: string; token: string; verificationUrl: string; expiresAt: string }>(
		"/api/account/settings/provider-onboarding/claims/start",
		await accessToken(),
		{ method: "POST", body: JSON.stringify({ providerSlug, websiteUrl }) },
	);
}

export async function rotateProviderCatalogWebhookAction(providerSlug: string) {
	return fetchAccountWebApi<{ ok: true; webhookUrl: string; webhookSecret: string }>(
		"/api/account/settings/provider-onboarding/webhook/rotate",
		await accessToken(),
		{ method: "POST", body: JSON.stringify({ providerSlug }) },
	);
}
