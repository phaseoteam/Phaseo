// lib/fetchers/models/getModelOverviewHeader.ts
import { createClient } from "@/utils/supabase/client";
import { cacheLife, cacheTag } from "next/cache";
import { applyHiddenFilter } from "./visibility";

export interface ModelOverviewHeader {
	model_id: string;
	name: string;
	organisation_id: string;
	organisation: { name: string; country_code: string }; // not nullable
	family_id?: string; // optional, may be undefined
	hidden?: boolean;
}

function isMissingRelationError(error: unknown): boolean {
	const text = String((error as { message?: unknown })?.message ?? "").toLowerCase();
	return (
		text.includes("does not exist") ||
		text.includes("could not find table") ||
		text.includes("relation") ||
		text.includes("schema cache")
	);
}

export async function fetchModelOverviewHeader(
	modelId: string,
	includeHidden: boolean
): Promise<ModelOverviewHeader> {
	const supabase = await createClient();

	const query = applyHiddenFilter(
		supabase.from("data_models").select(
			`
            model_id,
            name,
            organisation_id,
            hidden,
            organisation:data_organisations!data_models_organisation_id_fkey ( name, country_code ),
			family_id
            `
		),
		includeHidden
	);
	const { data, error } = await query.eq("model_id", modelId).maybeSingle();

	console.log("[fetch] HIT DB for model header", modelId);

	if (error) throw error;
	if (!data) {
		const { data: internalVisibility } = await supabase
			.from("data_models")
			.select("hidden")
			.eq("model_id", modelId)
			.maybeSingle();
		if (!includeHidden && internalVisibility?.hidden) {
			throw new Error(`Model not found: ${modelId}`);
		}

		const { data: apiModelRow, error: apiModelError } = await supabase
			.from("data_api_models")
			.select("api_model_id, display_name, organisation_id")
			.eq("api_model_id", modelId)
			.maybeSingle();

		const { count: providerMappingCount, error: providerMappingError } =
			await supabase
				.from("data_api_provider_models")
				.select("provider_api_model_id", { count: "exact", head: true })
				.eq("api_model_id", modelId);

		if (providerMappingError) {
			throw new Error(`Model not found: ${modelId}`);
		}

		if (apiModelError && !isMissingRelationError(apiModelError)) {
			throw new Error(`Model not found: ${modelId}`);
		}

		const hasApiModel = Boolean(apiModelRow?.api_model_id);
		const hasProviderMapping = (providerMappingCount ?? 0) > 0;
		if (!hasApiModel && !hasProviderMapping) {
			throw new Error(`Model not found: ${modelId}`);
		}

		const fallbackOrganisationId = modelId.includes("/")
			? modelId.split("/")[0].trim()
			: "";
		const resolvedApiModelId = apiModelRow?.api_model_id ?? modelId;
		const resolvedOrganisationId =
			apiModelRow?.organisation_id ?? fallbackOrganisationId;
		if (!resolvedApiModelId || !resolvedOrganisationId) {
			throw new Error(`Model not found: ${modelId}`);
		}

		let organisationName = resolvedOrganisationId;
		let organisationCountryCode = "";
		if (resolvedOrganisationId) {
			const { data: organisationRow } = await supabase
				.from("data_organisations")
				.select("name, country_code")
				.eq("organisation_id", resolvedOrganisationId)
				.maybeSingle();
			organisationName =
				organisationRow?.name ?? resolvedOrganisationId;
			organisationCountryCode = organisationRow?.country_code ?? "";
		}

		return {
			model_id: resolvedApiModelId,
			name: apiModelRow?.display_name ?? resolvedApiModelId,
			organisation_id: resolvedOrganisationId,
			organisation: {
				name: organisationName ?? "Unknown",
				country_code: organisationCountryCode,
			},
			hidden: false,
		};
	}

	const rawOrg = Array.isArray((data as any).organisation)
		? (data as any).organisation[0]
		: (data as any).organisation;

	if (!rawOrg) {
		throw new Error(`Organisation not found for model ${modelId}`);
	}

	return {
		model_id: data.model_id,
		name: data.name,
		organisation_id: data.organisation_id,
		organisation: rawOrg as { name: string; country_code: string },
		family_id: data.family_id || undefined,
		hidden: Boolean((data as any).hidden),
	};
}

// --- Cached wrapper (default export) ---
// capture modelId in both key and tags to retain the per-ID tag
export default async function getModelOverviewHeader(
	modelId: string,
	includeHidden: boolean
): Promise<ModelOverviewHeader> {
	"use cache";

	cacheLife("days");
	cacheTag("data:models");
	cacheTag(`model:data:${modelId}`);
	cacheTag(`model:header:${modelId}`);

	console.log("[cache] COMPUTE getModelOverviewHeader", modelId);
	return fetchModelOverviewHeader(modelId, includeHidden);
}
