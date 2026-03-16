import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import ModelsDisplay from "@/components/(data)/models/Models/ModelsDisplay";
import { ModelsPageSkeleton } from "@/components/(data)/models/Models/ModelsPageSkeleton";
import {
	getAllModelsCached,
	type ModelCard,
} from "@/lib/fetchers/models/getAllModels";
import { getMonitorModels } from "@/lib/fetchers/models/table-view/getMonitorModels";
import {
	getRankings,
	type RankingModel,
} from "@/lib/fetchers/rankings/getRankingsData";
import type { Metadata } from "next";
import { featureOrder } from "@/lib/config/featureLabels";
import type {
	GatewayStatusFilter,
	ModelsFilterFacets,
	ModelsPageModel,
	OptionCount,
} from "@/components/(data)/models/Models/modelsDisplay.types";

export const metadata: Metadata = {
	title: "AI models - Compare Benchmarks, Pricing & Providers",
	description:
		"Explore a comprehensive directory of AI models. Compare state-of-the-art models by benchmarks, features, providers, and pricing, and find the best AI model for your use case with AI Stats.",
	keywords: [
		"AI models",
		"machine learning models",
		"AI benchmarks",
		"compare AI models",
		"AI model pricing",
		"AI providers",
		"state-of-the-art models",
		"AI Stats",
	],
	alternates: {
		canonical: "/models",
	},
};

const MODALITY_FILTER_DISPLAY_ORDER = [
	"text",
	"image",
	"video",
	"audio",
	"file",
	"moderations",
	"embeddings",
] as const;

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

function normalizeModalityKey(value: string): string {
	const normalized = value.toLowerCase().replace(/[._/-]+/g, " ");
	if (normalized.includes("embed")) return "embeddings";
	if (normalized.includes("moderat")) return "moderations";
	if (normalized.includes("image")) return "image";
	if (normalized.includes("video")) return "video";
	if (normalized.includes("audio")) return "audio";
	if (normalized.includes("file")) return "file";
	if (normalized.includes("text")) return "text";
	if (normalized === "moderation") return "moderations";
	if (normalized === "embedding") return "embeddings";
	return normalized.trim();
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
				values
					.map((value) => normalizeModalityKey(value))
					.filter(Boolean),
			),
		),
	);
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
		| "gateway_provider_names"
		| "supported_parameters",
): OptionCount[] {
	const counts = new Map<string, number>();
	const isModalityField =
		field === "gateway_input_modalities" || field === "gateway_output_modalities";
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
		const creator = String(model.organisation_name ?? "").trim();
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

function buildModelsFilterFacets(models: ModelsPageModel[]): ModelsFilterFacets {
	const statusCounts: Record<GatewayStatusFilter, number> = {
		active: 0,
		not_active: 0,
	};

	for (const model of models) {
		const status: GatewayStatusFilter =
			model.gateway_status === "active" ? "active" : "not_active";
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
		supportedParameterOptions: buildOptionCounts(
			models,
			"supported_parameters",
		),
		providerOptions: buildOptionCounts(models, "gateway_provider_names"),
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
	providerDetails: Map<string, { id: string; name: string; isActive: boolean }>;
	apiModelIds: Set<string>;
	activeProviderIds: Set<string>;
	endpoints: Set<string>;
	inputModalities: Set<string>;
	outputModalities: Set<string>;
	features: Set<string>;
	contextLengths: Set<number>;
	supportedParameters: Set<string>;
	latestApiTimestamp: number | null;
	lowestInputPrice: number | null;
	lowestOutputPrice: number | null;
};

function createEmptyGatewaySignals(): GatewaySignals {
	return {
		displayNames: new Set<string>(),
		organisationIds: new Set<string>(),
		providerIds: new Set<string>(),
		providerNames: new Set<string>(),
		activeProviderNames: new Set<string>(),
		providerDetails: new Map<
			string,
			{ id: string; name: string; isActive: boolean }
		>(),
		apiModelIds: new Set<string>(),
		activeProviderIds: new Set<string>(),
		endpoints: new Set<string>(),
		inputModalities: new Set<string>(),
		outputModalities: new Set<string>(),
		features: new Set<string>(),
		contextLengths: new Set<number>(),
		supportedParameters: new Set<string>(),
		latestApiTimestamp: null,
		lowestInputPrice: null,
		lowestOutputPrice: null,
	};
}

function aggregateGatewaySignals(
	monitorRows: Awaited<ReturnType<typeof getMonitorModels>>["models"],
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
		const providerName = String(row.provider.name ?? "").trim();
		const providerDetailKey = providerId || providerName;
		if (providerId) {
			existing.providerIds.add(providerId);
			if (row.gatewayStatus === "active") {
				existing.activeProviderIds.add(providerId);
			}
		}
		if (providerName) {
			existing.providerNames.add(providerName);
			if (row.gatewayStatus === "active") {
				existing.activeProviderNames.add(providerName);
			}
		}
		if (providerDetailKey) {
			const previous = existing.providerDetails.get(providerDetailKey);
			const isActive = row.gatewayStatus === "active" || previous?.isActive === true;
			existing.providerDetails.set(providerDetailKey, {
				id: providerId,
				name: providerName || previous?.name || providerDetailKey,
				isActive,
			});
		}
		const apiModelId = String(row.apiModelId ?? "").trim();
		if (apiModelId) existing.apiModelIds.add(apiModelId);

		const endpoint = String(row.endpoint ?? "").trim();
		if (endpoint) existing.endpoints.add(endpoint);

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
		const contextLength = Number(row.context ?? 0);
		if (Number.isFinite(contextLength) && contextLength > 0) {
			existing.contextLengths.add(contextLength);
		}
		for (const parameter of row.supportedParameters ?? []) {
			const value = String(parameter ?? "").trim();
			if (value) existing.supportedParameters.add(value);
		}
		const inputPrice = Number(row.provider.inputPrice);
		if (Number.isFinite(inputPrice) && inputPrice >= 0) {
			existing.lowestInputPrice =
				existing.lowestInputPrice === null
					? inputPrice
					: Math.min(existing.lowestInputPrice, inputPrice);
		}
		const outputPrice = Number(row.provider.outputPrice);
		if (Number.isFinite(outputPrice) && outputPrice >= 0) {
			existing.lowestOutputPrice =
				existing.lowestOutputPrice === null
					? outputPrice
					: Math.min(existing.lowestOutputPrice, outputPrice);
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
			(values ?? [])
				.map((value) => String(value ?? "").trim())
				.filter(Boolean),
		),
	);
}

function normalizeModelTailForDedup(modelId: string): string {
	const trimmed = String(modelId ?? "").trim().toLowerCase();
	if (!trimmed) return "";
	const tail = trimmed.includes("/") ? trimmed.split("/").slice(1).join("/") : trimmed;
	return tail
		.replace(/[._/]+/g, "-")
		.replace(/-\d{4}(?:-\d{2}){2}$/g, "")
		.replace(/-\d{4}-\d{2}$/g, "")
		.replace(/-\d{4}$/g, "")
		.replace(/-latest$/g, "")
		.replace(/-preview$/g, "")
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

type RankingAccumulator = {
	tokensWeek: number;
	throughputWeightedSum: number;
	throughputWeight: number;
	latencyWeightedSum: number;
	latencyWeight: number;
};

function normalizeRankingModelKey(value: string): string {
	return String(value ?? "").trim().toLowerCase();
}

function aggregateWeeklyRankingMetrics(
	rankingRows: RankingModel[],
): Map<string, WeeklyRankingMetrics> {
	const accumulators = new Map<string, RankingAccumulator>();

	for (const row of rankingRows) {
		const key = normalizeRankingModelKey(row.model_id);
		if (!key || key === "unknown" || key === "other") continue;

		const acc = accumulators.get(key) ?? {
			tokensWeek: 0,
			throughputWeightedSum: 0,
			throughputWeight: 0,
			latencyWeightedSum: 0,
			latencyWeight: 0,
		};

		const tokens = Number(row.total_tokens ?? 0);
		if (Number.isFinite(tokens) && tokens > 0) {
			acc.tokensWeek += tokens;
		}

		const requests = Number(row.requests ?? 0);
		const weight = Number.isFinite(requests) && requests > 0 ? requests : 0;
		const throughput = Number(row.median_throughput);
		if (Number.isFinite(throughput) && throughput > 0 && weight > 0) {
			acc.throughputWeightedSum += throughput * weight;
			acc.throughputWeight += weight;
		}
		const latency = Number(row.median_latency_ms);
		if (Number.isFinite(latency) && latency > 0 && weight > 0) {
			acc.latencyWeightedSum += latency * weight;
			acc.latencyWeight += weight;
		}

		accumulators.set(key, acc);
	}

	return new Map(
		Array.from(accumulators.entries()).map(([key, acc]) => [
			key,
			{
				tokensWeek: acc.tokensWeek > 0 ? acc.tokensWeek : null,
				throughputWeek:
					acc.throughputWeight > 0
						? acc.throughputWeightedSum / acc.throughputWeight
						: null,
				latencyWeek:
					acc.latencyWeight > 0 ? acc.latencyWeightedSum / acc.latencyWeight : null,
			},
		]),
	);
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

function withGatewayMetadata(
	baseModels: ModelCard[],
	monitorRows: Awaited<ReturnType<typeof getMonitorModels>>["models"],
	rankingRows: RankingModel[],
): ModelsPageModel[] {
	const signalsByModelId = aggregateGatewaySignals(monitorRows);
	const weeklyMetricsByKey = aggregateWeeklyRankingMetrics(rankingRows);
	const baseModelById = new Map(
		baseModels.map((model) => [String(model.model_id ?? "").trim(), model]),
	);
	const canonicalModelIds = Array.from(signalsByModelId.keys()).filter(Boolean);

	const enriched = canonicalModelIds.map((modelId) => {
		const model = baseModelById.get(modelId);
		const signals = signalsByModelId.get(modelId);
		const weeklyMetrics = resolveModelWeeklyMetrics(
			model ?? ({ model_id: modelId, name: modelId, organisation_id: "" } as ModelCard),
			signals,
			weeklyMetricsByKey,
		);
		const providerCount = signals?.providerIds.size ?? 0;
		const activeProviderCount = signals?.activeProviderIds.size ?? 0;

		const gatewayStatus: NonNullable<ModelCard["gateway_status"]> =
			activeProviderCount > 0
				? "active"
				: providerCount > 0
					? "inactive"
					: "not_listed";
		const apiTimestamp = signals?.latestApiTimestamp ?? null;
		const resolvedPrimaryTimestamp = model?.primary_timestamp ?? apiTimestamp;
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
			model?.name ??
			Array.from(signals?.displayNames ?? [])[0] ??
			modelId.split("/").slice(-1)[0] ??
			modelId;
		const fallbackOrganisationId =
			model?.organisation_id ??
			Array.from(signals?.organisationIds ?? [])[0] ??
			modelId.split("/")[0] ??
			"";

		const compactModel: ModelsPageModel = {
			model_id: modelId,
			name: fallbackName,
			organisation_id: fallbackOrganisationId,
			organisation_name: model?.organisation_name ?? null,
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
				if (gatewayValues.length > 0) return normalizeModalityList(gatewayValues);
				return normalizeModalityList(
					normalizeStringList(model?.input_types ?? model?.input_modalities),
				);
			})(),
			gateway_output_modalities: (() => {
				const gatewayValues = Array.from(signals?.outputModalities ?? []).sort();
				if (gatewayValues.length > 0) return normalizeModalityList(gatewayValues);
				return normalizeModalityList(
					normalizeStringList(model?.output_types ?? model?.output_modalities),
				);
			})(),
			gateway_features: Array.from(signals?.features ?? []).sort(),
			gateway_provider_names: Array.from(signals?.providerNames ?? []).sort(),
			gateway_active_provider_names: Array.from(
				signals?.activeProviderNames ?? [],
			).sort(),
			gateway_provider_details: Array.from(
				signals?.providerDetails?.values() ?? [],
			)
				.map((provider) => ({
					id: String(provider.id ?? "").trim(),
					name: String(provider.name ?? "").trim(),
					is_active: Boolean(provider.isActive),
				}))
				.filter((provider) => provider.name)
				.sort((a, b) => {
					if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
					return a.name.localeCompare(b.name);
				}),
			gateway_api_model_ids: Array.from(signals?.apiModelIds ?? []).sort(),
			context_lengths: Array.from(signals?.contextLengths ?? []).sort(
				(a, b) => a - b,
			),
			supported_parameters: Array.from(
				signals?.supportedParameters ?? [],
			).sort(),
			lowest_input_price: signals?.lowestInputPrice ?? null,
			lowest_output_price: signals?.lowestOutputPrice ?? null,
			popularity_tokens_week: weeklyMetrics.tokensWeek,
			throughput_week: weeklyMetrics.throughputWeek,
			latency_week: weeklyMetrics.latencyWeek,
		};

		return compactModel;
	});

	const apiBackedTailKeys = new Set<string>();
	const apiBackedNameDateKeys = new Set<string>();
	for (const model of enriched) {
		const org = String(model.organisation_id ?? "").trim().toLowerCase();
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

			const org = String(model.organisation_id ?? "").trim().toLowerCase();
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

			return {
				model_id: modelId,
				name: model.name ?? modelId,
				organisation_id: model.organisation_id ?? "",
				organisation_name: model.organisation_name ?? null,
				organisation_colour: model.organisation_colour ?? null,
				primary_date: model.primary_date ?? null,
				primary_timestamp: model.primary_timestamp ?? null,
				primary_group_key: model.primary_group_key ?? null,
				gateway_status: "not_listed" as const,
				gateway_provider_count: 0,
				gateway_active_provider_count: 0,
				gateway_endpoints: [],
				gateway_input_modalities: normalizeModalityList(
					normalizeStringList(model.input_types ?? model.input_modalities),
				),
				gateway_output_modalities: normalizeModalityList(
					normalizeStringList(model.output_types ?? model.output_modalities),
				),
				gateway_features: [],
				gateway_provider_names: [],
				gateway_active_provider_names: [],
				gateway_provider_details: [],
				gateway_api_model_ids: [],
				context_lengths: [],
				supported_parameters: [],
				lowest_input_price: null,
				lowest_output_price: null,
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

async function ModelsPageContent() {
	"use cache";

	cacheLife("hours");
	cacheTag("page:models");

	const includeHidden = false;
	const [monitorResult, rankingsResult, allModels] = await Promise.all([
		getMonitorModels({}, includeHidden),
		getRankings("week", "tokens", 3000),
		getAllModelsCached(includeHidden),
	]);
	const models = withGatewayMetadata(
		allModels,
		monitorResult.models,
		rankingsResult.rankings,
	);
	const facets = buildModelsFilterFacets(models);

	return <ModelsDisplay models={models} facets={facets} />;
}

function ModelsGridSkeleton() {
	return <ModelsPageSkeleton />;
}

export default function ModelsPage() {
	return (
		<Suspense fallback={<ModelsGridSkeleton />}>
			<ModelsPageContent />
		</Suspense>
	);
}
