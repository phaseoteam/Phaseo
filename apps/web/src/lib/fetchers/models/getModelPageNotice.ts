import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { isFreeRouterModelId } from "@/lib/models/freeRouter";
import { createClient } from "@/utils/supabase/client";
import { applyHiddenFilter } from "./visibility";

export type ModelPageNoticeTone = "info" | "warning" | "critical";

export type ModelPageNotice = {
	apiModelId: string;
	tone: ModelPageNoticeTone;
	markdown: string;
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

async function resolveApiModelIdForModelPageUncached(
	modelId: string,
	includeHidden: boolean,
): Promise<string | null> {
	if (isFreeRouterModelId(modelId)) return null;

	const supabase = await createClient();
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
	cacheTag(`model:notice:resolve:${modelId}`);

	return resolveApiModelIdForModelPageUncached(modelId, includeHidden);
}

async function getModelPageNoticeUncached(
	modelId: string,
	includeHidden: boolean,
): Promise<ModelPageNotice | null> {
	const apiModelId = await resolveApiModelIdForModelPage(modelId, includeHidden);
	if (!apiModelId) return null;

	const supabase = await createClient();
	const { data, error } = await supabase
		.from("data_api_model_page_notices")
		.select("api_model_id, tone, markdown")
		.eq("api_model_id", apiModelId)
		.maybeSingle();

	if (error) {
		if (isMissingRelationError(error)) return null;
		throw new Error(error.message || "Failed to fetch model page notice");
	}

	return parseModelPageNoticeRow(data);
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

	cacheTag("data:data_api_model_page_notices");
	cacheTag(`model:notice:${modelId}`);

	return getModelPageNoticeUncached(modelId, includeHidden);
}
