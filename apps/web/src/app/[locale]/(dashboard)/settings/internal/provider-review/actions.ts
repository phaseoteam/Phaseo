import { createServerFn } from "@tanstack/react-start";
import { serverAction } from "@/lib/serverFn/actionMiddleware";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalProviderApplications, fetchProviderModelRequests, type InternalProviderApplicationCursor } from "@/lib/fetchers/internal/fetchInternalProviderCatalogReviews";
import { fetchInternalWebApi, WebApiError } from "@/lib/web-api/client";

export const fetchMoreProviderApplicationsAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((cursor: InternalProviderApplicationCursor) => cursor)
	.handler(async ({ data: cursor }) => {
		return fetchInternalProviderApplications(cursor);
	});

export const refreshProviderModelRequestsAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.handler(async () => {return fetchProviderModelRequests();});
export const reviewProviderModelRequestAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: {requestId:string;decision:"approved"|"rejected"|"needs_changes";reason?:string;expectedUpdatedAt:string}) => input)
	.handler(async ({ data: input }) => {
		const context=await getServerAccountContext();
		return fetchInternalWebApi<{ok:true}>(`/api/internal/provider-catalog/model-requests/${encodeURIComponent(input.requestId)}`,context.accessToken,{method:"PATCH",body:JSON.stringify({decision:input.decision,reason:input.reason,expectedUpdatedAt:input.expectedUpdatedAt})});
	});

export const reviewProviderCatalogModelAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: {
		runId: string;
		modelSlug: string;
		decision: "approved" | "rejected" | "needs_changes";
		reason?: string;
	}) => input)
	.handler(async ({ data: input }) => {
		const context = await getServerAccountContext();
		return fetchInternalWebApi<{ ok: true; reviewStatus: string; reviewSummary: Record<string, number> }>(
			`/api/internal/provider-catalog/reviews/${encodeURIComponent(input.runId)}/models/${encodeURIComponent(input.modelSlug)}`,
			context.accessToken,
			{ method: "PATCH", body: JSON.stringify({ decision: input.decision, reason: input.reason }) },
		);
	});

export const recordProviderRouteProbeAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: { runId: string; modelSlug: string; passed: boolean; reason?: string }) => input)
	.handler(async ({ data: input }) => {
		const context = await getServerAccountContext();
		return fetchInternalWebApi<{ ok: true; candidate: { status: string; probed_at: string } }>(
			`/api/internal/provider-catalog/candidates/${encodeURIComponent(input.runId)}/models/${encodeURIComponent(input.modelSlug)}/probe`,
			context.accessToken,
			{ method: "PATCH", body: JSON.stringify({ passed: input.passed, summary: input.reason ? { reason: input.reason } : {} }) },
		);
	});

export const promoteProviderRouteCandidateAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: { runId: string; modelSlug: string }) => input)
	.handler(async ({ data: input }) => {
		const context = await getServerAccountContext();
		return fetchInternalWebApi<{ ok: true; providerModelId: string }>(
			`/api/internal/provider-catalog/candidates/${encodeURIComponent(input.runId)}/models/${encodeURIComponent(input.modelSlug)}/promote`,
			context.accessToken,
			{ method: "POST" },
		);
	});

export const reviewProviderApplicationAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: { providerSlug: string; decision: "approved" | "paused" | "rejected" | "needs_changes"; reason?: string }) => input)
	.handler(async ({ data: input }) => {
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
	});
