import { cacheLife, cacheTag } from "next/cache";
import ModelsDisplay from "@/components/(data)/models/Models/ModelsDisplay";
import ModelsPageClient from "@/components/(data)/models/Models/ModelsPageClient";
import {
	mapRawToModelCard,
	type ModelCard,
} from "@/lib/fetchers/models/getAllModels";
import { fetchFrontendFreeRouterOverview } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import {
	getCatalogPricingSummariesCached,
	type CatalogPricingSummary,
	type CatalogPricingSummaryByModelId,
} from "@/lib/fetchers/models/getCatalogPricingSummaries";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { featureOrder } from "@/lib/config/featureLabels";
import {
	FREE_ROUTER_DESCRIPTION,
	FREE_ROUTER_MODEL_ID,
	FREE_ROUTER_NAME,
	FREE_ROUTER_ORGANISATION_ID,
	FREE_ROUTER_PRIMARY_DATE,
	FREE_ROUTER_PRIMARY_TIMESTAMP,
} from "@/lib/models/freeRouter";
import { normalizeOrganisationDisplayName } from "@/lib/models/organisationDisplay";
import { resolveProviderDisplayName } from "@/lib/providers/providerOffers";
import type {
	GatewayStatusFilter,
	ModelsFilterFacets,
	ModelsPageData,
	ModelsPageModel,
	OptionCount,
} from "@/components/(data)/models/Models/modelsDisplay.types";
import { modelsCatalogueV2Flag } from "@/lib/flags";
import { isAdminViewer } from "@/lib/auth/getViewerRole";
import { withMissingCatalogPricing } from "@/lib/models/withMissingCatalogPricing";

export const metadata: Metadata = buildMetadata({
	title: "Models",
	description:
		"Browse AI models by benchmark scores, providers, modalities and pricing to find the right model for your use case.",
	path: "/models",
	keywords: [
		"AI models",
		"compare AI models",
		"AI model pricing",
		"AI benchmarks",
		"AI providers",
	],
});

const MODALITY_FILTER_DISPLAY_ORDER = [
	"text",
	"image",
	"video",
	"audio",
	"audio_tts",
	"realtime",
	"audio_stt",
	"audio_music",
	"file",
	"moderations",
	"rerank",
	"embeddings",
] as const;

const PROVIDER_STATUS_PRIORITY_ORDER = [
	"active",
	"coming_soon",
	"deranked_lvl1",
	"deranked_lvl2",
	"deranked_lvl3",
	"inactive",
	"disabled",
	"not_listed",
] as const;

const providerStatusPriority = new Map<string, number>(
	PROVIDER_STATUS_PRIORITY_ORDER.map((status, index) => [status, index]),
);

const ACTIVE_PROVIDER_STATUS_SET = new Set([
	"active",
	"deranked_lvl1",
	"deranked_lvl2",
	"deranked_lvl3",
]);

const UPCOMING_CATALOG_STATUS_SET = new Set(["announced"]);

type PublicModelsResponse = {
	models: unknown[];
	facets?: ModelsFilterFacets;
	pricing_complete?: boolean;
	total: number;
	limit: number;
	offset: number;
};

type ModelsCatalogueVersion = "v1" | "v2";

async function fetchModelsFromWebApi(
	apiOrigin: string,
	catalogueVersion: ModelsCatalogueVersion,
	projectionVersion: 6,
): Promise<{ models: ModelCard[]; facets: ModelsFilterFacets | null; pricingComplete: boolean }> {
	"use cache";
	cacheLife("hours");
	cacheTag(
		catalogueVersion === "v2" ? "web-api-models-v2" : "web-api-models",
	);
	const pageSize = 2_000;
	const versionQuery =
		catalogueVersion === "v2" ? "&catalogue_version=v2" : "";
	const shapeQuery = catalogueVersion === "v1" ? `&shape=page&projection=${projectionVersion}` : "";
	const firstResponse = await fetch(
		`${apiOrigin}/api/_web/models?limit=${pageSize}&offset=0${versionQuery}${shapeQuery}`,
		{ cache: "no-store" },
	);
	if (!firstResponse.ok) {
		throw new Error(`Public models API failed with ${firstResponse.status}`);
	}

	const firstPage = (await firstResponse.json()) as PublicModelsResponse;
	const pageOffsets: number[] = [];
	for (let offset = pageSize; offset < firstPage.total; offset += pageSize) {
		pageOffsets.push(offset);
	}
	const laterPages = await Promise.all(
		pageOffsets.map(async (offset) => {
			const response = await fetch(
				`${apiOrigin}/api/_web/models?limit=${pageSize}&offset=${offset}${versionQuery}${shapeQuery}`,
				{ cache: "no-store" },
			);
			if (!response.ok) {
				throw new Error(`Public models API failed with ${response.status}`);
			}
			return (await response.json()) as PublicModelsResponse;
		}),
	);

	const rows = [firstPage, ...laterPages].flatMap((page) => page.models);
	return {
		models: catalogueVersion === "v1"
			? (rows as ModelCard[]).filter((model) => Boolean(model.model_id))
			: rows.map((model) => mapRawToModelCard(model)).filter((model) => Boolean(model.model_id)),
		facets: firstPage.facets ?? null,
		pricingComplete: firstPage.pricing_complete === true,
	};
}

function getModelYear(model: ModelsPageModel): string {
	if (Number.isFinite(model.primary_timestamp)) {
		const year = new Date(Number(model.primary_timestamp)).getUTCFullYear();
		return Number.isFinite(year) ? String(year) : "";
	}
	if (model.primary_date) {
		const parsed = new Date(model.primary_date).getTime();
		if (Number.isFinite(parsed)) {
			return String(new Date(parsed).getUTCFullYear());
		}
	}
	return "";
}

function getCatalogOnlyGatewayStatus(
	model: ModelCard,
): NonNullable<ModelsPageModel["gateway_status"]> {
	const status = String(model.status ?? "")
		.trim()
		.toLowerCase();
	return UPCOMING_CATALOG_STATUS_SET.has(status) ? "coming_soon" : "not_listed";
}

function normalizeModalityKey(value: string): string {
	const normalized = value.toLowerCase().replace(/[._/-]+/g, " ");
	if (normalized.includes("realtime") || normalized.includes("real time")) {
		return "realtime";
	}
	if (normalized.includes("embed")) return "embeddings";
	if (normalized.includes("moderat")) return "moderations";
	if (normalized.includes("rerank") || normalized.includes("re rank")) {
		return "rerank";
	}
	if (normalized.includes("image")) return "image";
	if (normalized.includes("video")) return "video";
	if (normalized.includes("music")) return "audio_music";
	if (
		normalized.includes("transcrib") ||
		normalized.includes("speech to text") ||
		normalized.includes("stt")
	) {
		return "audio_stt";
	}
	if (
		normalized.includes("text to speech") ||
		normalized.includes("audio speech") ||
		normalized.includes("speech synth") ||
		normalized.includes("tts")
	) {
		return "audio_tts";
	}
	if (normalized.includes("audio")) return "audio";
	if (normalized.includes("file")) return "file";
	if (normalized.includes("text")) return "text";
	if (normalized === "moderation") return "moderations";
	if (normalized === "embedding") return "embeddings";
	return normalized.trim();
}

function isRealtimeEndpoint(value: unknown): boolean {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[._/-]+/g, " ");
	return normalized.includes("realtime") || normalized.includes("real time");
}

function hasRealtimeModelHint(model: ModelCard | undefined): boolean {
	if (!model) return false;
	const values = [
		model.model_id,
		model.api_model_id,
		model.name,
		(model as { description?: unknown }).description,
	].map((value) => String(value ?? "").toLowerCase().replace(/[._/-]+/g, " "));
	const hasBidirectionalAudio =
		normalizeStringList(model.input_types ?? model.input_modalities).some(
			(value) => normalizeModalityKey(value) === "audio",
		) &&
		normalizeStringList(model.output_types ?? model.output_modalities).some(
			(value) => normalizeModalityKey(value) === "audio",
		);
	return (
		hasBidirectionalAudio &&
		values.some(
			(value) =>
				value.includes("realtime") ||
				value.includes("real-time") ||
				value.includes(" live") ||
				value.endsWith("live") ||
				value.includes("voice"),
		)
	);
}

function sortModalityValues(values: string[]): string[] {
	const orderIndex = new Map<string, number>(
		MODALITY_FILTER_DISPLAY_ORDER.map((key, index) => [key, index]),
	);
	return [...values].sort((a, b) => {
		const aIndex = orderIndex.get(a);
		const bIndex = orderIndex.get(b);
		if (aIndex !== undefined || bIndex !== undefined) {
			if (aIndex === undefined) return 1;
			if (bIndex === undefined) return -1;
			return aIndex - bIndex;
		}
		return a.localeCompare(b);
	});
}

function normalizeModalityList(values: string[]): string[] {
	return sortModalityValues(
		Array.from(
			new Set(
				values.map((value) => normalizeModalityKey(value)).filter(Boolean),
			),
		),
	);
}

function normalizeModelModalityList(
	values: string[],
	options?: { realtime?: boolean },
): string[] {
	return normalizeModalityList([
		...values,
		...(options?.realtime ? ["realtime"] : []),
	]);
}

function normalizeProviderGatewayStatus(value: unknown): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	if (!normalized) return "inactive";
	if (normalized === "not_active") return "inactive";
	if (normalized === "comingsoon") return "coming_soon";
	if (normalized === "deranked" || normalized === "de_ranked") {
		return "deranked_lvl1";
	}
	if (normalized === "deranked_lvl_1") return "deranked_lvl1";
	if (normalized === "deranked_lvl_2") return "deranked_lvl2";
	if (normalized === "deranked_lvl_3") return "deranked_lvl3";
	return normalized;
}

function formatMergedPricingAmount(value: number): string {
	if (!Number.isFinite(value) || value < 0) return "$0";
	if (value === 0) return "$0";
	if (value < 0.001) return `$${value.toFixed(4)}`;
	if (value < 0.1) return `$${value.toFixed(3)}`;
	if (value < 1) return `$${value.toFixed(2)}`;
	return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function pickLowestMergedPricingValue(values: string[]): string | null {
	const parsed = values
		.map((value) => {
			const match = String(value ?? "")
				.trim()
				.match(/^\$([\d.,]+)(?:-\$?([\d.,]+))?\s*\/\s*(.+)$/);
			if (!match) return null;
			const min = Number(match[1]?.replace(/,/g, ""));
			const unit = match[3]?.trim();
			if (!Number.isFinite(min) || !unit) return null;
			return { min, unit };
		})
		.filter((entry): entry is { min: number; unit: string } => Boolean(entry));
	if (parsed.length === 0) return null;
	const unit = parsed[0]?.unit ?? null;
	if (!unit || parsed.some((entry) => entry.unit !== unit)) return null;
	const min = Math.min(...parsed.map((entry) => entry.min));
	return `${formatMergedPricingAmount(min)} / ${unit}`;
}

function summarizeMergedPricingValues(values: string[]): string | null {
	const parsed = values
		.map((value) => {
			const match = String(value ?? "")
				.trim()
				.match(/^\$([\d.,]+)(?:-\$?([\d.,]+))?\s*\/\s*(.+)$/);
			if (!match) return null;
			const min = Number(match[1]?.replace(/,/g, ""));
			const max = Number((match[2] ?? match[1])?.replace(/,/g, ""));
			const unit = match[3]?.trim();
			if (!Number.isFinite(min) || !Number.isFinite(max) || !unit) return null;
			return { min, max, unit };
		})
		.filter((entry): entry is { min: number; max: number; unit: string } =>
			Boolean(entry),
		);
	if (parsed.length === 0) return null;
	const unit = parsed[0]?.unit ?? null;
	if (!unit || parsed.some((entry) => entry.unit !== unit)) return null;
	const min = Math.min(...parsed.map((entry) => entry.min));
	const max = Math.max(...parsed.map((entry) => entry.max));
	const minText = formatMergedPricingAmount(min);
	const maxText = formatMergedPricingAmount(max);
	return min === max
		? `${minText} / ${unit}`
		: `${minText}-${maxText} / ${unit}`;
}

function mergePricingDetailRows(
	rows: Array<{ label: string; value: string }>,
): Array<{ label: string; value: string }> {
	const grouped = new Map<
		string,
		{ baseLabel: string; variant: string | null; values: string[] }
	>();

	for (const row of rows) {
		const label = String(row.label ?? "").trim();
		const value = String(row.value ?? "").trim();
		if (!label || !value) continue;
		const match = label.match(/^(.*?)(?: \((.+)\))?$/);
		const baseLabel = match?.[1]?.trim() || label;
		const variant = match?.[2]?.trim() || null;
		const key = `${baseLabel}::${variant ?? ""}`;
		const existing = grouped.get(key);
		if (existing) {
			existing.values.push(value);
			continue;
		}
		grouped.set(key, { baseLabel, variant, values: [value] });
	}

	return Array.from(grouped.values())
		.map((group) => {
			const uniqueValues = Array.from(new Set(group.values));
			const summarizedValue = group.variant
				? uniqueValues.length === 1
					? (uniqueValues[0] ?? null)
					: summarizeMergedPricingValues(uniqueValues)
				: uniqueValues.length === 1
					? (uniqueValues[0] ?? null)
					: pickLowestMergedPricingValue(uniqueValues);
			const value = summarizedValue ?? uniqueValues[0] ?? null;
			if (!value) return null;
			return {
				label: group.variant
					? `${group.baseLabel} (${group.variant})`
					: group.baseLabel,
				value,
			};
		})
		.filter((row): row is { label: string; value: string } => Boolean(row));
}

function statusPriority(status: string): number {
	return providerStatusPriority.get(status) ?? providerStatusPriority.size + 1;
}

function chooseProviderGatewayStatus(
	currentStatus: string | undefined,
	candidateStatus: string,
): string {
	if (!currentStatus) return candidateStatus;
	return statusPriority(candidateStatus) < statusPriority(currentStatus)
		? candidateStatus
		: currentStatus;
}

function isActiveProviderStatus(status: string): boolean {
	return ACTIVE_PROVIDER_STATUS_SET.has(status);
}

function firstNonEmptyString(
	...values: Array<string | null | undefined>
): string | null {
	for (const value of values) {
		const normalized = String(value ?? "").trim();
		if (normalized) return normalized;
	}
	return null;
}

function applyApiVariantModelName(baseName: string, modelId: string): string {
	const normalizedModelId = String(modelId ?? "")
		.trim()
		.toLowerCase();
	if (normalizedModelId.endsWith(":free")) {
		const trimmedName = baseName.trim();
		if (/\(\s*free\s*\)$/i.test(trimmedName)) {
			return trimmedName.replace(/\(\s*free\s*\)$/i, "(Free)");
		}
		if (/\s+free$/i.test(trimmedName)) {
			return trimmedName.replace(/\s+free$/i, " (Free)");
		}
		if (!/\bfree\b/i.test(trimmedName)) {
			return `${trimmedName} (Free)`;
		}
	}
	return baseName;
}

function buildCanonicalModelLookupCandidates(value: string): string[] {
	const normalized = String(value ?? "").trim();
	if (!normalized) return [];
	if (normalized.toLowerCase().endsWith(":free")) {
		return [normalized, normalized.slice(0, -":free".length)];
	}
	return [normalized];
}

function resolveBaseModel(
	baseModelById: Map<string, ModelCard>,
	modelId: string,
	signals: GatewaySignals | undefined,
): ModelCard | undefined {
	const candidates = [
		modelId,
		...Array.from(signals?.apiModelIds ?? []),
	].flatMap((value) => buildCanonicalModelLookupCandidates(value));

	for (const candidate of candidates) {
		const model = baseModelById.get(candidate);
		if (model) return model;
	}

	return undefined;
}

function sortModalityOptions(
	options: OptionCount[],
	order: readonly string[],
): OptionCount[] {
	const orderIndex = new Map<string, number>(
		order.map((key, index) => [key, index]),
	);

	return [...options].sort((a, b) => {
		const aKey = normalizeModalityKey(a.value);
		const bKey = normalizeModalityKey(b.value);
		const aIndex = orderIndex.get(aKey);
		const bIndex = orderIndex.get(bKey);

		if (aIndex !== undefined || bIndex !== undefined) {
			if (aIndex === undefined) return 1;
			if (bIndex === undefined) return -1;
			return aIndex - bIndex;
		}

		if (a.count !== b.count) return b.count - a.count;
		return a.value.localeCompare(b.value);
	});
}

function buildOptionCounts(
	models: ModelsPageModel[],
	field:
		| "gateway_endpoints"
		| "gateway_input_modalities"
		| "gateway_output_modalities"
		| "gateway_features"
		| "gateway_tiers"
		| "gateway_provider_names"
		| "gateway_execution_regions"
		| "supported_parameters",
): OptionCount[] {
	const counts = new Map<string, number>();
	const isModalityField =
		field === "gateway_input_modalities" ||
		field === "gateway_output_modalities";
	for (const model of models) {
		for (const value of model[field] ?? []) {
			const normalized = String(value ?? "").trim();
			if (!normalized) continue;
			const key = isModalityField
				? normalizeModalityKey(normalized)
				: normalized;
			if (!key) continue;
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}

	if (field === "gateway_features") {
		const orderIndex = new Map(featureOrder.map((key, idx) => [key, idx]));
		return Array.from(counts.entries())
			.map(([value, count]) => ({ value, count }))
			.sort((a, b) => {
				const aIndex = orderIndex.get(a.value);
				const bIndex = orderIndex.get(b.value);
				if (aIndex !== undefined || bIndex !== undefined) {
					if (aIndex === undefined) return 1;
					if (bIndex === undefined) return -1;
					return aIndex - bIndex;
				}
				return a.value.localeCompare(b.value);
			});
	}

	return Array.from(counts.entries())
		.map(([value, count]) => ({ value, count }))
		.sort((a, b) => {
			if (a.count !== b.count) return b.count - a.count;
			return a.value.localeCompare(b.value);
		});
}

function buildCreatorOptions(models: ModelsPageModel[]): OptionCount[] {
	const counts = new Map<string, number>();
	for (const model of models) {
		const creator = String(
			normalizeOrganisationDisplayName(
				model.organisation_name,
				model.organisation_id,
			) ?? "",
		).trim();
		if (!creator) continue;
		counts.set(creator, (counts.get(creator) ?? 0) + 1);
	}

	return Array.from(counts.entries())
		.map(([value, count]) => ({ value, count }))
		.sort((a, b) => {
			if (a.count !== b.count) return b.count - a.count;
			return a.value.localeCompare(b.value);
		});
}

function buildYearOptions(models: ModelsPageModel[]): OptionCount[] {
	const counts = new Map<number, number>();
	for (const model of models) {
		const yearText = getModelYear(model);
		const year = Number(yearText);
		if (!year || !Number.isFinite(year)) continue;
		counts.set(year, (counts.get(year) ?? 0) + 1);
	}

	return Array.from(counts.entries())
		.map(([value, count]) => ({ value: String(value), count }))
		.sort((a, b) => Number(b.value) - Number(a.value));
}

function buildModelsFilterFacets(
	models: ModelsPageModel[],
): ModelsFilterFacets {
	const statusCounts: Record<GatewayStatusFilter, number> = {
		active: 0,
		coming_soon: 0,
		not_active: 0,
	};

	for (const model of models) {
		const status: GatewayStatusFilter =
			model.gateway_status === "active"
				? "active"
				: model.gateway_status === "coming_soon"
					? "coming_soon"
					: "not_active";
		statusCounts[status] += 1;
	}

	return {
		statusCounts,
		endpointOptions: buildOptionCounts(models, "gateway_endpoints"),
		inputModalityOptions: sortModalityOptions(
			buildOptionCounts(models, "gateway_input_modalities"),
			MODALITY_FILTER_DISPLAY_ORDER,
		),
		outputModalityOptions: sortModalityOptions(
			buildOptionCounts(models, "gateway_output_modalities"),
			MODALITY_FILTER_DISPLAY_ORDER,
		),
		featureOptions: buildOptionCounts(models, "gateway_features"),
		tierOptions: buildOptionCounts(models, "gateway_tiers"),
		supportedParameterOptions: buildOptionCounts(
			models,
			"supported_parameters",
		),
		providerOptions: buildOptionCounts(models, "gateway_provider_names"),
		regionOptions: buildOptionCounts(models, "gateway_execution_regions"),
		creatorOptions: buildCreatorOptions(models),
		yearOptions: buildYearOptions(models),
	};
}

type GatewaySignals = {
	displayNames: Set<string>;
	organisationIds: Set<string>;
	providerIds: Set<string>;
	providerNames: Set<string>;
	activeProviderNames: Set<string>;
	executionRegions: Set<string>;
	providerDetails: Map<
		string,
		{ id: string; name: string; isActive: boolean; status: string }
	>;
	apiModelIds: Set<string>;
	activeProviderIds: Set<string>;
	endpoints: Set<string>;
	inputModalities: Set<string>;
	outputModalities: Set<string>;
	features: Set<string>;
	tiers: Set<string>;
	contextLengths: Set<number>;
	supportedParameters: Set<string>;
	latestApiTimestamp: number | null;
	lowestInputPrice: number | null;
	lowestOutputPrice: number | null;
	lowestStandardInputPrice: number | null;
	lowestStandardOutputPrice: number | null;
	lowestStandardInputPriceLabel: string | null;
	lowestStandardInputPriceUnit: string | null;
	lowestStandardOutputPriceLabel: string | null;
	lowestStandardOutputPriceUnit: string | null;
	lowestFromPrice: number | null;
	lowestFromPriceUnit: string | null;
	fromPriceByUnit: Map<string, number>;
	pricingDetailRows: Array<{
		label: string;
		value: string;
	}>;
};

function createEmptyGatewaySignals(): GatewaySignals {
	return {
		displayNames: new Set<string>(),
		organisationIds: new Set<string>(),
		providerIds: new Set<string>(),
		providerNames: new Set<string>(),
		activeProviderNames: new Set<string>(),
		executionRegions: new Set<string>(),
		providerDetails: new Map<
			string,
			{ id: string; name: string; isActive: boolean; status: string }
		>(),
		apiModelIds: new Set<string>(),
		activeProviderIds: new Set<string>(),
		endpoints: new Set<string>(),
		inputModalities: new Set<string>(),
		outputModalities: new Set<string>(),
		features: new Set<string>(),
		tiers: new Set<string>(),
		contextLengths: new Set<number>(),
		supportedParameters: new Set<string>(),
		latestApiTimestamp: null,
		lowestInputPrice: null,
		lowestOutputPrice: null,
		lowestStandardInputPrice: null,
		lowestStandardOutputPrice: null,
		lowestStandardInputPriceLabel: null,
		lowestStandardInputPriceUnit: null,
		lowestStandardOutputPriceLabel: null,
		lowestStandardOutputPriceUnit: null,
		lowestFromPrice: null,
		lowestFromPriceUnit: null,
		fromPriceByUnit: new Map<string, number>(),
		pricingDetailRows: [],
	};
}

function aggregateGatewaySignals(
	monitorRows: NonNullable<ModelCard["gateway_monitor_rows"]>,
): Map<string, GatewaySignals> {
	const byModelId = new Map<string, GatewaySignals>();

	for (const row of monitorRows) {
		const modelId = String(row.modelId ?? "").trim();
		if (!modelId) continue;

		const existing = byModelId.get(modelId) ?? createEmptyGatewaySignals();
		const displayName = String(row.model ?? "").trim();
		if (displayName) {
			existing.displayNames.add(displayName);
		}
		const organisationId = String(row.organisationId ?? "").trim();
		if (organisationId) {
			existing.organisationIds.add(organisationId);
		}
		const providerId = String(row.provider.id ?? "").trim();
		const providerName = resolveProviderDisplayName({
			providerId,
			providerName: String(row.provider.name ?? "").trim(),
		});
		const providerDetailKey = providerId || providerName;
		const rowGatewayStatus = normalizeProviderGatewayStatus(row.gatewayStatus);
		if (providerId) {
			existing.providerIds.add(providerId);
			if (isActiveProviderStatus(rowGatewayStatus)) {
				existing.activeProviderIds.add(providerId);
			}
		}
		if (providerName) {
			existing.providerNames.add(providerName);
			if (isActiveProviderStatus(rowGatewayStatus)) {
				existing.activeProviderNames.add(providerName);
			}
		}
		if (isActiveProviderStatus(rowGatewayStatus)) {
			for (const region of row.provider.executionRegions ?? []) {
				const normalized = String(region ?? "")
					.trim()
					.toLowerCase();
				if (normalized) existing.executionRegions.add(normalized);
			}
		}
		if (providerDetailKey) {
			const previous = existing.providerDetails.get(providerDetailKey);
			const status = chooseProviderGatewayStatus(
				previous?.status,
				rowGatewayStatus,
			);
			const isActive = isActiveProviderStatus(status);
			existing.providerDetails.set(providerDetailKey, {
				id: providerId,
				name: providerName || previous?.name || providerDetailKey,
				status,
				isActive,
			});
		}
		const apiModelId = String(row.apiModelId ?? "").trim();
		if (apiModelId) existing.apiModelIds.add(apiModelId);

		const endpoint = String(row.endpoint ?? "").trim();
		if (endpoint) {
			existing.endpoints.add(endpoint);
			if (isRealtimeEndpoint(endpoint)) {
				existing.outputModalities.add("realtime");
			}
		}

		for (const modality of row.inputModalities ?? []) {
			const value = String(modality ?? "").trim();
			if (value) existing.inputModalities.add(value);
		}
		for (const modality of row.outputModalities ?? []) {
			const value = String(modality ?? "").trim();
			if (value) existing.outputModalities.add(value);
		}
		for (const feature of row.provider.features ?? []) {
			const value = String(feature ?? "").trim();
			if (value) existing.features.add(value);
		}
		const tier = String(row.tier ?? "standard")
			.trim()
			.toLowerCase();
		if (tier) existing.tiers.add(tier);
		const contextLength = Number(row.context ?? 0);
		if (Number.isFinite(contextLength) && contextLength > 0) {
			existing.contextLengths.add(contextLength);
		}
		for (const parameter of row.supportedParameters ?? []) {
			const value = String(parameter ?? "").trim();
			if (value) existing.supportedParameters.add(value);
		}
		const shouldIncludeProviderPricing =
			isActiveProviderStatus(rowGatewayStatus);
		const inputPrice = Number(row.provider.inputPrice);
		if (
			shouldIncludeProviderPricing &&
			Number.isFinite(inputPrice) &&
			inputPrice > 0
		) {
			existing.lowestInputPrice =
				existing.lowestInputPrice === null
					? inputPrice
					: Math.min(existing.lowestInputPrice, inputPrice);
		}
		const outputPrice = Number(row.provider.outputPrice);
		if (
			shouldIncludeProviderPricing &&
			Number.isFinite(outputPrice) &&
			outputPrice > 0
		) {
			existing.lowestOutputPrice =
				existing.lowestOutputPrice === null
					? outputPrice
					: Math.min(existing.lowestOutputPrice, outputPrice);
		}
		const standardInputPrice = Number(row.provider.standardInputPrice);
		if (
			shouldIncludeProviderPricing &&
			Number.isFinite(standardInputPrice) &&
			standardInputPrice > 0
		) {
			if (
				existing.lowestStandardInputPrice === null ||
				standardInputPrice < existing.lowestStandardInputPrice
			) {
				existing.lowestStandardInputPrice = standardInputPrice;
				existing.lowestStandardInputPriceLabel =
					String(row.provider.standardInputPriceLabel ?? "").trim() || null;
				existing.lowestStandardInputPriceUnit =
					String(row.provider.standardInputPriceUnit ?? "").trim() || null;
			}
		}
		const standardOutputPrice = Number(row.provider.standardOutputPrice);
		if (
			shouldIncludeProviderPricing &&
			Number.isFinite(standardOutputPrice) &&
			standardOutputPrice > 0
		) {
			if (
				existing.lowestStandardOutputPrice === null ||
				standardOutputPrice < existing.lowestStandardOutputPrice
			) {
				existing.lowestStandardOutputPrice = standardOutputPrice;
				existing.lowestStandardOutputPriceLabel =
					String(row.provider.standardOutputPriceLabel ?? "").trim() || null;
				existing.lowestStandardOutputPriceUnit =
					String(row.provider.standardOutputPriceUnit ?? "").trim() || null;
			}
		}
		const fromPrice = Number(row.provider.fromPrice);
		const fromPriceUnit =
			String(row.provider.fromPriceUnit ?? "").trim() || null;
		if (
			shouldIncludeProviderPricing &&
			Number.isFinite(fromPrice) &&
			fromPrice >= 0 &&
			fromPriceUnit
		) {
			const current = existing.fromPriceByUnit.get(fromPriceUnit);
			if (current === undefined || fromPrice < current) {
				existing.fromPriceByUnit.set(fromPriceUnit, fromPrice);
			}
			// Only surface a model-level "from" price when all rows agree on one unit.
			if (existing.fromPriceByUnit.size === 1) {
				const [unit, value] = Array.from(existing.fromPriceByUnit.entries())[0];
				existing.lowestFromPrice = value;
				existing.lowestFromPriceUnit = unit;
			} else {
				existing.lowestFromPrice = null;
				existing.lowestFromPriceUnit = null;
			}
		}
		if (shouldIncludeProviderPricing) {
			for (const detailRow of row.provider.pricingDetailRows ?? []) {
				if (!detailRow?.label || !detailRow?.value) continue;
				const exists = existing.pricingDetailRows.some(
					(candidate) =>
						candidate.label === detailRow.label &&
						candidate.value === detailRow.value,
				);
				if (!exists) {
					existing.pricingDetailRows.push({
						label: detailRow.label,
						value: detailRow.value,
					});
				}
			}
		}
		const apiDateCandidate = String(row.effectiveFrom ?? "").trim();
		if (apiDateCandidate) {
			const parsed = new Date(apiDateCandidate).getTime();
			if (Number.isFinite(parsed)) {
				existing.latestApiTimestamp = Math.max(
					existing.latestApiTimestamp ?? Number.NEGATIVE_INFINITY,
					parsed,
				);
			}
		}

		byModelId.set(modelId, existing);
	}

	return byModelId;
}

function normalizeStringList(values: string[] | undefined): string[] {
	return Array.from(
		new Set(
			(values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean),
		),
	);
}

function sortApiModelIdsForDisplay(
	values: Iterable<string> | undefined,
): string[] {
	return Array.from(values ?? [])
		.map((value) => String(value ?? "").trim())
		.filter(Boolean)
		.sort((a, b) => {
			const aIsFree = a.toLowerCase().endsWith(":free");
			const bIsFree = b.toLowerCase().endsWith(":free");
			if (aIsFree !== bIsFree) return aIsFree ? -1 : 1;
			return a.localeCompare(b);
		});
}

function normalizeModelTailForDedup(modelId: string): string {
	const trimmed = String(modelId ?? "")
		.trim()
		.toLowerCase();
	if (!trimmed) return "";
	const tail = trimmed.includes("/")
		? trimmed.split("/").slice(1).join("/")
		: trimmed;
	return tail
		.replace(/[._/]+/g, "-")
		.replace(/-\d{4}(?:-\d{2}){2}$/g, "")
		.replace(/-\d{4}-\d{2}$/g, "")
		.replace(/-\d{4}$/g, "")
		.replace(/-latest$/g, "")
		.replace(/-stable$/g, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function normalizeModelNameForDedup(name: string): string {
	return String(name ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ");
}

type WeeklyRankingMetrics = {
	tokensWeek: number | null;
	throughputWeek: number | null;
	latencyWeek: number | null;
};

function normalizeRankingModelKey(value: string): string {
	return String(value ?? "")
		.trim()
		.toLowerCase();
}

function buildWeeklyMetricsByModel(
	monitorRows: NonNullable<ModelCard["gateway_monitor_rows"]>,
): Map<string, WeeklyRankingMetrics> {
	const metricsByKey = new Map<string, WeeklyRankingMetrics>();

	for (const row of monitorRows) {
		const metric: WeeklyRankingMetrics = {
			tokensWeek: Number.isFinite(Number(row.weeklyTokensModel))
				? Number(row.weeklyTokensModel)
				: null,
			throughputWeek: Number.isFinite(Number(row.weeklyThroughputModel))
				? Number(row.weeklyThroughputModel)
				: null,
			latencyWeek: Number.isFinite(Number(row.weeklyLatencyModel))
				? Number(row.weeklyLatencyModel)
				: null,
		};
		if (
			metric.tokensWeek === null &&
			metric.throughputWeek === null &&
			metric.latencyWeek === null
		) {
			continue;
		}

		for (const candidate of [row.modelId, row.apiModelId]) {
			const key = normalizeRankingModelKey(String(candidate ?? ""));
			if (!key || key === "unknown" || key === "other") continue;
			const existing = metricsByKey.get(key);
			if (
				!existing ||
				(metric.tokensWeek ?? Number.NEGATIVE_INFINITY) >
					(existing.tokensWeek ?? Number.NEGATIVE_INFINITY)
			) {
				metricsByKey.set(key, metric);
			}
		}
	}

	return metricsByKey;
}

function resolveModelWeeklyMetrics(
	model: ModelCard,
	signals: GatewaySignals | undefined,
	metricsByKey: Map<string, WeeklyRankingMetrics>,
): WeeklyRankingMetrics {
	const candidateKeys = [
		model.model_id,
		...(Array.from(signals?.apiModelIds ?? []) ?? []),
	]
		.map((value) => normalizeRankingModelKey(value))
		.filter(Boolean);

	let selected: WeeklyRankingMetrics | null = null;
	for (const key of candidateKeys) {
		const metric = metricsByKey.get(key);
		if (!metric) continue;
		if (!selected) {
			selected = metric;
			continue;
		}
		const selectedTokens = selected.tokensWeek ?? Number.NEGATIVE_INFINITY;
		const currentTokens = metric.tokensWeek ?? Number.NEGATIVE_INFINITY;
		if (currentTokens > selectedTokens) {
			selected = metric;
		}
	}

	return (
		selected ?? {
			tokensWeek: null,
			throughputWeek: null,
			latencyWeek: null,
		}
	);
}

function resolveCatalogPricingSummary(
	modelId: string,
	signals: GatewaySignals | string[] | undefined,
	catalogPricingSummaries: CatalogPricingSummaryByModelId,
): CatalogPricingSummary | undefined {
	const apiModelIds = Array.isArray(signals)
		? signals
		: Array.from(signals?.apiModelIds ?? []);
	const candidates = [modelId, ...apiModelIds]
		.map((value) => String(value ?? "").trim())
		.filter(Boolean);

	for (const candidate of candidates) {
		const summary = catalogPricingSummaries[candidate];
		if (summary) return summary;
	}

	return undefined;
}

function withGatewayMetadata(
	baseModels: ModelCard[],
	monitorRows: NonNullable<ModelCard["gateway_monitor_rows"]>,
	catalogPricingSummaries: CatalogPricingSummaryByModelId,
): ModelsPageModel[] {
	const signalsByModelId = aggregateGatewaySignals(monitorRows);
	const weeklyMetricsByKey = buildWeeklyMetricsByModel(monitorRows);
	const baseModelById = new Map(
		baseModels.map((model) => [String(model.model_id ?? "").trim(), model]),
	);
	const canonicalModelIds = Array.from(signalsByModelId.keys()).filter(Boolean);

	const enriched = canonicalModelIds.map((modelId) => {
		const signals = signalsByModelId.get(modelId);
		const model = resolveBaseModel(baseModelById, modelId, signals);
		const weeklyMetrics = resolveModelWeeklyMetrics(
			model ??
				({
					model_id: modelId,
					name: modelId,
					organisation_id: "",
				} as ModelCard),
			signals,
			weeklyMetricsByKey,
		);
		const catalogPricing = resolveCatalogPricingSummary(
			modelId,
			signals,
			catalogPricingSummaries,
		);
		const providerCount = signals?.providerIds.size ?? 0;
		const activeProviderCount = signals?.activeProviderIds.size ?? 0;
		const hasComingSoonProvider = Array.from(
			signals?.providerDetails.values() ?? [],
		).some((detail) => detail.status === "coming_soon");

		const gatewayStatus: ModelsPageModel["gateway_status"] =
			activeProviderCount > 0
				? "active"
				: hasComingSoonProvider
					? "coming_soon"
					: providerCount > 0
						? "inactive"
						: "not_listed";
		const resolvedPrimaryTimestamp = model
			? (model.primary_timestamp ?? null)
			: (signals?.latestApiTimestamp ?? null);
		const resolvedDate =
			resolvedPrimaryTimestamp !== null &&
			Number.isFinite(resolvedPrimaryTimestamp)
				? new Date(resolvedPrimaryTimestamp)
				: null;
		const resolvedPrimaryDate = resolvedDate
			? resolvedDate.toISOString().slice(0, 10)
			: (model?.primary_date ?? null);
		const resolvedPrimaryGroupKey = resolvedDate
			? `${resolvedDate.getUTCFullYear()}-${String(
					resolvedDate.getUTCMonth() + 1,
				).padStart(2, "0")}`
			: (model?.primary_group_key ?? null);
		const fallbackName =
			firstNonEmptyString(
				model?.name,
				Array.from(signals?.displayNames ?? [])[0],
				modelId.split("/").slice(-1)[0],
				modelId,
			) ?? modelId;
		const displayName = applyApiVariantModelName(fallbackName, modelId);
		const fallbackOrganisationId =
			firstNonEmptyString(
				model?.organisation_id,
				Array.from(signals?.organisationIds ?? [])[0],
				modelId.split("/")[0],
			) ?? "";

		const compactModel: ModelsPageModel = {
			model_id: modelId,
			name: displayName,
			organisation_id: fallbackOrganisationId,
			description: model?.description ?? null,
			organisation_name:
				normalizeOrganisationDisplayName(
					model?.organisation_name,
					fallbackOrganisationId,
				) ?? null,
			organisation_colour: model?.organisation_colour ?? null,
			primary_date: resolvedPrimaryDate,
			primary_timestamp: resolvedPrimaryTimestamp,
			primary_group_key: resolvedPrimaryGroupKey,
			gateway_status: gatewayStatus,
			gateway_provider_count: providerCount,
			gateway_active_provider_count: activeProviderCount,
			gateway_endpoints: Array.from(signals?.endpoints ?? []).sort(),
			gateway_input_modalities: (() => {
				const gatewayValues = Array.from(signals?.inputModalities ?? []).sort();
				if (gatewayValues.length > 0)
					return normalizeModalityList(gatewayValues);
				return normalizeModalityList(
					normalizeStringList(model?.input_types ?? model?.input_modalities),
				);
			})(),
			gateway_output_modalities: (() => {
				const gatewayValues = Array.from(
					signals?.outputModalities ?? [],
				).sort();
				if (gatewayValues.length > 0)
					return normalizeModalityList(gatewayValues);
				return normalizeModelModalityList(
					normalizeStringList(model?.output_types ?? model?.output_modalities),
					{ realtime: hasRealtimeModelHint(model) },
				);
			})(),
			gateway_features: Array.from(signals?.features ?? []).sort(),
			gateway_tiers: Array.from(signals?.tiers ?? []).sort(),
			gateway_provider_names: Array.from(signals?.providerNames ?? []).sort(),
			gateway_active_provider_names: Array.from(
				signals?.activeProviderNames ?? [],
			).sort(),
			gateway_execution_regions: Array.from(
				signals?.executionRegions ?? [],
			).sort(),
			gateway_provider_details: Array.from(
				signals?.providerDetails?.values() ?? [],
			)
				.map((provider) => ({
					id: String(provider.id ?? "").trim(),
					name: String(provider.name ?? "").trim(),
					status: provider.status,
					is_active: Boolean(provider.isActive),
				}))
				.filter((provider) => provider.name)
				.sort((a, b) => {
					if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
					return a.name.localeCompare(b.name);
				}),
			gateway_api_model_ids: sortApiModelIdsForDisplay(signals?.apiModelIds),
			context_lengths: Array.from(signals?.contextLengths ?? []).sort(
				(a, b) => a - b,
			),
			supported_parameters: Array.from(
				signals?.supportedParameters ?? [],
			).sort(),
			lowest_input_price:
				signals?.lowestInputPrice ?? catalogPricing?.lowestInputPrice ?? null,
			lowest_output_price:
				signals?.lowestOutputPrice ?? catalogPricing?.lowestOutputPrice ?? null,
			lowest_standard_input_price:
				signals?.lowestStandardInputPrice ??
				catalogPricing?.lowestStandardInputPrice ??
				null,
			lowest_standard_output_price:
				signals?.lowestStandardOutputPrice ??
				catalogPricing?.lowestStandardOutputPrice ??
				null,
			lowest_standard_input_price_label:
				signals?.lowestStandardInputPriceLabel ??
				catalogPricing?.lowestStandardInputPriceLabel ??
				null,
			lowest_standard_input_price_unit:
				signals?.lowestStandardInputPriceUnit ??
				catalogPricing?.lowestStandardInputPriceUnit ??
				null,
			lowest_standard_output_price_label:
				signals?.lowestStandardOutputPriceLabel ??
				catalogPricing?.lowestStandardOutputPriceLabel ??
				null,
			lowest_standard_output_price_unit:
				signals?.lowestStandardOutputPriceUnit ??
				catalogPricing?.lowestStandardOutputPriceUnit ??
				null,
			lowest_from_price:
				signals?.lowestFromPrice ?? catalogPricing?.lowestFromPrice ?? null,
			lowest_from_price_unit:
				signals?.lowestFromPriceUnit ??
				catalogPricing?.lowestFromPriceUnit ??
				null,
			pricing_detail_rows: (() => {
				const gatewayRows = mergePricingDetailRows(
					(signals?.pricingDetailRows ?? []).slice(0, 12),
				).slice(0, 6);
				return gatewayRows.length > 0
					? gatewayRows
					: (catalogPricing?.pricingDetailRows ?? []);
			})(),
			popularity_tokens_week: weeklyMetrics.tokensWeek,
			throughput_week: weeklyMetrics.throughputWeek,
			latency_week: weeklyMetrics.latencyWeek,
		};

		return compactModel;
	});

	const apiBackedTailKeys = new Set<string>();
	const apiBackedNameDateKeys = new Set<string>();
	for (const model of enriched) {
		const org = String(model.organisation_id ?? "")
			.trim()
			.toLowerCase();
		if (!org) continue;

		const tail = normalizeModelTailForDedup(model.model_id);
		if (tail) apiBackedTailKeys.add(`${org}::${tail}`);

		const name = normalizeModelNameForDedup(model.name ?? "");
		const date = String(model.primary_date ?? "").trim();
		if (name) apiBackedNameDateKeys.add(`${org}::${name}::${date}`);
	}

	const internalOnly = baseModels
		.filter((model) => {
			const modelId = String(model.model_id ?? "").trim();
			if (!modelId) return false;
			if (signalsByModelId.has(modelId)) return false;

			const org = String(model.organisation_id ?? "")
				.trim()
				.toLowerCase();
			if (!org) return true;

			const tail = normalizeModelTailForDedup(modelId);
			if (tail && apiBackedTailKeys.has(`${org}::${tail}`)) {
				return false;
			}

			const name = normalizeModelNameForDedup(model.name ?? "");
			const date = String(model.primary_date ?? "").trim();
			if (name && apiBackedNameDateKeys.has(`${org}::${name}::${date}`)) {
				return false;
			}

			return true;
		})
		.map((model) => {
			const weeklyMetrics = resolveModelWeeklyMetrics(
				model,
				undefined,
				weeklyMetricsByKey,
			);
			const modelId = String(model.model_id ?? "").trim();
			const catalogPricing = catalogPricingSummaries[modelId];

			return {
				model_id: modelId,
				name: model.name ?? modelId,
				organisation_id: model.organisation_id ?? "",
				description: model.description ?? null,
				organisation_name:
					normalizeOrganisationDisplayName(
						model.organisation_name,
						model.organisation_id,
					) ?? null,
				organisation_colour: model.organisation_colour ?? null,
				primary_date: model.primary_date ?? null,
				primary_timestamp: model.primary_timestamp ?? null,
				primary_group_key: model.primary_group_key ?? null,
				gateway_status: getCatalogOnlyGatewayStatus(model),
				gateway_provider_count: 0,
				gateway_active_provider_count: 0,
				gateway_endpoints: [],
				gateway_input_modalities: normalizeModelModalityList(
					normalizeStringList(model.input_types ?? model.input_modalities),
				),
				gateway_output_modalities: normalizeModelModalityList(
					normalizeStringList(model.output_types ?? model.output_modalities),
					{ realtime: hasRealtimeModelHint(model) },
				),
				gateway_features: [],
				gateway_provider_names: [],
				gateway_active_provider_names: [],
				gateway_execution_regions: [],
				gateway_provider_details: [],
				gateway_api_model_ids: sortApiModelIdsForDisplay(
					catalogPricing?.apiModelIds,
				),
				context_lengths: [],
				supported_parameters: [],
				lowest_input_price: catalogPricing?.lowestInputPrice ?? null,
				lowest_output_price: catalogPricing?.lowestOutputPrice ?? null,
				lowest_standard_input_price:
					catalogPricing?.lowestStandardInputPrice ?? null,
				lowest_standard_output_price:
					catalogPricing?.lowestStandardOutputPrice ?? null,
				lowest_standard_input_price_label:
					catalogPricing?.lowestStandardInputPriceLabel ?? null,
				lowest_standard_input_price_unit:
					catalogPricing?.lowestStandardInputPriceUnit ?? null,
				lowest_standard_output_price_label:
					catalogPricing?.lowestStandardOutputPriceLabel ?? null,
				lowest_standard_output_price_unit:
					catalogPricing?.lowestStandardOutputPriceUnit ?? null,
				lowest_from_price: catalogPricing?.lowestFromPrice ?? null,
				lowest_from_price_unit: catalogPricing?.lowestFromPriceUnit ?? null,
				pricing_detail_rows: catalogPricing?.pricingDetailRows ?? [],
				popularity_tokens_week: weeklyMetrics.tokensWeek,
				throughput_week: weeklyMetrics.throughputWeek,
				latency_week: weeklyMetrics.latencyWeek,
			} satisfies ModelsPageModel;
		});

	return [...enriched, ...internalOnly].sort((a, b) => {
		const tsA = a.primary_timestamp ?? Number.NEGATIVE_INFINITY;
		const tsB = b.primary_timestamp ?? Number.NEGATIVE_INFINITY;
		if (tsA !== tsB) return tsB - tsA;

		const orgA = a.organisation_name ?? "";
		const orgB = b.organisation_name ?? "";
		const orgCompare = orgA.localeCompare(orgB);
		if (orgCompare !== 0) return orgCompare;

		return (a.name ?? "").localeCompare(b.name ?? "");
	});
}

function buildFreeRouterModelsPageEntry(
	overview: Awaited<ReturnType<typeof fetchFrontendFreeRouterOverview>>,
): ModelsPageModel {
	const inputModalities = Array.from(
		new Set(overview.models.flatMap((model) => model.inputModalities ?? [])),
	).sort((a, b) => a.localeCompare(b));
	const outputModalities = Array.from(
		new Set(overview.models.flatMap((model) => model.outputModalities ?? [])),
	).sort((a, b) => a.localeCompare(b));

	return {
		model_id: FREE_ROUTER_MODEL_ID,
		name: FREE_ROUTER_NAME,
		organisation_id: FREE_ROUTER_ORGANISATION_ID,
		organisation_name: "Phaseo",
		organisation_colour: null,
		description: FREE_ROUTER_DESCRIPTION,
		primary_date: FREE_ROUTER_PRIMARY_DATE,
		primary_timestamp: FREE_ROUTER_PRIMARY_TIMESTAMP,
		primary_group_key: FREE_ROUTER_PRIMARY_DATE.slice(0, 7),
		gateway_status:
			overview.summary.eligibleProviders > 0 ? "active" : "inactive",
		gateway_provider_count: overview.summary.eligibleProviders,
		gateway_active_provider_count: overview.summary.eligibleProviders,
		gateway_endpoints: ["chat/completions", "responses", "messages"],
		gateway_input_modalities:
			inputModalities.length > 0 ? inputModalities : ["text"],
		gateway_output_modalities:
			outputModalities.length > 0 ? outputModalities : ["text"],
		gateway_features: ["routing", "free"],
		gateway_tiers: ["free"],
		gateway_provider_names: [],
		gateway_active_provider_names: [],
		gateway_execution_regions: [],
		gateway_provider_details: [],
		gateway_api_model_ids: ["phaseo/free:text.generate:free"],
		context_lengths: [],
		supported_parameters: [],
		lowest_input_price: 0,
		lowest_output_price: 0,
		lowest_standard_input_price: 0,
		lowest_standard_output_price: 0,
		lowest_standard_input_price_label: "Input",
		lowest_standard_input_price_unit: "1M tokens",
		lowest_standard_output_price_label: "Output",
		lowest_standard_output_price_unit: "1M tokens",
		lowest_from_price: 0,
		lowest_from_price_unit: "1M tokens",
		pricing_detail_rows: [
			{ label: "Input", value: "$0 / 1M tokens" },
			{ label: "Output", value: "$0 / 1M tokens" },
		],
		popularity_tokens_week: null,
		throughput_week: null,
		latency_week: null,
		router_requests_30d: overview.summary.routedRequests30d,
		router_spend_nanos_30d: overview.summary.totalCostNanos30d,
	};
}

async function loadModelsPageData(
	catalogueVersion: ModelsCatalogueVersion,
): Promise<ModelsPageData> {
	const apiOrigin =
		process.env.WEB_API_ORIGIN?.replace(/\/$/, "") ?? "https://phaseo.app";
	const allModelsPromise = fetchModelsFromWebApi(apiOrigin, catalogueVersion, 6);
	const catalogPricingSummariesPromise = allModelsPromise.then((result) =>
		result.pricingComplete ? Promise.resolve({}) : getCatalogPricingSummariesCached(),
	);
	const freeRouterOverviewPromise = catalogueVersion === "v2"
		? fetchFrontendFreeRouterOverview()
		: Promise.resolve(null);
	const [allModelsResult, freeRouterOverview, catalogPricingSummaries] =
		await Promise.all([
			allModelsPromise,
			freeRouterOverviewPromise,
			catalogPricingSummariesPromise,
		]);
	const allModels = allModelsResult.models;
	const models = catalogueVersion === "v1"
		? allModelsResult.pricingComplete
			? allModels as ModelsPageModel[]
			: withMissingCatalogPricing(allModels as ModelsPageModel[], catalogPricingSummaries)
		: withGatewayMetadata(
			allModels,
			allModels.flatMap((model) => model.gateway_monitor_rows ?? []),
			catalogPricingSummaries,
		);
	const modelsWithVirtualEntries = catalogueVersion === "v1"
		? models
		: [
			buildFreeRouterModelsPageEntry(freeRouterOverview!),
			...models.filter((model) => model.model_id !== FREE_ROUTER_MODEL_ID),
		];
	const facets = catalogueVersion === "v1" && allModelsResult.facets
		? allModelsResult.facets
		: buildModelsFilterFacets(modelsWithVirtualEntries);
	return { models: modelsWithVirtualEntries, facets };
}

export default async function ModelsPage() {
	const catalogueVersion: ModelsCatalogueVersion =
		(await isAdminViewer()) && (await modelsCatalogueV2Flag()) ? "v2" : "v1";

	return catalogueVersion === "v2" ? (
		<ModelsDisplay dataPromise={loadModelsPageData("v2")} />
	) : (
		<ModelsPageClient />
	);
}
