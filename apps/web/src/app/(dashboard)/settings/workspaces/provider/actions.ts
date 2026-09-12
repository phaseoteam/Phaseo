"use server";

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

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

export async function submitProviderOnboardingAction(input: {
	workspaceId: string;
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
