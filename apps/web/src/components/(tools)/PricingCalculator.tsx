"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import {
	ModelSelector,
	UsageInputs,
	CostBreakdown,
	PricingReference,
} from "@/components/(tools)/pricing-calculator";
import type { SelectedPricingModelConfig } from "@/components/(tools)/pricing-calculator/ModelSelector";
import {
	type PricingMeter,
} from "@/components/(data)/model/pricing/pricingHelpers";

function getCurrentUtcTime() {
	return new Date().toISOString().slice(11, 16);
}

function releaseTimestamp(
	releaseDate?: string | null,
	announcementDate?: string | null
): number {
	const parsed = Date.parse(releaseDate || announcementDate || "");
	return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
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
	initialModel?: string;
	initialEndpoint?: string;
	initialProvider?: string;
	initialPlan?: string;
	totalModelsCount?: number;
	providersCount?: number;
};

type SelectedPricingModel = PricingModel & {
	key: string;
	label: string;
	pricingPlan: string;
};

export default function PricingCalculator({
	initialModels,
	initialModel,
	initialEndpoint,
	initialProvider,
	initialPlan,
	totalModelsCount = 500,
	providersCount = 10,
}: PricingCalculatorProps) {
	const models = useMemo(() => initialModels || [], [initialModels]);

	const roundedTotalModelsCount = useMemo(
		() => Math.ceil(totalModelsCount / 50) * 50,
		[totalModelsCount]
	);

	const [selectedModelId, setSelectedModelId] = useQueryState("model", {
		defaultValue: initialModel || "",
	});
	const [, setSelectedEndpoint] = useQueryState("endpoint", {
		defaultValue: initialEndpoint || "",
	});
	const [, setSelectedProvider] = useQueryState("provider", {
		defaultValue: initialProvider || "",
	});
	const [, setSelectedPricingPlan] = useQueryState("plan", {
		defaultValue: initialPlan || "",
	});

	const [selectedModelIds, setSelectedModelIds] = useState<string[]>(
		initialModel ? [initialModel] : []
	);
	const [modelConfigs, setModelConfigs] = useState<
		Record<string, SelectedPricingModelConfig>
	>({});
	const [meterInputs, setMeterInputs] = useState<Record<string, string>>({});
	const [requestMultiplier, setRequestMultiplier] = useState<number>(1);
	const [pricingTimeUtc, setPricingTimeUtc] = useState<string>("00:00");

	useEffect(() => {
		setPricingTimeUtc(getCurrentUtcTime());
	}, []);

	const modelsByReleaseDate = useMemo(() => {
		const unique = new Map<
			string,
			{
				modelId: string;
				displayName: string;
				releaseDate?: string | null;
				announcementDate?: string | null;
			}
		>();
		for (const row of models) {
			if (!unique.has(row.model)) {
				unique.set(row.model, {
					modelId: row.model,
					displayName: row.display_name || row.model,
					releaseDate: row.release_date,
					announcementDate: row.announcement_date,
				});
			}
		}
		return Array.from(unique.values()).sort((a, b) => {
			const dateDiff =
				releaseTimestamp(b.releaseDate, b.announcementDate) -
				releaseTimestamp(a.releaseDate, a.announcementDate);
			if (dateDiff !== 0) return dateDiff;
			return a.displayName.localeCompare(b.displayName);
		});
	}, [models]);

	const selectionOptions = useMemo(() => {
		const map = new Map<
			string,
			Map<string, Map<string, Set<string>>>
		>();

		for (const row of models) {
			if (!map.has(row.model)) {
				map.set(row.model, new Map());
			}
			const endpointMap = map.get(row.model)!;
			if (!endpointMap.has(row.endpoint)) {
				endpointMap.set(row.endpoint, new Map());
			}
			const providerMap = endpointMap.get(row.endpoint)!;
			if (!providerMap.has(row.provider)) {
				providerMap.set(row.provider, new Set());
			}
			providerMap.get(row.provider)!.add(row.pricing_plan || "standard");
		}

		return map;
	}, [models]);

	const getDefaultConfig = (
		modelId: string,
		preferred?: Partial<SelectedPricingModelConfig>
	): SelectedPricingModelConfig | null => {
		const endpointMap = selectionOptions.get(modelId);
		if (!endpointMap) return null;

		const endpoints = Array.from(endpointMap.keys()).sort();
		const endpoint =
			preferred?.endpoint && endpointMap.has(preferred.endpoint)
				? preferred.endpoint
				: endpoints[0] || "";
		const providerMap = endpointMap.get(endpoint);
		if (!providerMap) return null;

		const providers = Array.from(providerMap.keys()).sort();
		const provider =
			preferred?.provider && providerMap.has(preferred.provider)
				? preferred.provider
				: providers[0] || "";
		const plans = Array.from(providerMap.get(provider) ?? []).sort((a, b) => {
			if (a === "standard") return -1;
			if (b === "standard") return 1;
			return a.localeCompare(b);
		});
		const pricingPlan =
			preferred?.pricingPlan && plans.includes(preferred.pricingPlan)
				? preferred.pricingPlan
				: plans.includes("standard")
					? "standard"
					: plans[0] || "";

		return { endpoint, provider, pricingPlan };
	};

	useEffect(() => {
		if (modelsByReleaseDate.length === 0) return;
		if (selectedModelIds.length > 0) return;
		const initialSelection =
			selectedModelId && selectionOptions.has(selectedModelId)
				? selectedModelId
				: modelsByReleaseDate[0]?.modelId;
		if (!initialSelection) return;
		setSelectedModelIds([initialSelection]);
	}, [
		modelsByReleaseDate,
		selectedModelId,
		selectedModelIds.length,
		selectionOptions,
	]);

	useEffect(() => {
		if (!selectedModelId) return;
		setSelectedModelIds((current) =>
			current.includes(selectedModelId) ? current : [selectedModelId, ...current]
		);
	}, [selectedModelId]);

	useEffect(() => {
		if (selectedModelIds.length === 0) return;
		setModelConfigs((current) => {
			let changed = false;
			const next: Record<string, SelectedPricingModelConfig> = {};
			for (const modelId of selectedModelIds) {
				const defaultConfig = getDefaultConfig(modelId, {
					endpoint: current[modelId]?.endpoint || initialEndpoint,
					provider: current[modelId]?.provider || initialProvider,
					pricingPlan: current[modelId]?.pricingPlan || initialPlan,
				});
				if (!defaultConfig) continue;
				next[modelId] = defaultConfig;
				if (
					current[modelId]?.endpoint !== defaultConfig.endpoint ||
					current[modelId]?.provider !== defaultConfig.provider ||
					current[modelId]?.pricingPlan !== defaultConfig.pricingPlan
				) {
					changed = true;
				}
			}
			if (Object.keys(current).length !== Object.keys(next).length) {
				changed = true;
			}
			return changed ? next : current;
		});
	}, [
		initialEndpoint,
		initialPlan,
		initialProvider,
		selectedModelIds,
		selectionOptions,
	]);

	useEffect(() => {
		const primaryModelId = selectedModelIds[0] || "";
		const primaryConfig = primaryModelId ? modelConfigs[primaryModelId] : null;

		setSelectedModelId(primaryModelId);
		setSelectedEndpoint(primaryConfig?.endpoint || "");
		setSelectedProvider(primaryConfig?.provider || "");
		setSelectedPricingPlan(primaryConfig?.pricingPlan || "");
	}, [
		modelConfigs,
		selectedModelIds,
		setSelectedEndpoint,
		setSelectedModelId,
		setSelectedPricingPlan,
		setSelectedProvider,
	]);

	const selectedModelData = useMemo<SelectedPricingModel[]>(() => {
		return selectedModelIds
			.map((modelId) => {
				const config = modelConfigs[modelId] ?? getDefaultConfig(modelId);
				if (!config) return null;
				const row = models.find(
					(item) =>
						item.model === modelId &&
						item.endpoint === config.endpoint &&
						item.provider === config.provider &&
						(item.pricing_plan || "standard") === config.pricingPlan
				);
				if (!row) return null;
				return {
					...row,
					key: modelId,
					label: row.display_name || row.model,
					pricingPlan: config.pricingPlan,
				};
			})
			.filter((row): row is SelectedPricingModel => Boolean(row));
	}, [modelConfigs, models, selectedModelIds, selectionOptions]);

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
				key: `${model.model}:${model.provider}:${model.endpoint}:${model.pricingPlan}`,
				label: model.label,
				modelId: model.model,
				provider: model.provider,
				pricingPlan: model.pricingPlan,
				meters: model.meters,
			})),
		[selectedModelData]
	);

	const handleToggleModel = (modelId: string) => {
		setSelectedModelIds((current) => {
			if (current.includes(modelId)) {
				setMeterInputs({});
				return current.filter((id) => id !== modelId);
			}
			const defaultConfig = getDefaultConfig(modelId);
			if (defaultConfig) {
				setModelConfigs((configs) => ({
					...configs,
					[modelId]: defaultConfig,
				}));
			}
			setMeterInputs({});
			return [...current, modelId];
		});
	};

	const handleUpdateModelConfig = (
		modelId: string,
		patch: Partial<SelectedPricingModelConfig>
	) => {
		setModelConfigs((current) => {
			const existing = current[modelId] ?? getDefaultConfig(modelId);
			const next = getDefaultConfig(modelId, { ...existing, ...patch });
			if (!next) return current;
			return {
				...current,
				[modelId]: next,
			};
		});
		setMeterInputs({});
	};

	const handleMeterInputChange = (meter: string, value: string) => {
		setMeterInputs((prev: Record<string, string>) => ({
			...prev,
			[meter]: value,
		}));
	};

	return (
		<div className="mx-auto w-full max-w-[1440px] px-4 py-8">
			<header className="mb-6 rounded-xl border bg-muted/20 p-4 md:p-6">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
					<div className="space-y-2 max-w-4xl">
						<h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
							AI Pricing Calculator
						</h1>
						<p className="text-sm md:text-base text-muted-foreground">
							Select one or more models, configure their provider pricing, then compare every priced meter in a tabular view.
						</p>
					</div>
					<div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
						<span className="inline-flex items-center gap-1 rounded-full border bg-background/70 px-2.5 py-1">
							<CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
							{roundedTotalModelsCount}+ models
						</span>
						<span className="inline-flex items-center gap-1 rounded-full border bg-background/70 px-2.5 py-1">
							<CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
							{providersCount}+ providers
						</span>
						<span className="inline-flex items-center gap-1 rounded-full border bg-background/70 px-2.5 py-1">
							<CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
							Time-window aware
						</span>
					</div>
				</div>
			</header>

			<div className="space-y-5">
				<div className="grid grid-cols-1 2xl:grid-cols-12 gap-6 items-start">
					<div className="2xl:col-span-8">
						<ModelSelector
							models={models}
							selectedModelIds={selectedModelIds}
							modelConfigs={modelConfigs}
							onToggleModel={handleToggleModel}
							onUpdateModelConfig={handleUpdateModelConfig}
						/>
					</div>
					<div className="2xl:col-span-4">
						{allSelectedMeters.length > 0 ? (
							<UsageInputs
								meters={allSelectedMeters}
								meterInputs={meterInputs}
								requestMultiplier={requestMultiplier}
								pricingTimeUtc={pricingTimeUtc}
								onMeterInputChange={handleMeterInputChange}
								onRequestMultiplierChange={setRequestMultiplier}
								onPricingTimeUtcChange={setPricingTimeUtc}
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
					</div>
				</div>

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
