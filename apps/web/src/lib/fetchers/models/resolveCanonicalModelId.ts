import { createClient } from "@/utils/supabase/client";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";
import { cacheLife, cacheTag } from "next/cache";

type ResolveModelIdSource =
	| "direct"
	| "alias"
	| "api_model"
	| "provider_mapping"
	| "unresolved";

export type ResolveCanonicalModelIdResult = {
	requestedModelId: string;
	canonicalModelId: string | null;
	internalModelId: string | null;
	source: ResolveModelIdSource;
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

function isMissingRelationError(error: unknown): boolean {
	const text = String((error as { message?: unknown })?.message ?? "").toLowerCase();
	return (
		text.includes("does not exist") ||
		text.includes("could not find table") ||
		text.includes("relation")
	);
}

function normalizeId(value: unknown): string | null {
	const id = String(value ?? "").trim();
	return id.length > 0 ? id : null;
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
	return Array.from(
		new Set(ids.map((id) => normalizeId(id)).filter((id): id is string => Boolean(id))),
	);
}

function warnIfUnexpectedTableError(
	context: string,
	modelId: string,
	error: unknown,
): void {
	if (isMissingRelationError(error)) return;
	console.warn(`[resolveCanonicalModelId] ${context} failed`, { modelId, error });
}

async function getVisibleModelIds(
	supabase: SupabaseClient,
	modelIds: Array<string | null | undefined>,
	includeHidden: boolean,
): Promise<Set<string>> {
	const ids = uniqueIds(modelIds);
	if (ids.length === 0) return new Set<string>();

	const { data, error } = await applyHiddenFilter(
		supabase.from("data_models").select("model_id"),
		includeHidden,
	)
		.in("model_id", ids);

	if (error) return new Set<string>();

	return new Set(
		(data ?? [])
			.map((row: { model_id?: unknown }) => normalizeId(row?.model_id))
			.filter((id: string | null): id is string => Boolean(id)),
	);
}

async function apiModelExists(
	supabase: SupabaseClient,
	apiModelId: string,
): Promise<boolean> {
	const id = normalizeId(apiModelId);
	if (!id) return false;
	const { data, error } = await supabase
		.from("data_api_models")
		.select("api_model_id")
		.eq("api_model_id", id)
		.maybeSingle();
	if (error) return false;
	return normalizeId(data?.api_model_id) === id;
}

async function getMappedApiModelIdForInternalModel(
	supabase: SupabaseClient,
	internalModelId: string,
): Promise<string | null> {
	const id = normalizeId(internalModelId);
	if (!id) return null;
	const { data, error } = await supabase
		.from("data_api_provider_models")
		.select("api_model_id")
		.eq("model_id", id)
		.not("api_model_id", "is", null)
		.limit(1);
	if (error) return null;
	return normalizeId(data?.[0]?.api_model_id);
}

async function getMappedInternalModelIdsForApiModel(
	supabase: SupabaseClient,
	apiModelId: string,
): Promise<string[]> {
	const id = normalizeId(apiModelId);
	if (!id) return [];

	const { data, error } = await supabase
		.from("data_api_provider_models")
		.select("model_id")
		.eq("api_model_id", id)
		.not("model_id", "is", null);
	if (error) return [];
	return uniqueIds((data ?? []).map((row: { model_id?: unknown }) => normalizeId(row?.model_id)));
}

async function resolveVisibleInternalModelIdForCanonical(
	supabase: SupabaseClient,
	canonicalModelId: string,
	includeHidden: boolean,
): Promise<string | null> {
	const canonical = normalizeId(canonicalModelId);
	if (!canonical) return null;

	const directVisible = await getVisibleModelIds(
		supabase,
		[canonical],
		includeHidden,
	);
	if (directVisible.has(canonical)) {
		return canonical;
	}

	const candidates = await getMappedInternalModelIdsForApiModel(
		supabase,
		canonical,
	);
	if (candidates.length === 0) return null;
	if (includeHidden) return candidates[0] ?? null;

	const visibleCandidates = await getVisibleModelIds(
		supabase,
		candidates,
		includeHidden,
	);
	return candidates.find((candidate) => visibleCandidates.has(candidate)) ?? null;
}

async function resolveCanonicalModelIdUncached(
	requestedModelId: string,
	includeHidden: boolean,
): Promise<ResolveCanonicalModelIdResult> {
	const modelId = String(requestedModelId ?? "").trim();
	if (!modelId) {
		return {
			requestedModelId: modelId,
			canonicalModelId: null,
			internalModelId: null,
			source: "unresolved",
		};
	}

	const supabase = await createClient();
	const buildResult = async (
		canonicalModelId: string,
		source: ResolveModelIdSource,
		internalModelIdHint?: string | null,
	): Promise<ResolveCanonicalModelIdResult> => {
		const internalModelId =
			normalizeId(internalModelIdHint) ??
			(await resolveVisibleInternalModelIdForCanonical(
				supabase,
				canonicalModelId,
				includeHidden,
			));
		return {
			requestedModelId: modelId,
			canonicalModelId,
			internalModelId,
			source,
		};
	};

	const directVisible = await getVisibleModelIds(supabase, [modelId], includeHidden);
	if (directVisible.has(modelId)) {
		return buildResult(modelId, "direct", modelId);
	}

	const [aliasRes, apiModelRes, providerByApiRes] =
		await Promise.all([
			supabase
				.from("data_api_model_aliases")
				.select("api_model_id")
				.eq("alias_slug", modelId)
				.eq("is_enabled", true)
				.maybeSingle(),
			supabase
				.from("data_api_models")
				.select("api_model_id")
				.eq("api_model_id", modelId)
				.maybeSingle(),
			supabase
				.from("data_api_provider_models")
				.select("model_id, api_model_id, provider_api_model_id, provider_model_slug")
				.or(
					[
						`api_model_id.eq.${modelId}`,
						`provider_api_model_id.eq.${modelId}`,
						`provider_model_slug.eq.${modelId}`,
					].join(","),
				)
				.not("model_id", "is", null)
				.limit(1),
		]);

	if (aliasRes.error) {
		warnIfUnexpectedTableError("alias lookup", modelId, aliasRes.error);
	}
	if (apiModelRes.error) {
		warnIfUnexpectedTableError("api model lookup", modelId, apiModelRes.error);
	}
	if (providerByApiRes.error) {
		warnIfUnexpectedTableError(
			"provider mapping (by api model) lookup",
			modelId,
			providerByApiRes.error,
		);
	}

	const aliasCandidate = normalizeId(aliasRes.data?.api_model_id);
	if (aliasCandidate) {
		const [internalModelId, aliasApiExists] = await Promise.all([
			resolveVisibleInternalModelIdForCanonical(
				supabase,
				aliasCandidate,
				includeHidden,
			),
			aliasCandidate === modelId
				? Promise.resolve(normalizeId(apiModelRes.data?.api_model_id) === modelId)
				: apiModelExists(supabase, aliasCandidate),
		]);
		if (internalModelId || aliasApiExists) {
			return buildResult(aliasCandidate, "alias", internalModelId);
		}
	}

	if (normalizeId(apiModelRes.data?.api_model_id) === modelId) {
		return buildResult(modelId, "api_model");
	}

	const providerMappingCandidate = normalizeId(providerByApiRes.data?.[0]?.model_id);
	if (providerMappingCandidate) {
		return buildResult(providerMappingCandidate, "provider_mapping");
	}

	return {
		requestedModelId: modelId,
		canonicalModelId: null,
		internalModelId: null,
		source: "unresolved",
	};
}

async function resolveCanonicalModelIdCached(
	requestedModelId: string,
	includeHidden: boolean,
): Promise<ResolveCanonicalModelIdResult> {
	"use cache";

	cacheLife({
		stale: 60 * 60 * 24,
		revalidate: 60 * 60 * 24 * 7,
		expire: 60 * 60 * 24 * 30,
	});
	cacheTag("data:models");
	cacheTag("data:model_aliases");
	cacheTag("data:data_api_provider_models");
	cacheTag("data:data_api_models");
	cacheTag(`model:canonical:${requestedModelId}`);

	return resolveCanonicalModelIdUncached(requestedModelId, includeHidden);
}

export async function resolveCanonicalModelId(
	requestedModelId: string,
	includeHidden: boolean,
): Promise<ResolveCanonicalModelIdResult> {
	return resolveCanonicalModelIdCached(requestedModelId, includeHidden);
}
