"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	parseAsArrayOf,
	parseAsInteger,
	parseAsJson,
	parseAsString,
	useQueryStates,
} from "nuqs";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { ToolPageHeader } from "@/components/(tools)/ToolPageHeader";
import { DisplayNumber } from "@/components/display/DisplayValue";
import {
	ModelSelector,
	UsageInputs,
	CostBreakdown,
	PricingReference,
} from "@/components/(tools)/pricing-calculator";
import type { SelectedPricingModelConfig } from "@/components/(tools)/pricing-calculator/ModelSelector";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import {
	comparePricingEndpoints,
	createModelSelectionId,
	sameStringArray,
	sanitizeMeterInputs,
	sanitizeModelConfigs,
	sanitizeModelSelections,
	sanitizePricingTime,
	sanitizeRequestMultiplier,
} from "@/components/(tools)/pricing-calculator/calculatorState";
import type { CalculatorModelSelection } from "@/components/(tools)/pricing-calculator/calculatorState";
import type { CalculatorCatalogModel } from "@/components/(tools)/pricing-calculator/calculatorState";
import { loadPricingCalculatorModels } from "@/app/(dashboard)/tools/pricing-calculator/actions";
import {
	type PricingMeter,
} from "@/components/(data)/model/pricing/pricingHelpers";
import { selectPricingMetersForUsage } from "@/components/(tools)/pricing-calculator/pricingMeterConditions";

function getCurrentUtcTime() {
	return new Date().toISOString().slice(11, 16);
}

type PricingModel = {
	provider: string;
	model: string;
	endpoint: string;
	display_name?: string;
	release_date?: string | null;
	announcement_date?: string | null;
	pricing_plan?: string | null;
	meters: PricingMeter[];
};

type PricingCalculatorProps = {
	initialModels?: PricingModel[];
	catalogModels?: CalculatorCatalogModel[];
	cachedModels?: GatewaySupportedModel[];
	initialModel?: string;
	initialEndpoint?: string;
	initialProvider?: string;
	initialPlan?: string;
	initialSelectedModels?: string[];
	initialSelections?: CalculatorModelSelection[];
	initialModelConfigs?: Record<string, SelectedPricingModelConfig>;
	initialMeterInputs?: Record<string, string>;
	initialRequestMultiplier?: number;
	initialPricingTimeUtc?: string;
	totalModelsCount?: number;
	providersCount?: number;
};

type SelectedPricingModel = PricingModel & {
	key: string;
	label: string;
	pricingPlan: string;
	allMeters: PricingMeter[];
};

function mergePricingModels(current: PricingModel[], incoming: PricingModel[]): PricingModel[] {
	const rows = new Map(current.map((row) => [
		`${row.provider}:${row.model}:${row.endpoint}:${row.pricing_plan || "standard"}`,
		row,
	]));
	for (const row of incoming) {
		rows.set(
			`${row.provider}:${row.model}:${row.endpoint}:${row.pricing_plan || "standard"}`,
			row,
		);
	}
	return [...rows.values()];
}

function resolveDefaultPricingConfig(
	models: PricingModel[],
	modelId: string,
	preferred?: Partial<SelectedPricingModelConfig>,
): SelectedPricingModelConfig | null {
	const rows = models.filter((row) => row.model === modelId);
	if (rows.length === 0) return null;
	const endpoints = [...new Set(rows.map((row) => row.endpoint))].sort(comparePricingEndpoints);
	const endpoint = preferred?.endpoint && endpoints.includes(preferred.endpoint)
		? preferred.endpoint
		: endpoints[0] || "";
	const providerRows = rows.filter((row) => row.endpoint === endpoint);
	const providers = [...new Set(providerRows.map((row) => row.provider))].sort();
	const provider = preferred?.provider && providers.includes(preferred.provider)
		? preferred.provider
		: providers[0] || "";
	const plans = [...new Set(providerRows
		.filter((row) => row.provider === provider)
		.map((row) => row.pricing_plan || "standard"))]
		.sort((left, right) => {
			if (left === "standard") return -1;
			if (right === "standard") return 1;
			return left.localeCompare(right);
		});
	const pricingPlan = preferred?.pricingPlan && plans.includes(preferred.pricingPlan)
		? preferred.pricingPlan
		: plans[0] || "";
	return endpoint && provider && pricingPlan ? { endpoint, provider, pricingPlan } : null;
}

export default function PricingCalculator({
	initialModels,
	catalogModels = [],
	cachedModels = [],
	initialModel,
	initialEndpoint,
	initialProvider,
	initialPlan,
	initialSelectedModels = [],
	initialSelections = [],
	initialModelConfigs = {},
	initialMeterInputs = {},
	initialRequestMultiplier = 1,
	initialPricingTimeUtc,
	totalModelsCount = 500,
	providersCount = 10,
}: PricingCalculatorProps) {
	const [models, setModels] = useState<PricingModel[]>(() => initialModels || []);
	const [loadingModelIds, setLoadingModelIds] = useState<string[]>([]);
	const [pricingNotice, setPricingNotice] = useState<string | null>(null);

	const [queryState, setQueryState] = useQueryStates({
		model: parseAsString.withDefault(initialModel || "").withOptions({ clearOnDefault: false }),
		endpoint: parseAsString.withDefault(initialEndpoint || "").withOptions({ clearOnDefault: false }),
		provider: parseAsString.withDefault(initialProvider || "").withOptions({ clearOnDefault: false }),
		plan: parseAsString.withDefault(initialPlan || "").withOptions({ clearOnDefault: false }),
		models: parseAsArrayOf(parseAsString).withDefault(
			initialSelectedModels.length > 0
				? initialSelectedModels
				: initialModel
					? [initialModel]
					: []
		).withOptions({ clearOnDefault: false }),
		selections: parseAsJson<CalculatorModelSelection[]>((value) =>
			Array.isArray(value) ? sanitizeModelSelections(value) : null
		).withDefault(initialSelections).withOptions({ clearOnDefault: false }),
		configs: parseAsJson<Record<string, SelectedPricingModelConfig>>((value) =>
			value && typeof value === "object" && !Array.isArray(value)
				? value as Record<string, SelectedPricingModelConfig>
				: null
		).withDefault(
			initialModelConfigs
		).withOptions({ clearOnDefault: false }),
		usage: parseAsJson<Record<string, string>>((value) =>
			value && typeof value === "object" && !Array.isArray(value)
				? value as Record<string, string>
				: null
		).withDefault(initialMeterInputs).withOptions({ clearOnDefault: false }),
		requests: parseAsInteger.withDefault(
			sanitizeRequestMultiplier(initialRequestMultiplier)
		).withOptions({ clearOnDefault: false }),
		time: parseAsString.withDefault(initialPricingTimeUtc || "").withOptions({ clearOnDefault: false }),
	});

	const getDefaultConfig = useCallback((
		modelId: string,
		preferred?: Partial<SelectedPricingModelConfig>
	): SelectedPricingModelConfig | null =>
		resolveDefaultPricingConfig(models, modelId, preferred), [models]);
	const catalogModelIds = useMemo(
		() => new Set(catalogModels.map((model) => model.modelId)),
		[catalogModels],
	);

	const selectedModels = useMemo<CalculatorModelSelection[]>(() => {
		const explicitSelections = sanitizeModelSelections(queryState.selections).filter(
			(selection) => catalogModelIds.has(selection.modelId)
		);
		if (explicitSelections.length > 0) return explicitSelections;
		const legacyModelIds = queryState.models.length > 0
			? queryState.models
			: queryState.model
				? [queryState.model]
				: [];
		const legacySelections = legacyModelIds
			.filter((modelId) => catalogModelIds.has(modelId))
			.reduce<CalculatorModelSelection[]>((selections, modelId) => [
				...selections,
				{ id: createModelSelectionId(modelId, selections), modelId },
			], []);
		if (legacySelections.length > 0) return legacySelections;
		return [];
	}, [catalogModelIds, queryState.model, queryState.models, queryState.selections]);
	const selectedModelIds = useMemo(
		() => selectedModels.map((selection) => selection.modelId),
		[selectedModels]
	);

	const requestedConfigs = useMemo(
		() => sanitizeModelConfigs(queryState.configs),
		[queryState.configs]
	);
	const modelConfigs = useMemo(() => {
		const next: Record<string, SelectedPricingModelConfig> = {};
		for (const [index, selection] of selectedModels.entries()) {
			const preferred = requestedConfigs[selection.id] ??
				(index === 0 ? requestedConfigs[selection.modelId] : undefined) ?? (index === 0
				? {
					endpoint: queryState.endpoint,
					provider: queryState.provider,
					pricingPlan: queryState.plan,
				}
				: undefined);
			const config = getDefaultConfig(selection.modelId, preferred);
			if (config) next[selection.id] = config;
		}
		return next;
	}, [
		getDefaultConfig,
		queryState.endpoint,
		queryState.plan,
		queryState.provider,
		requestedConfigs,
		selectedModels,
	]);
	const meterInputs = useMemo(
		() => sanitizeMeterInputs(queryState.usage),
		[queryState.usage]
	);
	const requestMultiplier = sanitizeRequestMultiplier(queryState.requests);
	const pricingTimeUtc = sanitizePricingTime(queryState.time) || "00:00";

	useEffect(() => {
		if (sanitizePricingTime(queryState.time)) return;
		setQueryState({ time: getCurrentUtcTime() });
	}, [queryState.time, setQueryState]);

	useEffect(() => {
		const primarySelection = selectedModels[0];
		const primaryModelId = primarySelection?.modelId || "";
		const primaryConfig = primarySelection ? modelConfigs[primarySelection.id] : null;
		const configsMatch = JSON.stringify(queryState.configs) === JSON.stringify(modelConfigs);
		const usageMatches = JSON.stringify(queryState.usage) === JSON.stringify(meterInputs);
		const selectionsMatch = JSON.stringify(queryState.selections) === JSON.stringify(selectedModels);
		if (
			sameStringArray(queryState.models, selectedModelIds) &&
			selectionsMatch &&
			configsMatch &&
			usageMatches &&
			queryState.requests === requestMultiplier &&
			queryState.model === primaryModelId &&
			queryState.endpoint === (primaryConfig?.endpoint || "") &&
			queryState.provider === (primaryConfig?.provider || "") &&
			queryState.plan === (primaryConfig?.pricingPlan || "")
		) {
			return;
		}
		setQueryState({
			models: selectedModelIds,
			selections: selectedModels,
			configs: modelConfigs,
			usage: meterInputs,
			requests: requestMultiplier,
			model: primaryModelId,
			endpoint: primaryConfig?.endpoint || "",
			provider: primaryConfig?.provider || "",
			plan: primaryConfig?.pricingPlan || "",
		});
	}, [
		meterInputs,
		modelConfigs,
		queryState.configs,
		queryState.endpoint,
		queryState.model,
		queryState.models,
		queryState.plan,
		queryState.provider,
		queryState.requests,
		queryState.selections,
		queryState.usage,
		requestMultiplier,
		selectedModelIds,
		selectedModels,
		setQueryState,
	]);

	const selectedModelData = useMemo<SelectedPricingModel[]>(() => {
		return selectedModels
			.map((selection) => {
				const config = modelConfigs[selection.id] ?? getDefaultConfig(selection.modelId);
				if (!config) return null;
				const row = models.find(
					(item) =>
						item.model === selection.modelId &&
						item.endpoint === config.endpoint &&
						item.provider === config.provider &&
						(item.pricing_plan || "standard") === config.pricingPlan
				);
				if (!row) return null;
				return {
					...row,
					allMeters: row.meters,
					meters: selectPricingMetersForUsage(row.meters, meterInputs),
					key: selection.id,
					label: row.display_name || row.model,
					pricingPlan: config.pricingPlan,
				};
			})
			.filter((row): row is SelectedPricingModel => Boolean(row));
	}, [getDefaultConfig, meterInputs, modelConfigs, models, selectedModels]);

	const allSelectedMeters = useMemo(() => {
		const map = new Map<string, PricingMeter>();
		for (const model of selectedModelData) {
			for (const meter of model.meters) {
				if (!map.has(meter.meter)) {
					map.set(meter.meter, meter);
				}
			}
		}
		return Array.from(map.values());
	}, [selectedModelData]);

	const comparisonModels = useMemo(
		() =>
			selectedModelData.map((model) => ({
				key: model.key,
				label: model.label,
				modelId: model.model,
				provider: model.provider,
				pricingPlan: model.pricingPlan,
				meters: model.meters,
				allMeters: model.allMeters,
			})),
		[selectedModelData]
	);

	const handleAddModel = async (modelId: string) => {
		if (loadingModelIds.length > 0) return;
		setPricingNotice(null);
		let pricingRows = models.filter((row) => row.model === modelId);
		if (pricingRows.length === 0) {
			setLoadingModelIds([modelId]);
			try {
				pricingRows = await loadPricingCalculatorModels([modelId]);
				if (pricingRows.length > 0) {
					setModels((current) => mergePricingModels(current, pricingRows));
				}
			} catch {
				setPricingNotice("Pricing could not be loaded for this model. Please try again.");
				return;
			} finally {
				setLoadingModelIds([]);
			}
		}
		const defaultConfig = resolveDefaultPricingConfig(pricingRows, modelId);
		if (!defaultConfig) {
			const modelName = catalogModels.find((model) => model.modelId === modelId)?.displayName || modelId;
			setPricingNotice(`No pricing meters are currently published for ${modelName}.`);
			return;
		}
		const selection = {
			id: createModelSelectionId(modelId, selectedModels),
			modelId,
		};
		const nextSelections = [...selectedModels, selection];
		setQueryState({
			selections: nextSelections,
			models: nextSelections.map((item) => item.modelId),
			configs: { ...modelConfigs, [selection.id]: defaultConfig },
			usage: {},
		});
	};

	const handleRemoveModel = (selectionId: string) => {
		const nextSelections = selectedModels.filter((selection) => selection.id !== selectionId);
		const nextConfigs = { ...modelConfigs };
		delete nextConfigs[selectionId];
		setQueryState({
			selections: nextSelections,
			models: nextSelections.map((item) => item.modelId),
			configs: nextConfigs,
			usage: {},
		});
	};

	const handleUpdateModelConfig = (
		selectionId: string,
		patch: Partial<SelectedPricingModelConfig>
	) => {
		const selection = selectedModels.find((item) => item.id === selectionId);
		if (!selection) return;
		const existing = modelConfigs[selectionId] ?? getDefaultConfig(selection.modelId);
		const next = getDefaultConfig(selection.modelId, { ...existing, ...patch });
		if (!next) return;
		setQueryState({
			configs: { ...modelConfigs, [selectionId]: next },
			usage: {},
		});
	};

	const handleMeterInputChange = (meter: string, value: string) => {
		setQueryState({ usage: { ...meterInputs, [meter]: value } });
	};

	return (
		<div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:py-12">
			<ToolPageHeader title="AI Pricing Calculator" description="Select one or more models, configure their provider pricing, then compare every priced meter in a tabular view.">
					<div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
						<span className="inline-flex items-center gap-1 rounded-full border bg-background/70 px-2.5 py-1">
							<CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
							<DisplayNumber value={totalModelsCount} /> models
						</span>
						<span className="inline-flex items-center gap-1 rounded-full border bg-background/70 px-2.5 py-1">
							<CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
							<DisplayNumber value={providersCount} /> providers
						</span>
						<span className="inline-flex items-center gap-1 rounded-full border bg-background/70 px-2.5 py-1">
							<CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
							Time-window aware
						</span>
					</div>
			</ToolPageHeader>

			<div className="space-y-5">
				<ModelSelector
					models={models}
					catalogModels={catalogModels}
					cachedModels={cachedModels}
					selectedModels={selectedModels}
					modelConfigs={modelConfigs}
					loadingModelIds={loadingModelIds}
					pricingNotice={pricingNotice}
					onAddModel={handleAddModel}
					onRemoveModel={handleRemoveModel}
					onUpdateModelConfig={handleUpdateModelConfig}
				/>

						{allSelectedMeters.length > 0 ? (
							<UsageInputs
								meters={allSelectedMeters}
								meterInputs={meterInputs}
								requestMultiplier={requestMultiplier}
								pricingTimeUtc={pricingTimeUtc}
								onMeterInputChange={handleMeterInputChange}
								onRequestMultiplierChange={(value) =>
									setQueryState({ requests: sanitizeRequestMultiplier(value) })
								}
								onPricingTimeUtcChange={(value) =>
									setQueryState({ time: sanitizePricingTime(value) })
								}
							/>
						) : (
							<Card>
								<CardContent className="text-center py-12">
									<p className="text-muted-foreground">
										Select at least one model to configure usage inputs.
									</p>
								</CardContent>
							</Card>
						)}

				{selectedModelData.length > 0 ? (
					<>
						<PricingReference
							meters={selectedModelData[0]?.meters ?? []}
							pricingPlan={selectedModelData[0]?.pricing_plan}
							selectedModelId={selectedModelData[0]?.model}
							selectedModelLabel={selectedModelData[0]?.label}
							selectedProvider={selectedModelData[0]?.provider || ""}
							pricingTimeUtc={pricingTimeUtc}
							comparisonModels={comparisonModels}
						/>
						<CostBreakdown
							meters={allSelectedMeters}
							meterInputs={meterInputs}
							requestMultiplier={requestMultiplier}
							pricingTimeUtc={pricingTimeUtc}
							comparisonModels={comparisonModels}
						/>
					</>
				) : null}
			</div>
		</div>
	);
}
