import { createClient } from "@/utils/supabase/client";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";

type ResolveModelIdSource = "direct" | "redirect" | "alias" | "provider" | "unresolved";

export type ResolveCanonicalModelIdResult = {
	requestedModelId: string;
	canonicalModelId: string | null;
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

async function pickProviderCanonicalId(
	supabase: Awaited<ReturnType<typeof createClient>>,
	column: "model_id" | "api_model_id" | "internal_model_id" | "provider_model_slug",
	value: string,
): Promise<string | null> {
	const { data, error } = await supabase
		.from("data_api_provider_models")
		.select("model_id, api_model_id, is_active_gateway, updated_at")
		.eq(column, value)
		.order("is_active_gateway", { ascending: false })
		.order("updated_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error) return null;
	return (
		(typeof data?.model_id === "string" && data.model_id.trim()) ||
		(typeof data?.api_model_id === "string" && data.api_model_id.trim()) ||
		null
	);
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
			source: "unresolved",
		};
	}

	const supabase = await createClient();

	if (await modelExistsVisible(supabase, modelId, includeHidden)) {
		return {
			requestedModelId: modelId,
			canonicalModelId: modelId,
			source: "direct",
		};
	}

	try {
		const { data: redirectRow, error: redirectError } = await supabase
			.from("data_model_id_redirects")
			.select("model_id")
			.eq("legacy_model_id", modelId)
			.maybeSingle();
		if (!redirectError && redirectRow?.model_id) {
			const candidate = String(redirectRow.model_id).trim();
			if (await modelExistsVisible(supabase, candidate, includeHidden)) {
				return {
					requestedModelId: modelId,
					canonicalModelId: candidate,
					source: "redirect",
				};
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
		if (await modelExistsVisible(supabase, candidate, includeHidden)) {
			return {
				requestedModelId: modelId,
				canonicalModelId: candidate,
				source: "alias",
			};
		}
	}

	const providerCandidates = await Promise.all([
		pickProviderCanonicalId(supabase, "model_id", modelId),
		pickProviderCanonicalId(supabase, "api_model_id", modelId),
		pickProviderCanonicalId(supabase, "internal_model_id", modelId),
		pickProviderCanonicalId(supabase, "provider_model_slug", modelId),
	]);

	for (const candidateRaw of providerCandidates) {
		const candidate = String(candidateRaw ?? "").trim();
		if (!candidate) continue;
		if (await modelExistsVisible(supabase, candidate, includeHidden)) {
			return {
				requestedModelId: modelId,
				canonicalModelId: candidate,
				source: "provider",
			};
		}
	}

	return {
		requestedModelId: modelId,
		canonicalModelId: null,
		source: "unresolved",
	};
}
