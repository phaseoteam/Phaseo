// lib/fetchers/models/getModelOverviewHeader.ts
import { cacheLife, cacheTag } from "next/cache";
import { applyHiddenFilter } from "./visibility";
import { createAdminClient } from "@/utils/supabase/admin";
import {
	FREE_ROUTER_MODEL_ID,
	FREE_ROUTER_NAME,
	FREE_ROUTER_ORGANISATION_ID,
	isFreeRouterModelId,
} from "@/lib/models/freeRouter";

export interface ModelOverviewHeader {
	model_id: string;
	name: string;
	organisation_id: string;
	organisation: { name: string; country_code: string };
	aliases: string[];
	family_id?: string;
	status?: string | null;
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

function normalizeId(value: unknown): string | null {
	const normalized = String(value ?? "").trim();
	return normalized.length > 0 ? normalized : null;
}

function organisationFromModelId(modelId: string | null | undefined): string | null {
	const normalized = normalizeId(modelId);
	if (!normalized || !normalized.includes("/")) return null;
	const [organisationId] = normalized.split("/", 1);
	return normalizeId(organisationId);
}

async function fetchAliasesForApiModel(
	supabase: ReturnType<typeof createAdminClient>,
	apiModelId: string | null | undefined,
): Promise<string[]> {
	const normalizedApiModelId = normalizeId(apiModelId);
	if (!normalizedApiModelId) return [];

	const { data, error } = await supabase
		.from("data_api_model_aliases")
		.select("alias_slug")
		.eq("api_model_id", normalizedApiModelId)
		.eq("is_enabled", true)
		.order("alias_slug", { ascending: true });

	if (error) {
		if (!isMissingRelationError(error)) throw error;
		return [];
	}

	return Array.from(
		new Set(
			(data ?? [])
				.map((row: { alias_slug?: unknown }) => normalizeId(row?.alias_slug))
				.filter((alias): alias is string => Boolean(alias))
				.filter((alias) => alias !== normalizedApiModelId),
		),
	).sort((left, right) => left.localeCompare(right));
}

export async function fetchModelOverviewHeader(
	modelId: string,
	includeHidden: boolean
): Promise<ModelOverviewHeader> {
	if (isFreeRouterModelId(modelId)) {
		return {
			model_id: FREE_ROUTER_MODEL_ID,
			name: FREE_ROUTER_NAME,
			organisation_id: FREE_ROUTER_ORGANISATION_ID,
			organisation: {
				name: "Phaseo",
				country_code: "",
			},
			aliases: [],
			status: "Available",
			hidden: false,
		};
	}

	const supabase = createAdminClient();

	const query = applyHiddenFilter(
		supabase.from("data_models").select(
			`
            model_id,
            name,
            status,
            organisation_id,
            hidden,
            organisation:data_organisations!data_models_organisation_id_fkey ( name, country_code ),
			family_id
            `
		),
		includeHidden
	);
	const { data, error } = await query.eq("model_id", modelId).maybeSingle();

	if (error) throw error;
	if (!data) {
		const [internalVisibilityRes, apiModelRes, providerByApiRes, providerByModelRes] =
			await Promise.all([
				supabase
					.from("data_models")
					.select("hidden")
					.eq("model_id", modelId)
					.maybeSingle(),
				supabase
					.from("data_api_models")
					.select("api_model_id, display_name, organisation_id")
					.eq("api_model_id", modelId)
					.maybeSingle(),
				supabase
					.from("data_api_provider_models")
					.select("model_id")
					.eq("api_model_id", modelId)
					.not("model_id", "is", null)
					.limit(1),
				supabase
					.from("data_api_provider_models")
					.select("api_model_id")
					.eq("model_id", modelId)
					.not("api_model_id", "is", null)
					.limit(1),
			]);

		if (internalVisibilityRes.error) {
			throw new Error(internalVisibilityRes.error.message ?? `Model not found: ${modelId}`);
		}
		if (!includeHidden && internalVisibilityRes.data?.hidden) {
			throw new Error(`Model not found: ${modelId}`);
		}

		if (providerByApiRes.error) {
			throw new Error(providerByApiRes.error.message ?? `Model not found: ${modelId}`);
		}
		if (providerByModelRes.error) {
			throw new Error(providerByModelRes.error.message ?? `Model not found: ${modelId}`);
		}

		if (apiModelRes.error && !isMissingRelationError(apiModelRes.error)) {
			throw new Error(apiModelRes.error.message ?? `Model not found: ${modelId}`);
		}

		const hasApiModel = Boolean(normalizeId(apiModelRes.data?.api_model_id));
		const hasProviderMapping =
			(providerByApiRes.data?.length ?? 0) > 0 ||
			(providerByModelRes.data?.length ?? 0) > 0;
		if (!hasApiModel && !hasProviderMapping) {
			throw new Error(`Model not found: ${modelId}`);
		}

		const resolvedApiModelId =
			normalizeId(apiModelRes.data?.api_model_id) ??
			normalizeId(providerByModelRes.data?.[0]?.api_model_id) ??
			modelId;
		const fallbackOrganisationId =
			organisationFromModelId(modelId) ??
			organisationFromModelId(resolvedApiModelId) ??
			organisationFromModelId(providerByApiRes.data?.[0]?.model_id);
		const resolvedOrganisationId =
			normalizeId(apiModelRes.data?.organisation_id) ?? fallbackOrganisationId;
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
			organisationName = organisationRow?.name ?? resolvedOrganisationId;
			organisationCountryCode = organisationRow?.country_code ?? "";
		}
		const aliases = await fetchAliasesForApiModel(supabase, resolvedApiModelId);

		return {
			model_id: resolvedApiModelId,
			name: normalizeId(apiModelRes.data?.display_name) ?? resolvedApiModelId,
			organisation_id: resolvedOrganisationId,
			organisation: {
				name: organisationName ?? "Unknown",
				country_code: organisationCountryCode,
			},
			aliases,
			status: null,
			hidden: false,
		};
	}

	const rawOrg = Array.isArray((data as any).organisation)
		? (data as any).organisation[0]
		: (data as any).organisation;

	if (!rawOrg) {
		throw new Error(`Organisation not found for model ${modelId}`);
	}
	const aliases = await fetchAliasesForApiModel(supabase, data.model_id);

	return {
		model_id: data.model_id,
		name: data.name,
		organisation_id: data.organisation_id,
		organisation: rawOrg as { name: string; country_code: string },
		aliases,
		family_id: data.family_id || undefined,
		status: (data as any).status ?? null,
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

	cacheLife({
		stale: 60 * 60 * 24,
		revalidate: 60 * 60 * 24 * 7,
		expire: 60 * 60 * 24 * 30,
	});
	cacheTag("data:models");
	cacheTag("data:organisations");
	cacheTag("data:data_api_models");
	cacheTag("data:data_api_provider_models");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-header");
	cacheTag(`model:data:${modelId}`);
	cacheTag(`model:header:${modelId}`);
	return fetchModelOverviewHeader(modelId, includeHidden);
}
