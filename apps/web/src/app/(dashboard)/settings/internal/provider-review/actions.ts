"use server";

import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalProviderApplications, type InternalProviderApplicationCursor } from "@/lib/fetchers/internal/fetchInternalProviderCatalogReviews";
import { fetchInternalWebApi, WebApiError } from "@/lib/web-api/client";

export async function fetchMoreProviderApplicationsAction(cursor: InternalProviderApplicationCursor) {
	return fetchInternalProviderApplications(cursor);
}

export async function reviewProviderCatalogModelAction(input: {
	runId: string;
	modelSlug: string;
	decision: "approved" | "rejected" | "needs_changes";
	reason?: string;
}) {
	const context = await getServerAccountContext();
	return fetchInternalWebApi<{ ok: true; reviewStatus: string; reviewSummary: Record<string, number> }>(
		`/api/internal/provider-catalog/reviews/${encodeURIComponent(input.runId)}/models/${encodeURIComponent(input.modelSlug)}`,
		context.accessToken,
		{ method: "PATCH", body: JSON.stringify({ decision: input.decision, reason: input.reason }) },
	);
}

export async function recordProviderRouteProbeAction(input: { runId: string; modelSlug: string; passed: boolean; reason?: string }) {
	const context = await getServerAccountContext();
	return fetchInternalWebApi<{ ok: true; candidate: { status: string; probed_at: string } }>(
		`/api/internal/provider-catalog/candidates/${encodeURIComponent(input.runId)}/models/${encodeURIComponent(input.modelSlug)}/probe`,
		context.accessToken,
		{ method: "PATCH", body: JSON.stringify({ passed: input.passed, summary: input.reason ? { reason: input.reason } : {} }) },
	);
}

export async function promoteProviderRouteCandidateAction(input: { runId: string; modelSlug: string }) {
	const context = await getServerAccountContext();
	return fetchInternalWebApi<{ ok: true; providerModelId: string }>(
		`/api/internal/provider-catalog/candidates/${encodeURIComponent(input.runId)}/models/${encodeURIComponent(input.modelSlug)}/promote`,
		context.accessToken,
		{ method: "POST" },
	);
}

export async function reviewProviderApplicationAction(input: { providerSlug: string; decision: "approved" | "paused" | "rejected" | "needs_changes"; reason?: string }) {
	const context = await getServerAccountContext();
	try {
		await fetchInternalWebApi<{ ok: true; provider: { providerSlug: string; decision: string; activatedRouteIds: string[] } }>(
			`/api/internal/provider-catalog/providers/${encodeURIComponent(input.providerSlug)}`,
			context.accessToken,
			{ method: "PATCH", body: JSON.stringify({ decision: input.decision, reason: input.reason }) },
		);
		return { ok: true } as const;
	} catch (error) {
		if (error instanceof WebApiError && error.status === 409) {
			return { ok: false, error: error.detail ?? "provider_review_conflict" } as const;
		}
		throw error;
	}
}
