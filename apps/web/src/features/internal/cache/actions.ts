import { createServerFn } from "@tanstack/react-start";
import { serverMutation } from "@/lib/serverFn/actionMiddleware";
import {
	expirePublicModelCatalogueCache,
	revalidateAppDataTags,
	revalidateBenchmarkDataTags,
	revalidateModelDataOnlyTags,
	revalidateModelDataTags,
	revalidateOrganisationDataTags,
	revalidateProviderDataTags,
} from "@/lib/cache/revalidateDataTags";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalWebApi } from "@/lib/web-api/client";
import { resolveActionDockPageRefresh } from "@/lib/cache/actionDockPageRefresh";
import {
	revalidateSingleModelAllAction,
	revalidateSingleModelApiInfoAction,
	revalidateSingleModelDataAction,
} from "@/features/internal/data/actions";

type CacheOpResult = {
	ok: boolean;
	message: string;
};

type GatewayCachePurgeResult =
	| { ok: true; message: string }
	| { ok: false; message: string };

type CacheScopeId =
	| "search"
	| "catalogue"
	| "model"
	| "model-info"
	| "model-providers"
	| "model-telemetry"
	| "provider"
	| "organisation"
	| "benchmark"
	| "apps"
	| "landing"
	| "rankings"
	| "updates"
	| "pricing"
	| "all-public";

type CachePurgeResult = {
	success: true;
	scope: string;
	targetId: string | null;
	tags: string[];
	generation: number | null;
	generationWarning: string | null;
	browserRefreshEnabled: boolean;
	purgedAt: string;
};

async function requireAdmin() {
	const status = await fetchInternalAuthStatus();
	if (!status.signedIn || !status.isAdmin) throw new Error("Unauthorized");
}

function resolveGatewayInternalBaseUrl(): string {
	const raw =
		process.env.GATEWAY_INTERNAL_BASE_URL ??
		process.env.GATEWAY_PUBLIC_BASE_URL ??
		process.env.PUBLIC_GATEWAY_BASE_URL ??
		"https://api.phaseo.app";
	return raw.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
}

async function purgeGatewayCatalogueCache(tags: string[]): Promise<GatewayCachePurgeResult> {
	const token =
		process.env.GATEWAY_INTERNAL_TEST_TOKEN ??
		process.env.INTERNAL_GATEWAY_TOKEN ??
		process.env.INTERNAL_API_TOKEN ??
		"";
	const trimmedToken = token.trim();
	if (!trimmedToken) {
		return {
			ok: false,
			message: "Gateway Worker cache purge skipped: internal token is not configured.",
		};
	}

	const response = await fetch(`${resolveGatewayInternalBaseUrl()}/internal/cache/purge`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-internal-token": trimmedToken,
		},
		body: JSON.stringify({ tags }),
		cache: "no-store",
	});

	if (!response.ok) {
		let detail = "";
		try {
			const body = await response.json();
			detail =
				typeof body?.message === "string"
					? body.message
					: typeof body?.error === "string"
						? body.error
						: "";
		} catch {
			detail = "";
		}
		return {
			ok: false,
			message: `Gateway Worker cache purge failed (${response.status})${detail ? `: ${detail}` : "."}`,
		};
	}

	return {
		ok: true,
		message: `Gateway Worker cache purged (${tags.join(", ")}).`,
	};
}

async function runAdminAction(
	label: string,
	fn: () => Promise<CacheOpResult | void> | CacheOpResult | void
): Promise<CacheOpResult> {
	try {
		await requireAdmin();
		const result = await fn();
		if (result && typeof result === "object" && "ok" in result && "message" in result) {
			return result;
		}
		return { ok: true, message: `${label} cache revalidated.` };
	} catch (error) {
		return {
			ok: false,
			message:
				error instanceof Error
					? `${label} failed: ${error.message}`
					: `${label} failed.`,
		};
	}
}

// Expires the website data caches behind a scope. The page itself re-reads
// its data in the browser once the action returns (serverMutation).
function expireWebsiteCacheScope(scope: CacheScopeId, targetId: string | null) {
	switch (scope) {
		case "catalogue":
		case "all-public":
			expirePublicModelCatalogueCache();
			break;
		case "model":
			expirePublicModelCatalogueCache({ modelId: targetId });
			break;
		case "provider":
			revalidateProviderDataTags(
				targetId ? { providerId: targetId } : {}
			);
			break;
		case "organisation":
			revalidateOrganisationDataTags(
				targetId ? { organisationId: targetId } : {}
			);
			break;
		case "benchmark":
			revalidateBenchmarkDataTags(
				targetId ? { benchmarkId: targetId } : {}
			);
			break;
		case "apps":
			revalidateAppDataTags(targetId ? [targetId] : []);
			break;
		case "pricing":
			revalidateModelDataTags();
			break;
	}
}

export const purgeCacheScopeAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: {
		scope: CacheScopeId;
		targetId?: string;
	}) => input)
	.handler(async ({ data: input }): Promise<CachePurgeResult> => {
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) throw new Error("Your admin session is no longer available. Sign in again.");

		const result = await fetchInternalWebApi<CachePurgeResult>(
			"/api/internal/cache/purge",
			accessToken,
			{
				method: "POST",
				body: JSON.stringify(input),
			}
		);

		expireWebsiteCacheScope(input.scope, result.targetId);
		return result;
	});

export const refreshActionDockPageDataAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((pathname: string) => pathname)
	.handler(async ({ data: pathname }): Promise<CacheOpResult> => {
		return runAdminAction("Page data", async () => {
			const target = resolveActionDockPageRefresh(pathname);
			if (!target) {
				return { ok: false, message: "This page does not have refreshable data." };
			}

			// The open page re-reads its data in the browser even if the upstream cache purge fails.
			if (target.scope) {
				try {
					await purgeCacheScopeAction({ data: {
						scope: target.scope,
						...(target.targetId ? { targetId: target.targetId } : {}),
					} });
				} catch (error) {
					// Keep the website cache fresh when the Worker purge is unavailable.
					expireWebsiteCacheScope(target.scope, target.targetId ?? null);
					return {
						ok: false,
						message: `This page was refreshed, but its shared data cache could not be purged: ${error instanceof Error ? error.message : "request failed"}`,
					};
				}
			}

			return { ok: true, message: "Page data refreshed." };
		});
	});

export const revalidateModelsGlobalDataAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.handler(async (): Promise<CacheOpResult> => {
		return runAdminAction("Models (global data)", async () => {
			revalidateModelDataOnlyTags();
		});
	});

export const revalidatePublicModelCatalogueAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.handler(async (): Promise<CacheOpResult> => {
		return runAdminAction("Public catalogue", async () => {
			let webApiPurge: CachePurgeResult | null = null;
			let webApiPurgeError = "";
			try {
				webApiPurge = await purgeCacheScopeAction({ data: { scope: "catalogue" } });
			} catch (error) {
				webApiPurgeError = error instanceof Error ? error.message : "request failed";
				expirePublicModelCatalogueCache();
			}
			const gatewayPurge = await purgeGatewayCatalogueCache(["models"]);
			const webApiMessage = webApiPurge
				? `Web API cache purged (${webApiPurge.tags.join(", ")}).`
				: `Web API cache purge failed: ${webApiPurgeError}.`;
			return {
				ok: Boolean(webApiPurge) && gatewayPurge.ok,
				message: gatewayPurge.ok
					? `Public catalogue cache revalidated. ${webApiMessage} ${gatewayPurge.message}`
					: `Public catalogue website cache revalidated. ${webApiMessage} ${gatewayPurge.message}`,
			};
		});
	});

export const revalidateProvidersGlobalApiAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.handler(async (): Promise<CacheOpResult> => {
		return runAdminAction("Providers (global API info)", async () => {
			revalidateProviderDataTags();
		});
	});

export const revalidateProviderScopeAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: {
		providerId?: string;
	}) => input)
	.handler(async ({ data: input }): Promise<CacheOpResult> => {
		const providerId = input.providerId?.trim();
		if (input.providerId !== undefined && !providerId) {
			return { ok: false, message: "Provider ID is required." };
		}

		return runAdminAction(
			providerId ? `Provider (${providerId})` : "Providers (global)",
			async () => {
				if (providerId) {
					revalidateProviderDataTags({ providerId });
				} else {
					revalidateProviderDataTags();
				}
			}
		);
	});

export const revalidateOrganisationScopeAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: {
		organisationId?: string;
	}) => input)
	.handler(async ({ data: input }): Promise<CacheOpResult> => {
		const organisationId = input.organisationId?.trim();
		if (input.organisationId !== undefined && !organisationId) {
			return { ok: false, message: "Organisation ID is required." };
		}

		return runAdminAction(
			organisationId ? `Organisation (${organisationId})` : "Organisations (global)",
			async () => {
				if (organisationId) {
					revalidateOrganisationDataTags({ organisationId });
				} else {
					revalidateOrganisationDataTags();
				}
			}
		);
	});

export const revalidateGlobalModelAndProviderAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.handler(async (): Promise<CacheOpResult> => {
		return runAdminAction("Models + Providers (global)", async () => {
			revalidateModelDataTags();
		});
	});

export const revalidateAppsDataAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((appId?: string) => appId)
	.handler(async ({ data: appId }): Promise<CacheOpResult> => {
		const trimmedAppId = appId?.trim();
		if (appId !== undefined && !trimmedAppId) {
			return {
				ok: false,
				message: "App ID is required for single-app revalidation.",
			};
		}

		return runAdminAction(
			trimmedAppId ? `Apps (${trimmedAppId})` : "Apps (global)",
			async () => {
				revalidateAppDataTags(trimmedAppId ? [trimmedAppId] : []);
			}
		);
	});

export const revalidateModelScopeAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: {
		modelId: string;
		scope: "data" | "api" | "all";
	}) => input)
	.handler(async ({ data: input }): Promise<CacheOpResult> => {
		const modelId = input.modelId.trim();
		if (!modelId) {
			return { ok: false, message: "Model ID is required." };
		}

		try {
			let result: { ok: true; message: string };
			if (input.scope === "data") {
				result = await revalidateSingleModelDataAction({ data: modelId });
			} else if (input.scope === "api") {
				result = await revalidateSingleModelApiInfoAction({ data: modelId });
			} else {
				result = await revalidateSingleModelAllAction({ data: modelId });
			}
			return { ok: result.ok, message: result.message };
		} catch (error) {
			return {
				ok: false,
				message:
					error instanceof Error
						? `Model (${modelId}) failed: ${error.message}`
						: `Model (${modelId}) failed.`,
			};
		}
	});

export const revalidateBenchmarkScopeAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: {
		benchmarkId?: string;
	}) => input)
	.handler(async ({ data: input }): Promise<CacheOpResult> => {
		const benchmarkId = input.benchmarkId?.trim();
		if (input.benchmarkId !== undefined && !benchmarkId) {
			return { ok: false, message: "Benchmark ID is required." };
		}

		return runAdminAction(
			benchmarkId ? `Benchmark (${benchmarkId})` : "Benchmarks (global)",
			async () => {
				if (benchmarkId) {
					revalidateBenchmarkDataTags({ benchmarkId });
				} else {
					revalidateBenchmarkDataTags();
				}
			}
		);
	});

