import type {
	ModelsFilterFacets,
	ModelsPageData,
	ModelsPageModel,
} from "@/components/(data)/models/Models/modelsDisplay.types";
import { getCatalogPricingSummariesCached } from "@/lib/fetchers/models/getCatalogPricingSummaries";
import { withMissingCatalogPricing } from "@/lib/models/withMissingCatalogPricing";
import { publicSWRFetcher } from "@/lib/swr/publicFetcher";
import { fetchAuthenticatedPrivateModels } from "@/lib/swr/privateModels";
import type { AuthenticatedProviderCatalogPreview } from "@/lib/swr/providerCatalogPreviews";
import { fetchAuthenticatedProviderCatalogPreviews } from "@/lib/swr/providerCatalogPreviews";

type PublicModelsResponse = {
	models: ModelsPageModel[];
	facets?: ModelsFilterFacets;
	pricing_complete?: boolean;
	catalogue_version?: "v1" | "v2";
	total: number;
	limit: number;
	offset: number;
};

type ModelsCatalogueVersion = "v1" | "v2";

function uniqueStrings(values: unknown[]): string[] {
	return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function previewDate(value: string | null | undefined): { date: string | null; timestamp: number | null; group: string | null } {
	if (!value) return { date: null, timestamp: null, group: null };
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) return { date: value, timestamp: null, group: null };
	const parsed = new Date(timestamp);
	return { date: value, timestamp, group: `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}` };
}

function mapProviderCatalogPreview(model: AuthenticatedProviderCatalogPreview): ModelsPageModel {
	const date = previewDate(model.created_at ?? model.announcement_date ?? model.available_from);
	const modelId = model.canonical_model_slug?.trim() || model.model_id;
	const organisationId = modelId.split("/", 1)[0] || model.provider_slug;
	const isNotActive = model.availability_status === "not_active";
	return {
		model_id: modelId,
		name: model.model_name || model.model_id,
		organisation_id: organisationId,
		organisation_name: organisationId,
		organisation_colour: null,
		description: model.description ?? null,
		status: isNotActive ? model.availability_reason ?? "inactive" : "active",
		primary_date: date.date,
		primary_timestamp: date.timestamp,
		primary_group_key: date.group,
		gateway_status: isNotActive ? "inactive" : "coming_soon",
		gateway_provider_count: 1,
		gateway_active_provider_count: 0,
		gateway_endpoints: model.endpoints ?? [],
		gateway_input_modalities: model.input_modalities ?? [],
		gateway_output_modalities: model.output_modalities ?? [],
		gateway_features: [],
		gateway_tiers: ["standard"],
		gateway_provider_names: [model.provider_name],
		gateway_active_provider_names: [],
		gateway_execution_regions: [],
		gateway_provider_details: [{ id: model.provider_slug, name: model.provider_name, is_active: false, status: isNotActive ? "inactive" : "coming_soon" }],
		gateway_api_model_ids: [model.api_model_id],
		context_lengths: model.context_length != null ? [model.context_length] : [],
		supported_parameters: model.supported_params ?? [],
		lowest_input_price: null,
		lowest_output_price: null,
		lowest_standard_input_price: null,
		lowest_standard_output_price: null,
		lowest_standard_input_price_label: null,
		lowest_standard_input_price_unit: null,
		lowest_standard_output_price_label: null,
		lowest_standard_output_price_unit: null,
		lowest_from_price: null,
		lowest_from_price_unit: null,
		pricing_detail_rows: [],
	};
}

export function mergeProviderCatalogPreviews(
	models: ModelsPageModel[],
	previews: AuthenticatedProviderCatalogPreview[],
): ModelsPageModel[] {
	const byModelId = new Map(models.map((model) => [model.model_id, model]));
	for (const preview of previews) {
		if (!preview.model_id || !preview.provider_slug) continue;
		const incoming = mapProviderCatalogPreview(preview);
		const existing = byModelId.get(incoming.model_id);
		if (!existing) {
			byModelId.set(incoming.model_id, incoming);
			continue;
		}
		const providerDetails = [...(existing.gateway_provider_details ?? []), ...(incoming.gateway_provider_details ?? [])]
			.filter((provider, index, all) => all.findIndex((candidate) => candidate.id === provider.id) === index);
		byModelId.set(incoming.model_id, {
			...existing,
			description: existing.description ?? incoming.description,
			gateway_status: existing.gateway_status === "active" ? "active" : incoming.gateway_status,
			gateway_provider_count: providerDetails.length,
			gateway_active_provider_count: existing.gateway_active_provider_count ?? 0,
			gateway_endpoints: uniqueStrings([...(existing.gateway_endpoints ?? []), ...(incoming.gateway_endpoints ?? [])]),
			gateway_input_modalities: uniqueStrings([...(existing.gateway_input_modalities ?? []), ...(incoming.gateway_input_modalities ?? [])]),
			gateway_output_modalities: uniqueStrings([...(existing.gateway_output_modalities ?? []), ...(incoming.gateway_output_modalities ?? [])]),
			gateway_provider_names: uniqueStrings([...(existing.gateway_provider_names ?? []), ...(incoming.gateway_provider_names ?? [])]),
			gateway_provider_details: providerDetails,
			gateway_api_model_ids: uniqueStrings([...(existing.gateway_api_model_ids ?? []), ...(incoming.gateway_api_model_ids ?? [])]),
			context_lengths: [...new Set([...(existing.context_lengths ?? []), ...(incoming.context_lengths ?? [])])],
			supported_parameters: uniqueStrings([...(existing.supported_parameters ?? []), ...(incoming.supported_parameters ?? [])]),
		});
	}
	return [...byModelId.values()];
}

async function fetchModelsPageDataForVersion(
	path: string,
	expectedVersion: ModelsCatalogueVersion,
	initialProviderPreviews?: AuthenticatedProviderCatalogPreview[],
): Promise<ModelsPageData> {
	const firstPage = await publicSWRFetcher<PublicModelsResponse>(path);
	if (
		firstPage.catalogue_version &&
		firstPage.catalogue_version !== expectedVersion
	) {
		throw new Error(
			`Models API returned catalogue ${firstPage.catalogue_version} for ${expectedVersion} request`,
		);
	}
	const pageSize = Math.max(1, firstPage.limit || 2_000);
	const pageOffsets: number[] = [];
	for (let offset = pageSize; offset < firstPage.total; offset += pageSize) {
		pageOffsets.push(offset);
	}

	const laterPages = await Promise.all(
		pageOffsets.map((offset) => {
			const url = new URL(path, "https://phaseo.local");
			url.searchParams.set("offset", String(offset));
			return publicSWRFetcher<PublicModelsResponse>(`${url.pathname}${url.search}`);
		}),
	);
	let models = [firstPage, ...laterPages]
		.flatMap((page) => page.models)
		.filter((model) => Boolean(model.model_id));

	if (firstPage.pricing_complete !== true) {
		models = withMissingCatalogPricing(
			models,
			await getCatalogPricingSummariesCached(),
		);
	}

	if (!firstPage.facets) {
		throw new Error("Models API response did not include filter facets");
	}
	const [privateModels, providerPreviews] = await Promise.all([
		fetchAuthenticatedPrivateModels<ModelsPageModel>("page"),
		initialProviderPreviews === undefined || initialProviderPreviews.length === 0
			? fetchAuthenticatedProviderCatalogPreviews()
			: Promise.resolve(initialProviderPreviews),
	]);
	if (privateModels.length > 0) {
		const privateIds = new Set(privateModels.map((model) => model.model_id));
		models = [...privateModels, ...models.filter((model) => !privateIds.has(model.model_id))];
		const addFacet = (options: Array<{ value: string; count: number }>, value: string) => {
			const existing = options.find((option) => option.value === value);
			if (existing) existing.count += privateModels.length;
			else options.push({ value, count: privateModels.length });
		};
		firstPage.facets.statusCounts.active += privateModels.length;
		addFacet(firstPage.facets.creatorOptions, "Private");
		addFacet(firstPage.facets.tierOptions, "private");
	}
	if (providerPreviews.length > 0) {
		const existingModelIds = new Set(models.map((model) => model.model_id));
		const uniquePreviewModels = mergeProviderCatalogPreviews([], providerPreviews);
		const addFacet = (options: Array<{ value: string; count: number }>, value: string) => {
			const existing = options.find((option) => option.value === value);
			if (existing) existing.count += 1;
			else options.push({ value, count: 1 });
		};
		for (const mapped of uniquePreviewModels) {
			if (!existingModelIds.has(mapped.model_id)) {
				firstPage.facets.statusCounts[mapped.gateway_status === "inactive" ? "not_active" : "coming_soon"] += 1;
				existingModelIds.add(mapped.model_id);
			}
			for (const endpoint of mapped.gateway_endpoints ?? []) addFacet(firstPage.facets.endpointOptions, endpoint);
			for (const modality of mapped.gateway_input_modalities ?? []) addFacet(firstPage.facets.inputModalityOptions, modality);
			for (const modality of mapped.gateway_output_modalities ?? []) addFacet(firstPage.facets.outputModalityOptions, modality);
			for (const parameter of mapped.supported_parameters ?? []) addFacet(firstPage.facets.supportedParameterOptions, parameter);
			for (const provider of mapped.gateway_provider_names ?? []) addFacet(firstPage.facets.providerOptions, provider);
			for (const creator of [mapped.organisation_name ?? mapped.organisation_id]) addFacet(firstPage.facets.creatorOptions, creator);
			for (const tier of mapped.gateway_tiers ?? []) addFacet(firstPage.facets.tierOptions, tier);
		}
		models = mergeProviderCatalogPreviews(models, providerPreviews);
	}

	return { models, facets: firstPage.facets };
}

export function fetchModelsPageData(
	path: string,
	initialProviderPreviews?: AuthenticatedProviderCatalogPreview[],
): Promise<ModelsPageData> {
	return fetchModelsPageDataForVersion(path, "v1", initialProviderPreviews);
}

export function fetchModelsPageDataV2(
	path: string,
	initialProviderPreviews?: AuthenticatedProviderCatalogPreview[],
): Promise<ModelsPageData> {
	return fetchModelsPageDataForVersion(path, "v2", initialProviderPreviews);
}
