import { createClient } from "@/utils/supabase/client";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";

type ResolveModelIdSource =
	| "direct"
	| "redirect"
	| "alias"
	| "api_model"
	| "provider_mapping"
	| "legacy_internal_mapping"
	| "unresolved";

export type ResolveCanonicalModelIdResult = {
	requestedModelId: string;
	canonicalModelId: string | null;
	internalModelId: string | null;
	source: ResolveModelIdSource;
};

function isMissingRelationError(error: unknown): boolean {
	const text = String((error as { message?: unknown })?.message ?? "").toLowerCase();
	return (
		text.includes("does not exist") ||
		text.includes("could not find table") ||
		text.includes("relation")
	);
}

async function modelExistsVisible(
	supabase: Awaited<ReturnType<typeof createClient>>,
	modelId: string,
	includeHidden: boolean,
): Promise<boolean> {
	if (!modelId) return false;
	const { data, error } = await applyHiddenFilter(
		supabase.from("data_models").select("model_id, hidden"),
		includeHidden,
	)
		.eq("model_id", modelId)
		.maybeSingle();

	if (error) return false;
	return Boolean(data?.model_id);
}

async function apiModelExists(
	supabase: Awaited<ReturnType<typeof createClient>>,
	apiModelId: string,
): Promise<boolean> {
	if (!apiModelId) return false;
	const { data, error } = await supabase
		.from("data_api_models")
		.select("api_model_id")
		.eq("api_model_id", apiModelId)
		.maybeSingle();
	if (error) return false;
	return Boolean(data?.api_model_id);
}

async function providerMappingExistsForApiModel(
	supabase: Awaited<ReturnType<typeof createClient>>,
	apiModelId: string,
): Promise<boolean> {
	if (!apiModelId) return false;
	const { data, error } = await supabase
		.from("data_api_provider_models")
		.select("provider_api_model_id")
		.eq("api_model_id", apiModelId)
		.limit(1);
	if (error) return false;
	return Array.isArray(data) && data.length > 0;
}

async function resolveApiModelIdFromInternalModelId(
	supabase: Awaited<ReturnType<typeof createClient>>,
	internalModelId: string,
): Promise<string | null> {
	if (!internalModelId) return null;
	const { data, error } = await supabase
		.from("data_api_provider_models")
		.select("api_model_id")
		.eq("model_id", internalModelId)
		.not("api_model_id", "is", null);
	if (error) return null;
	return (
		Array.from(
			new Set(
				(data ?? [])
					.map((row: any) => String(row?.api_model_id ?? "").trim())
					.filter(Boolean),
			),
		)[0] ?? null
	);
}

async function resolveVisibleInternalModelIdForApiModel(
	supabase: Awaited<ReturnType<typeof createClient>>,
	apiModelId: string,
	includeHidden: boolean,
): Promise<string | null> {
	if (!apiModelId) return null;

	if (await modelExistsVisible(supabase, apiModelId, includeHidden)) {
		return apiModelId;
	}

	const { data, error } = await supabase
		.from("data_api_provider_models")
		.select("model_id")
		.eq("api_model_id", apiModelId)
		.not("model_id", "is", null);

	if (error) return null;

	const candidates = Array.from(
		new Set(
			(data ?? [])
				.map((row: any) => String(row?.model_id ?? "").trim())
				.filter(Boolean),
		),
	);

	for (const candidate of candidates) {
		if (includeHidden) return candidate;
		if (await modelExistsVisible(supabase, candidate, includeHidden)) {
			return candidate;
		}
	}

	return null;
}

export async function resolveCanonicalModelId(
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
	): Promise<ResolveCanonicalModelIdResult> => {
		const internalModelId = await resolveVisibleInternalModelIdForApiModel(
			supabase,
			canonicalModelId,
			includeHidden,
		);
		return {
			requestedModelId: modelId,
			canonicalModelId,
			internalModelId,
			source,
		};
	};

	if (await modelExistsVisible(supabase, modelId, includeHidden)) {
		return buildResult(modelId, "direct");
	}

	try {
		const { data: redirectRow, error: redirectError } = await supabase
			.from("data_model_id_redirects")
			.select("model_id")
			.eq("legacy_model_id", modelId)
			.maybeSingle();

		if (!redirectError && redirectRow?.model_id) {
			const candidate = String(redirectRow.model_id).trim();
			const mappedApiModelId = await resolveApiModelIdFromInternalModelId(
				supabase,
				candidate,
			);
			if (mappedApiModelId) {
				return buildResult(mappedApiModelId, "redirect");
			}
			if (await apiModelExists(supabase, candidate)) {
				return buildResult(candidate, "redirect");
			}
			if (await modelExistsVisible(supabase, candidate, includeHidden)) {
				return buildResult(candidate, "redirect");
			}
		}
	} catch (error) {
		if (!isMissingRelationError(error)) {
			console.warn("[resolveCanonicalModelId] redirect lookup failed", {
				modelId,
				error,
			});
		}
	}

	const { data: aliasRow, error: aliasError } = await supabase
		.from("data_api_model_aliases")
		.select("api_model_id")
		.eq("alias_slug", modelId)
		.eq("is_enabled", true)
		.maybeSingle();

	if (!aliasError && aliasRow?.api_model_id) {
		const candidate = String(aliasRow.api_model_id).trim();
		const internalModelId = await resolveVisibleInternalModelIdForApiModel(
			supabase,
			candidate,
			includeHidden,
		);
		if (internalModelId || (await apiModelExists(supabase, candidate))) {
			return buildResult(candidate, "alias");
		}
	}

	if (await apiModelExists(supabase, modelId)) {
		return buildResult(modelId, "api_model");
	}

	if (await providerMappingExistsForApiModel(supabase, modelId)) {
		return buildResult(modelId, "provider_mapping");
	}

	const mappedApiModelId = await resolveApiModelIdFromInternalModelId(
		supabase,
		modelId,
	);
	if (mappedApiModelId) {
		return buildResult(mappedApiModelId, "legacy_internal_mapping");
	}

	return {
		requestedModelId: modelId,
		canonicalModelId: null,
		internalModelId: null,
		source: "unresolved",
	};
}
