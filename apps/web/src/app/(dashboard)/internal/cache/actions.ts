"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import {
	revalidateAppDataTags,
	revalidateBenchmarkDataTags,
	revalidateModelDataOnlyTags,
	revalidateModelDataTags,
	revalidateOrganisationDataTags,
	revalidateProviderDataTags,
} from "@/lib/cache/revalidateDataTags";
import { createClient } from "@/utils/supabase/server";
import {
	revalidateSingleModelAllAction,
	revalidateSingleModelApiInfoAction,
	revalidateSingleModelDataAction,
} from "@/app/(dashboard)/internal/data/actions";

const EXPIRE_NOW = { expire: 0 } as const;

const SEARCH_TAGS = [
	"search:data",
	"data:models",
	"data:organisations",
	"data:benchmarks",
	"data:api_providers",
	"data:subscription_plans",
	"frontend:subscription-plans",
	"public-model-catalogue",
] as const;

const LANDING_TAGS = [
	"landing:db-stats",
	"frontend:landing-stats",
	"frontend:gateway-showcase",
	"data:models",
	"data:organisations",
	"data:benchmarks",
	"data:api_providers",
	"gateway:marketing-metrics",
	"data:model-updates",
	"frontend:model-updates",
	"frontend:model-update-cards",
	"frontend:update-cards",
	"frontend:og-payload",
	"og:payload",
] as const;

const SIGN_IN_TAGS = [
	"data:sign-in:models",
	"data:sign-in:supported-models-stats",
	"frontend:sign-in-main-models",
	"frontend:sign-in-supported-models-stats",
	"data:models",
] as const;

const RANKINGS_TAGS = [
	"public-rankings",
	"public-performance",
	"public-market-share",
	"public-timeseries",
	"public-market-share-timeseries",
	"public-reliability",
	"public-geography",
	"public-multimodal",
	"public-top-apps",
	"frontend:rankings",
	"frontend:rankings-indexability",
	"frontend:rankings-performance",
	"frontend:rankings-market-share",
	"frontend:rankings-market-share-timeseries",
	"frontend:rankings-timeseries",
	"frontend:model-rankings",
	"frontend:model-names",
	"frontend:provider-names",
	"frontend:provider-meta",
	"frontend:organisation-logo-ids",
] as const;

const APP_FRONTEND_TAGS = [
	"data:public_apps",
	"data:app_details",
	"data:app_usage",
	"data:apps",
	"frontend:apps",
	"frontend:app-details",
	"frontend:app-usage",
	"frontend:app-images",
	"frontend:app-rankings",
	"frontend:app-provider-model-mappings",
	"frontend:model-leaderboard-meta",
] as const;

const COUNTRY_FRONTEND_TAGS = [
	"public-model-catalogue",
	"frontend:countries",
	"data:organisations",
	"data:models",
] as const;

const PROFILE_FRONTEND_TAGS = [
	"frontend:profile",
	"data:profiles",
] as const;

type CacheOpResult = {
	ok: boolean;
	message: string;
};

function revalidateFrontendModelApiPaths(modelId: string) {
	revalidatePath(`/api/frontend/models/${modelId}/header`);
	revalidatePath(`/api/frontend/models/${modelId}/notice`);
	revalidatePath(`/api/frontend/models/${modelId}/canonical`);
	revalidatePath(`/api/frontend/models/${modelId}/pending-api-release`);
	revalidatePath(`/api/frontend/models/${modelId}/overview`);
	revalidatePath(`/api/frontend/models/${modelId}/pricing`);
	revalidatePath(`/api/frontend/models/${modelId}/pricing-history`);
	revalidatePath(`/api/frontend/models/${modelId}/subscription-plans`);
	revalidatePath(`/api/frontend/models/${modelId}/gateway-metadata`);
	revalidatePath(`/api/frontend/models/${modelId}/timeline`);
	revalidatePath(`/api/frontend/models/${modelId}/apps`);
	revalidatePath(`/api/frontend/models/${modelId}/performance`);
	revalidatePath(`/api/frontend/models/${modelId}/activity`);
	revalidatePath(`/api/frontend/models/${modelId}/token-trajectory`);
	revalidatePath(`/api/frontend/models/${modelId}/realtime-window`);
	revalidatePath(`/api/frontend/models/${modelId}/runtime-stats`);
	revalidatePath(`/api/frontend/models/${modelId}/routing-health`);
	revalidatePath(`/api/frontend/models/${modelId}/benchmark-highlights`);
}

async function requireAdmin() {
	const supabase = await createClient();
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();
	if (authError || !user) throw new Error("Unauthorized");

	const { data: userRow, error: userError } = await supabase
		.from("users")
		.select("role")
		.eq("user_id", user.id)
		.maybeSingle();

	if (userError || (userRow?.role ?? "").toLowerCase() !== "admin") {
		throw new Error("Unauthorized");
	}
}

function sanitizeList(input: string): string[] {
	return input
		.split(/[,\n]/g)
		.map((item) => item.trim())
		.filter(Boolean);
}

async function runAdminAction(
	label: string,
	fn: () => Promise<void> | void
): Promise<CacheOpResult> {
	try {
		await requireAdmin();
		await fn();
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

export async function revalidateModelsGlobalDataAction(): Promise<CacheOpResult> {
	return runAdminAction("Models (global data)", async () => {
		revalidateModelDataOnlyTags();
		revalidateTag("collections", EXPIRE_NOW);
		revalidatePath("/models");
		revalidatePath("/models/collections");
		revalidatePath("/monitor");
		revalidatePath("/api/frontend/models");
		revalidatePath("/api/frontend/models/collections");
		revalidatePath("/api/frontend/models/monitor");
		revalidatePath("/api/frontend/models/free-router");
		revalidatePath("/api/frontend/monitor/history");
		revalidatePath("/api/frontend/countries");
	});
}

export async function revalidatePublicModelCatalogueAction(): Promise<CacheOpResult> {
	return runAdminAction("Public catalogue", async () => {
		revalidateModelDataTags();
		for (const tag of APP_FRONTEND_TAGS) {
			revalidateTag(tag, EXPIRE_NOW);
		}
		revalidateTag("collections", EXPIRE_NOW);
		revalidatePath("/models");
		revalidatePath("/models/collections");
		revalidatePath("/monitor");
		revalidatePath("/compare");
		revalidatePath("/api-providers");
		revalidatePath("/api/frontend/models");
		revalidatePath("/api/frontend/models/collections");
		revalidatePath("/api/frontend/models/monitor");
		revalidatePath("/api/frontend/models/free-router");
		revalidatePath("/api/frontend/monitor/history");
		revalidatePath("/api/frontend/compare/models");
		revalidatePath("/api/frontend/compare/models/details");
		revalidatePath("/api/frontend/models/leaderboard-meta");
		revalidatePath("/api/frontend/api-providers");
		revalidatePath("/api/frontend/gateway-models");
		revalidatePath("/api/frontend/organisations");
		revalidatePath("/api/frontend/benchmarks");
		revalidatePath("/api/frontend/families");
		revalidatePath("/api/frontend/subscription-plans");
		revalidatePath("/api/frontend/countries");
		revalidatePath("/apps");
		revalidatePath("/api/frontend/apps/public-ids");
		revalidatePath("/api/frontend/apps/images");
		revalidatePath("/api/frontend/apps/rankings/top");
		revalidatePath("/api/frontend/apps/rankings/trending");
		revalidatePath("/api/frontend/apps/indexability");
		revalidatePath("/api/frontend/rankings/indexability");
		revalidatePath("/api/frontend/rankings/performance");
		revalidatePath("/api/frontend/rankings/market-share");
		revalidatePath("/api/frontend/rankings/market-share-timeseries");
		revalidatePath("/api/frontend/rankings/timeseries");
		revalidatePath("/api/frontend/rankings/model-rankings");
		revalidatePath("/api/frontend/rankings/model-names");
		revalidatePath("/api/frontend/rankings/provider-names");
		revalidatePath("/api/frontend/rankings/provider-meta");
		revalidatePath("/api/frontend/rankings/organisation-logo-ids");
		revalidatePath("/api/frontend/pricing/models");
		revalidatePath("/api/frontend/gateway/marketplace/presets");
		revalidatePath("/api/frontend/landing/stats");
		revalidatePath("/api/frontend/landing/gateway-showcase");
		revalidatePath("/api/frontend/updates/web");
		revalidatePath("/api/frontend/updates/youtube");
		revalidatePath("/api/frontend/updates/models");
		revalidatePath("/api/frontend/updates/cards");
		revalidatePath("/api/frontend/updates/model-cards");
	});
}

export async function revalidateProvidersGlobalApiAction(): Promise<CacheOpResult> {
	return runAdminAction("Providers (global API info)", async () => {
		revalidateProviderDataTags();
		revalidateTag("collections", EXPIRE_NOW);
		revalidatePath("/api-providers");
		revalidatePath("/models");
		revalidatePath("/models/collections");
		revalidatePath("/api/frontend/api-providers");
		revalidatePath("/api/frontend/gateway-models");
	});
}

export async function revalidateProviderScopeAction(input: {
	providerId?: string;
}): Promise<CacheOpResult> {
	const providerId = input.providerId?.trim();
	if (input.providerId !== undefined && !providerId) {
		return { ok: false, message: "Provider ID is required." };
	}

	return runAdminAction(
		providerId ? `Provider (${providerId})` : "Providers (global)",
		async () => {
			if (providerId) {
				revalidateProviderDataTags({ providerId });
				revalidatePath(`/api-providers/${providerId}`);
				revalidatePath(`/api-providers/${providerId}/models`);
				revalidatePath(`/api/frontend/api-providers/${providerId}/header`);
				revalidatePath(`/api/frontend/api-providers/${providerId}/models`);
				revalidatePath(`/api/frontend/api-providers/${providerId}/top-apps`);
				revalidatePath(`/api/frontend/api-providers/${providerId}/top-models`);
				revalidatePath(
					`/api/frontend/api-providers/${providerId}/model-token-timeseries`,
				);
				revalidatePath(
					`/api/frontend/api-providers/${providerId}/app-token-timeseries`,
				);
				revalidatePath(`/api/frontend/api-providers/${providerId}/metrics`);
				revalidatePath(`/api/frontend/api-providers/${providerId}/updates`);
			} else {
				revalidateProviderDataTags();
			}
			revalidatePath("/api-providers");
		}
	);
}

export async function revalidateOrganisationScopeAction(input: {
	organisationId?: string;
}): Promise<CacheOpResult> {
	const organisationId = input.organisationId?.trim();
	if (input.organisationId !== undefined && !organisationId) {
		return { ok: false, message: "Organisation ID is required." };
	}

	return runAdminAction(
		organisationId ? `Organisation (${organisationId})` : "Organisations (global)",
		async () => {
			if (organisationId) {
				revalidateOrganisationDataTags({ organisationId });
				revalidatePath(`/organisations/${organisationId}`);
				revalidatePath(`/organisations/${organisationId}/models`);
				revalidatePath(`/api/frontend/organisations/${organisationId}/header`);
				revalidatePath(`/api/frontend/organisations/${organisationId}`);
				revalidatePath(`/api/frontend/organisations/${organisationId}/models`);
				revalidatePath(
					`/api/frontend/updates/organisations/${organisationId}/releases`,
				);
			} else {
				revalidateOrganisationDataTags();
			}
			revalidatePath("/organisations");
			revalidatePath("/api/frontend/organisations");
			revalidatePath("/api/frontend/countries");
		}
	);
}

export async function revalidateGlobalModelAndProviderAction(): Promise<CacheOpResult> {
	return runAdminAction("Models + Providers (global)", async () => {
		revalidateModelDataTags();
		revalidateTag("collections", EXPIRE_NOW);
		revalidatePath("/models");
		revalidatePath("/models/collections");
		revalidatePath("/api-providers");
	});
}

export async function revalidateSearchDataAction(): Promise<CacheOpResult> {
	return runAdminAction("Search", async () => {
		for (const tag of SEARCH_TAGS) {
			revalidateTag(tag, EXPIRE_NOW);
		}
		revalidatePath("/search");
		revalidatePath("/api/frontend/search");
	});
}

export async function revalidateLandingDataAction(): Promise<CacheOpResult> {
	return runAdminAction("Landing", async () => {
		for (const tag of LANDING_TAGS) {
			revalidateTag(tag, EXPIRE_NOW);
		}
		revalidatePath("/");
	});
}

export async function revalidateSignInCatalogAction(): Promise<CacheOpResult> {
	return runAdminAction("Sign-in catalog", async () => {
		for (const tag of SIGN_IN_TAGS) {
			revalidateTag(tag, EXPIRE_NOW);
		}
		revalidatePath("/sign-in");
		revalidatePath("/api/frontend/sign-in/main-models");
		revalidatePath("/api/frontend/sign-in/supported-models-stats");
	});
}

export async function revalidateRankingsAction(): Promise<CacheOpResult> {
	return runAdminAction("Rankings", async () => {
		for (const tag of RANKINGS_TAGS) {
			revalidateTag(tag, EXPIRE_NOW);
		}
		revalidatePath("/rankings");
	});
}

export async function revalidateAppsDataAction(
	appId?: string
): Promise<CacheOpResult> {
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
			revalidatePath("/settings/apps");
			revalidatePath("/rankings");
			if (trimmedAppId) {
				revalidatePath(`/apps/${trimmedAppId}`);
			}
		}
	);
}

export async function revalidateCountryDataAction(
	iso?: string
): Promise<CacheOpResult> {
	const trimmedIso = iso?.trim().toUpperCase();
	if (iso !== undefined && !trimmedIso) {
		return {
			ok: false,
			message: "Country ISO code is required for single-country revalidation.",
		};
	}

	return runAdminAction(
		trimmedIso ? `Country (${trimmedIso})` : "Countries (global)",
		async () => {
			for (const tag of COUNTRY_FRONTEND_TAGS) {
				revalidateTag(tag, EXPIRE_NOW);
			}
			revalidatePath("/countries");
			revalidatePath("/api/frontend/countries");
			if (trimmedIso) {
				revalidateTag(`frontend:countries:${trimmedIso}`, EXPIRE_NOW);
				revalidatePath(`/countries/${trimmedIso.toLowerCase()}`);
				revalidatePath(`/countries/${trimmedIso.toLowerCase()}/models`);
				revalidatePath(`/api/frontend/countries/${trimmedIso}`);
			}
		}
	);
}

export async function revalidateProfileDataAction(
	slug?: string
): Promise<CacheOpResult> {
	const trimmedSlug = slug?.trim();
	if (slug !== undefined && !trimmedSlug) {
		return {
			ok: false,
			message: "Profile slug is required for single-profile revalidation.",
		};
	}

	return runAdminAction(
		trimmedSlug ? `Profile (${trimmedSlug})` : "Profiles (global)",
		async () => {
			for (const tag of PROFILE_FRONTEND_TAGS) {
				revalidateTag(tag, EXPIRE_NOW);
			}
			if (trimmedSlug) {
				revalidateTag(`frontend:profile:${trimmedSlug}`, EXPIRE_NOW);
				revalidatePath(`/profile/${trimmedSlug}`);
				revalidatePath(`/api/frontend/profile/${trimmedSlug}`);
			}
		}
	);
}

export async function revalidateModelScopeAction(input: {
	modelId: string;
	scope: "data" | "api" | "all";
}): Promise<CacheOpResult> {
	const modelId = input.modelId.trim();
	if (!modelId) {
		return { ok: false, message: "Model ID is required." };
	}

	try {
		let result: { ok: true; message: string };
		if (input.scope === "data") {
			result = await revalidateSingleModelDataAction(modelId);
		} else if (input.scope === "api") {
			result = await revalidateSingleModelApiInfoAction(modelId);
		} else {
			result = await revalidateSingleModelAllAction(modelId);
		}
		revalidateFrontendModelApiPaths(modelId);
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
}

export async function revalidateBenchmarkScopeAction(input: {
	benchmarkId?: string;
}): Promise<CacheOpResult> {
	const benchmarkId = input.benchmarkId?.trim();
	if (input.benchmarkId !== undefined && !benchmarkId) {
		return { ok: false, message: "Benchmark ID is required." };
	}

	return runAdminAction(
		benchmarkId ? `Benchmark (${benchmarkId})` : "Benchmarks (global)",
		async () => {
			if (benchmarkId) {
				revalidateBenchmarkDataTags({ benchmarkId });
				revalidatePath(`/benchmarks/${benchmarkId}`);
				revalidatePath(`/api/frontend/benchmarks/${benchmarkId}`);
			} else {
				revalidateBenchmarkDataTags();
			}
			revalidatePath("/benchmarks");
			revalidatePath("/api/frontend/benchmarks");
		}
	);
}

export async function revalidateCustomScopeAction(input: {
	tagsText: string;
	pathsText: string;
}): Promise<CacheOpResult> {
	const tags = sanitizeList(input.tagsText);
	const paths = sanitizeList(input.pathsText);

	if (!tags.length && !paths.length) {
		return { ok: false, message: "Provide at least one tag or path." };
	}

	if (tags.length > 100 || paths.length > 100) {
		return {
			ok: false,
			message: "Too many tags/paths (max 100 each).",
		};
	}

	return runAdminAction("Custom scope", async () => {
		for (const tag of tags) {
			revalidateTag(tag, EXPIRE_NOW);
		}
		for (const path of paths) {
			revalidatePath(path);
		}
	});
}
