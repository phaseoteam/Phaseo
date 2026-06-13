import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { isFreeRouterModelId } from "@/lib/models/freeRouter";
import { applyHiddenFilter } from "./visibility";
import { createAdminClient } from "@/utils/supabase/admin";

export type ModelPageNoticeTone = "info" | "warning" | "critical";

export type ModelPageNotice = {
	apiModelId: string;
	tone: ModelPageNoticeTone;
	markdown: string;
};

const ANTHROPIC_EXPORT_CONTROL_NOTICE_MARKDOWN =
	"Anthropic said on June 12, 2026 that it had to disable Fable 5 and Mythos 5 for all customers to comply with a U.S. export control directive. Requests to this model are currently expected to fail. [Read Anthropic's statement](https://www.anthropic.com/news/fable-mythos-access).";

const BUILTIN_MODEL_PAGE_NOTICES: Record<string, ModelPageNotice> = {
	"anthropic/claude-fable-5": {
		apiModelId: "anthropic/claude-fable-5",
		tone: "critical",
		markdown: ANTHROPIC_EXPORT_CONTROL_NOTICE_MARKDOWN,
	},
	"anthropic/claude-mythos-5": {
		apiModelId: "anthropic/claude-mythos-5",
		tone: "critical",
		markdown: ANTHROPIC_EXPORT_CONTROL_NOTICE_MARKDOWN,
	},
};

const modelPageNoticeSchema = z.object({
	apiModelId: z.string().min(1),
	tone: z.enum(["info", "warning", "critical"]),
	markdown: z.string().min(1),
});

function isMissingRelationError(error: unknown): boolean {
	const text = String((error as { message?: unknown })?.message ?? "").toLowerCase();
	return (
		text.includes("does not exist") ||
		text.includes("could not find table") ||
		text.includes("relation") ||
		text.includes("schema cache")
	);
}

function normalizeId(value: unknown): string | null {
	const normalized = String(value ?? "").trim();
	return normalized.length > 0 ? normalized : null;
}

function normalizeMarkdown(value: unknown): string | null {
	const normalized = String(value ?? "").trim();
	return normalized.length > 0 ? normalized : null;
}

export function parseModelPageNoticeRow(row: {
	api_model_id?: unknown;
	tone?: unknown;
	markdown?: unknown;
} | null | undefined): ModelPageNotice | null {
	const parsed = modelPageNoticeSchema.safeParse({
		apiModelId: normalizeId(row?.api_model_id),
		tone: normalizeId(row?.tone),
		markdown: normalizeMarkdown(row?.markdown),
	});

	if (!parsed.success) {
		return null;
	}

	return parsed.data;
}

export function getBuiltinModelPageNotice(
	apiModelId: string | null | undefined,
): ModelPageNotice | null {
	if (!apiModelId) return null;
	return BUILTIN_MODEL_PAGE_NOTICES[apiModelId] ?? null;
}

export async function resolveApiModelIdForModelPageUncached(
	modelId: string,
	includeHidden: boolean,
): Promise<string | null> {
	if (isFreeRouterModelId(modelId)) return null;

	const supabase = createAdminClient();
	const [apiModelRes, aliasRes, internalRes, providerRes] = await Promise.all([
		supabase
			.from("data_api_models")
			.select("api_model_id")
			.eq("api_model_id", modelId)
			.maybeSingle(),
		supabase
			.from("data_api_model_aliases")
			.select("api_model_id")
			.eq("alias_slug", modelId)
			.eq("is_enabled", true)
			.maybeSingle(),
		applyHiddenFilter(
			supabase.from("data_models").select("api_model_id"),
			includeHidden,
		)
			.eq("model_id", modelId)
			.maybeSingle(),
		supabase
			.from("data_api_provider_models")
			.select("api_model_id")
			.eq("model_id", modelId)
			.not("api_model_id", "is", null)
			.limit(1),
	]);

	return (
		normalizeId(apiModelRes.data?.api_model_id) ??
		normalizeId(aliasRes.data?.api_model_id) ??
		normalizeId(internalRes.data?.api_model_id) ??
		(internalRes.data ? normalizeId(modelId) : null) ??
		normalizeId(providerRes.data?.[0]?.api_model_id) ??
		null
	);
}

async function resolveApiModelIdForModelPage(
	modelId: string,
	includeHidden: boolean,
): Promise<string | null> {
	"use cache";

	cacheLife({
		stale: 60 * 60 * 24,
		revalidate: 60 * 60 * 24 * 7,
		expire: 60 * 60 * 24 * 30,
	});

	cacheTag("data:models");
	cacheTag("data:data_api_models");
	cacheTag("data:data_api_provider_models");
	cacheTag("data:model_aliases");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-notice");
	cacheTag(`model:notice:resolve:${modelId}`);

	return resolveApiModelIdForModelPageUncached(modelId, includeHidden);
}

async function getModelPageNoticeUncached(
	modelId: string,
	includeHidden: boolean,
): Promise<ModelPageNotice | null> {
	const apiModelId = await resolveApiModelIdForModelPage(modelId, includeHidden);
	if (!apiModelId) return null;
	const builtinNotice = getBuiltinModelPageNotice(apiModelId);

	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("data_api_model_page_notices")
		.select("api_model_id, tone, markdown")
		.eq("api_model_id", apiModelId)
		.maybeSingle();

	if (error) {
		if (isMissingRelationError(error)) return builtinNotice;
		throw new Error(error.message || "Failed to fetch model page notice");
	}

	return parseModelPageNoticeRow(data) ?? builtinNotice;
}

export async function getModelPageNotice(
	modelId: string,
	includeHidden: boolean,
): Promise<ModelPageNotice | null> {
	"use cache";

	cacheLife({
		stale: 60 * 60 * 24,
		revalidate: 60 * 60 * 24 * 7,
		expire: 60 * 60 * 24 * 30,
	});
	cacheTag("data:models");
	cacheTag("data:data_api_models");
	cacheTag("data:data_api_provider_models");
	cacheTag("data:model_aliases");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-notice");
	cacheTag(`model:notice:${modelId}`);

	return getModelPageNoticeUncached(modelId, includeHidden);
}
