"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import {
	revalidateAppDataTags,
	revalidateModelApiInfoTags,
	revalidateModelDataOnlyTags,
	revalidateModelDataTags,
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
] as const;

const LANDING_TAGS = [
	"landing:db-stats",
	"data:models",
	"data:organisations",
	"data:benchmarks",
	"data:api_providers",
	"gateway:marketing-metrics",
	"data:model-updates",
] as const;

const SIGN_IN_TAGS = [
	"data:sign-in:models",
	"data:sign-in:supported-models-stats",
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
] as const;

type CacheOpResult = {
	ok: boolean;
	message: string;
};

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
	});
}

export async function revalidateProvidersGlobalApiAction(): Promise<CacheOpResult> {
	return runAdminAction("Providers (global API info)", async () => {
		revalidateModelApiInfoTags();
		revalidateTag("collections", EXPIRE_NOW);
		revalidatePath("/api-providers");
		revalidatePath("/models");
		revalidatePath("/models/collections");
	});
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
