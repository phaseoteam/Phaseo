"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useQueryState } from "nuqs";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import {
	ModelSelector,
	UsageInputs,
	CostBreakdown,
	PricingReference,
} from "@/components/(tools)/pricing-calculator";
import {
	type PricingMeter,
} from "@/components/(data)/model/pricing/pricingHelpers";
const MAX_COMPARISON_MODELS = 4;

type PricingModel = {
	provider: string;
	model: string;
	endpoint: string;
	display_name?: string;
	pricing_plan?: string | null;
	meters: PricingMeter[];
};

type ModelComparisonOption = {
	key: string;
	modelId: string;
	displayName: string;
	provider: string;
	availablePricingPlans: string[];
	metersByPlan: Record<string, PricingMeter[]>;
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

export default function PricingCalculator({
	initialModels,
	initialModel,
	initialEndpoint,
	initialProvider,
	initialPlan,
	totalModelsCount = 500,
	providersCount = 10,
}: PricingCalculatorProps) {
	// Memoize models to prevent dependency warnings
	const models = useMemo(() => initialModels || [], [initialModels]);

	const roundedTotalModelsCount = useMemo(
		() => Math.ceil(totalModelsCount / 50) * 50,
		[totalModelsCount]
	);

	const [selectedModelId, setSelectedModelId] = useQueryState("model", {
		defaultValue: initialModel || "",
	});
	const [selectedEndpoint, setSelectedEndpoint] = useQueryState("endpoint", {
		defaultValue: initialEndpoint || "",
	});
	const [selectedProvider, setSelectedProviderState] = useQueryState(
		"provider",
		{
			defaultValue: initialProvider || "",
		}
	);
	const [selectedPricingPlan, setSelectedPricingPlanState] = useQueryState(
		"plan",
		{
			defaultValue: initialPlan || "",
		}
	);

	const [meterInputs, setMeterInputs] = useState<Record<string, string>>({});
	const [requestMultiplier, setRequestMultiplier] = useState<number>(1);
	const [comparisonModelKeys, setComparisonModelKeys] = useState<string[]>([]);
	const [comparisonModelPlans, setComparisonModelPlans] = useState<Record<string, string>>({});

	// Wrap setters in useCallback to prevent dependency warnings
	const setSelectedProvider = useCallback(
		(value: string) => {
			setSelectedProviderState(value);
		},
		[setSelectedProviderState]
	);

	const setSelectedPricingPlan = useCallback(
		(value: string) => {
			setSelectedPricingPlanState(value);
		},
		[setSelectedPricingPlanState]
	);

	const availableModels = useMemo(() => {
		const modelMap = new Map<
			string,
			{
				modelId: string;
				displayName: string;
				endpoints: Map<
					string,
					{ providers: Set<string>; pricingPlans: Set<string> }
				>;
			}
		>();
		models.forEach((m) => {
			if (!modelMap.has(m.model)) {
				modelMap.set(m.model, {
					modelId: m.model,
					displayName: m.display_name || m.model,
					endpoints: new Map(),
				});
			}
			const entry = modelMap.get(m.model)!;
			if (!entry.endpoints.has(m.endpoint)) {
				entry.endpoints.set(m.endpoint, {
					providers: new Set(),
					pricingPlans: new Set(),
				});
			}
			const ep = entry.endpoints.get(m.endpoint)!;
			ep.providers.add(m.provider);
			ep.pricingPlans.add(m.pricing_plan || "standard");
		});
		return Array.from(modelMap.values()).sort((a, b) =>
			a.displayName.localeCompare(b.displayName)
		);
	}, [models]);

	const selectedModel = useMemo(() => {
		return availableModels.find((m) => m.modelId === selectedModelId);
	}, [availableModels, selectedModelId]);

	const availableEndpoints = useMemo(() => {
		if (!selectedModel) return [];
		return Array.from(selectedModel.endpoints.keys()).sort();
	}, [selectedModel]);

	const availableProviders = useMemo(() => {
		if (!selectedModel || !selectedEndpoint) return [];
		const ep = selectedModel.endpoints.get(selectedEndpoint);
		if (!ep) return [];
		return Array.from(ep.providers).sort();
	}, [selectedModel, selectedEndpoint]);

	const availablePricingPlans = useMemo(() => {
		if (!selectedModel || !selectedEndpoint || !selectedProvider) return [];
		const filteredModels = models.filter(
			(m) =>
				m.model === selectedModelId &&
				m.endpoint === selectedEndpoint &&
				m.provider === selectedProvider
		);
		const plans = new Set<string>();
		filteredModels.forEach((m) => plans.add(m.pricing_plan || "standard"));
		return Array.from(plans).sort();
	}, [
		models,
		selectedModel,
		selectedEndpoint,
		selectedProvider,
		selectedModelId,
	]);

	useEffect(() => {
		if (!selectedProvider && availableProviders.length > 0) {
			setSelectedProvider(availableProviders[0]);
		}
	}, [availableProviders, selectedProvider, setSelectedProvider]);

	useEffect(() => {
		if (availablePricingPlans.length === 0) {
			return;
		}
		if (
			!selectedPricingPlan ||
			!availablePricingPlans.includes(selectedPricingPlan)
		) {
			const nextPlan = availablePricingPlans.includes("standard")
				? "standard"
				: availablePricingPlans[0];
			setSelectedPricingPlan(nextPlan);
		}
	}, [availablePricingPlans, selectedPricingPlan, setSelectedPricingPlan]);

	const effectiveProvider = useMemo(() => {
		if (!selectedProvider && availableProviders.length === 1) {
			return availableProviders[0];
		}
		return selectedProvider;
	}, [availableProviders, selectedProvider]);

	const effectivePricingPlan = useMemo(() => {
		if (
			!selectedPricingPlan &&
			availablePricingPlans.includes("standard")
		) {
			return "standard";
		}
		if (!selectedPricingPlan && availablePricingPlans.length > 0) {
			return availablePricingPlans[0];
		}
		return selectedPricingPlan;
	}, [availablePricingPlans, selectedPricingPlan]);

	const selectedModelData = useMemo(() => {
		if (
			!selectedModelId ||
			!selectedEndpoint ||
			!effectiveProvider ||
			!effectivePricingPlan
		) {
			return null;
		}
		return models.find(
			(m) =>
				m.model === selectedModelId &&
				m.endpoint === selectedEndpoint &&
				m.provider === effectiveProvider &&
				(m.pricing_plan || "standard") === effectivePricingPlan
		);
	}, [
		models,
		selectedModelId,
		selectedEndpoint,
		effectiveProvider,
		effectivePricingPlan,
	]);

	const handleModelSelect = (modelId: string) => {
		const nextModel = availableModels.find((model) => model.modelId === modelId);
		const nextEndpoints = nextModel
			? Array.from(nextModel.endpoints.keys()).sort()
			: [];
		const nextEndpoint = nextEndpoints.includes(selectedEndpoint)
			? selectedEndpoint
			: nextEndpoints[0] || "";

		setSelectedModelId(modelId);
		setSelectedEndpoint(nextEndpoint);
		setSelectedProvider("");
		setSelectedPricingPlan("");
		setMeterInputs({});
	};

	const handleMeterInputChange = (meter: string, value: string) => {
		setMeterInputs((prev: Record<string, string>) => ({
			...prev,
			[meter]: value,
		}));
	};

	const handleRequestMultiplierChange = (value: number) => {
		setRequestMultiplier(value);
	};

	const comparisonCandidates = useMemo<ModelComparisonOption[]>(() => {
		if (!selectedEndpoint) {
			return [];
		}
		const grouped = new Map<
			string,
			{
				modelId: string;
				displayName: string;
				provider: string;
				planMap: Map<string, PricingMeter[]>;
			}
		>();

		for (const row of models) {
			if (row.endpoint !== selectedEndpoint) {
				continue;
			}
			const key = `${row.model}::${row.provider}`;
			if (!grouped.has(key)) {
				grouped.set(key, {
					modelId: row.model,
					displayName: row.display_name || row.model,
					provider: row.provider,
					planMap: new Map<string, PricingMeter[]>(),
				});
			}
			const group = grouped.get(key)!;
			group.planMap.set(row.pricing_plan || "standard", row.meters);
		}

		return Array.from(grouped.entries())
			.map(([key, group]) => {
				const availablePricingPlans = Array.from(group.planMap.keys()).sort((a, b) => {
					if (a === "standard") return -1;
					if (b === "standard") return 1;
					return a.localeCompare(b);
				});
				const metersByPlan = Object.fromEntries(group.planMap.entries());
				return {
				key,
				modelId: group.modelId,
				displayName: group.displayName,
				provider: group.provider,
				availablePricingPlans,
				metersByPlan,
				};
			})
			.sort((a, b) => {
				const byName = a.displayName.localeCompare(b.displayName);
				if (byName !== 0) return byName;
				return a.provider.localeCompare(b.provider);
			});
	}, [models, selectedEndpoint]);

	const comparisonModelMap = useMemo(() => {
		return new Map(comparisonCandidates.map((model) => [model.key, model]));
	}, [comparisonCandidates]);

	useEffect(() => {
		setComparisonModelKeys((prev) => {
			const valid = prev.filter((key) => comparisonModelMap.has(key));
			const next = valid.slice(0, MAX_COMPARISON_MODELS);
			if (
				prev.length === next.length &&
				prev.every((value, index) => value === next[index])
			) {
				return prev;
			}
			return next;
		});
	}, [comparisonModelMap]);

	useEffect(() => {
		setComparisonModelPlans((prev) => {
			const next: Record<string, string> = {};
			for (const key of comparisonModelKeys) {
				const candidate = comparisonModelMap.get(key);
				if (!candidate) continue;
				if (prev[key] && candidate.availablePricingPlans.includes(prev[key])) {
					next[key] = prev[key];
					continue;
				}
				next[key] = candidate.availablePricingPlans.includes("standard")
					? "standard"
					: candidate.availablePricingPlans[0] || "standard";
			}

			const prevKeys = Object.keys(prev).sort();
			const nextKeys = Object.keys(next).sort();
			if (
				prevKeys.length === nextKeys.length &&
				prevKeys.every((key, idx) => key === nextKeys[idx] && prev[key] === next[key])
			) {
				return prev;
			}
			return next;
		});
	}, [comparisonModelKeys, comparisonModelMap]);

	const toggleComparisonModel = useCallback(
		(modelKey: string) => {
			if (!comparisonModelMap.has(modelKey)) {
				return;
			}
			setComparisonModelKeys((prev) => {
				if (prev.includes(modelKey)) {
					return prev.filter((key) => key !== modelKey);
				}
				if (prev.length >= MAX_COMPARISON_MODELS) {
					return prev;
				}
				return [...prev, modelKey];
			});
		},
		[comparisonModelMap]
	);

	const setComparisonModelPlan = useCallback(
		(modelKey: string, plan: string) => {
			setComparisonModelPlans((prev) => {
				if (prev[modelKey] === plan) {
					return prev;
				}
				return { ...prev, [modelKey]: plan };
			});
		},
		[]
	);

	const setComparisonModelProvider = useCallback(
		(modelKey: string, provider: string) => {
			const currentModel = comparisonModelMap.get(modelKey);
			if (!currentModel) {
				return;
			}

			const nextKey = `${currentModel.modelId}::${provider}`;
			if (!comparisonModelMap.has(nextKey) || nextKey === modelKey) {
				return;
			}

			setComparisonModelKeys((prev) => {
				const currentIndex = prev.indexOf(modelKey);
				if (currentIndex === -1) {
					return prev;
				}

				if (prev.includes(nextKey)) {
					return prev.filter((key) => key !== modelKey);
				}

				const next = [...prev];
				next[currentIndex] = nextKey;
				return next;
			});
		},
		[comparisonModelMap]
	);

	const removeSelectedModelByKey = useCallback(
		(modelKey: string) => {
			if (comparisonModelKeys.includes(modelKey)) {
				setComparisonModelKeys((prev) =>
					prev.filter((key) => key !== modelKey)
				);
				setComparisonModelPlans((prev) => {
					if (!(modelKey in prev)) return prev;
					const next = { ...prev };
					delete next[modelKey];
					return next;
				});
				return;
			}

			const nextComparisonKey = comparisonModelKeys[0];
			if (nextComparisonKey) {
				const nextModel = comparisonModelMap.get(nextComparisonKey);
				if (nextModel) {
					const nextModelMeta = availableModels.find(
						(model) => model.modelId === nextModel.modelId
					);
					const nextEndpoints = nextModelMeta
						? Array.from(nextModelMeta.endpoints.keys()).sort()
						: [];
					const nextEndpoint = nextEndpoints.includes(selectedEndpoint)
						? selectedEndpoint
						: nextEndpoints[0] || "";

					setSelectedModelId(nextModel.modelId);
					setSelectedEndpoint(nextEndpoint);
					setSelectedProvider(nextModel.provider);
					setSelectedPricingPlan(comparisonModelPlans[nextComparisonKey] || "");
					setMeterInputs({});

					setComparisonModelKeys((prev) =>
						prev.filter((key) => key !== nextComparisonKey)
					);
					setComparisonModelPlans((prev) => {
						if (!(nextComparisonKey in prev)) return prev;
						const next = { ...prev };
						delete next[nextComparisonKey];
						return next;
					});
					return;
				}
			}

			setSelectedModelId("");
			setSelectedEndpoint("");
			setSelectedProvider("");
			setSelectedPricingPlan("");
			setMeterInputs({});
			setComparisonModelKeys([]);
			setComparisonModelPlans({});
		},
		[
			availableModels,
			comparisonModelKeys,
			comparisonModelMap,
			comparisonModelPlans,
			selectedEndpoint,
			setSelectedProvider,
			setSelectedPricingPlan,
		]
	);

	const selectedComparisonModels = useMemo(() => {
		return comparisonModelKeys
			.map((modelKey) => comparisonModelMap.get(modelKey))
			.filter((model): model is ModelComparisonOption => Boolean(model))
			.map((model) => ({
				key: model.key,
				label: model.displayName,
				modelId: model.modelId,
				provider: model.provider,
				pricingPlan:
					comparisonModelPlans[model.key] && model.availablePricingPlans.includes(comparisonModelPlans[model.key])
						? comparisonModelPlans[model.key]
						: model.availablePricingPlans.includes("standard")
							? "standard"
							: model.availablePricingPlans[0] || "standard",
				availablePricingPlans: model.availablePricingPlans,
				availableProviders: comparisonCandidates
					.filter((candidate) => candidate.modelId === model.modelId)
					.map((candidate) => candidate.provider)
					.sort(),
				meters:
					model.metersByPlan[
						comparisonModelPlans[model.key] && model.availablePricingPlans.includes(comparisonModelPlans[model.key])
							? comparisonModelPlans[model.key]
							: model.availablePricingPlans.includes("standard")
								? "standard"
								: model.availablePricingPlans[0] || "standard"
					] || [],
			}));
	}, [comparisonCandidates, comparisonModelKeys, comparisonModelMap, comparisonModelPlans]);

	const selectedModelsForReference = useMemo(() => {
		if (!selectedModelData || !selectedModelId || !effectiveProvider) {
			return selectedComparisonModels;
		}

		const primaryModel = {
			key: "primary",
			label:
				selectedModel?.displayName ||
				selectedModelData.display_name ||
				selectedModelId,
			modelId: selectedModelId,
			provider: effectiveProvider,
			pricingPlan: effectivePricingPlan,
			availablePricingPlans,
			availableProviders: Array.from(
				new Set(
					comparisonCandidates
						.filter((candidate) => candidate.modelId === selectedModelId)
						.map((candidate) => candidate.provider)
				)
			).sort(),
			meters: selectedModelData.meters,
		};

		const comparisonsWithoutPrimary = selectedComparisonModels.filter(
			(model) =>
				!(
					model.modelId === primaryModel.modelId &&
					model.provider === primaryModel.provider
				)
		);

		return [primaryModel, ...comparisonsWithoutPrimary];
	}, [
		availablePricingPlans,
		comparisonCandidates,
		effectivePricingPlan,
		effectiveProvider,
		selectedComparisonModels,
		selectedModel,
		selectedModelData,
		selectedModelId,
	]);

	return (
		<div className="mx-auto w-full max-w-[1500px] px-4 py-8">
			<header className="mb-6 rounded-2xl border bg-gradient-to-br from-background to-muted/20 p-4 md:p-6">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
					<div className="space-y-2 max-w-4xl">
						<h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
							AI Pricing Calculator
						</h1>
						<p className="text-sm md:text-base text-muted-foreground">
							Compare {roundedTotalModelsCount}+ models across {providersCount}+ providers and estimate costs with shared usage inputs.
						</p>
					</div>
					<div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
						<span className="inline-flex items-center gap-1 rounded-full border bg-background/70 px-2.5 py-1">
							<CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
							Updated Daily
						</span>
						<span className="inline-flex items-center gap-1 rounded-full border bg-background/70 px-2.5 py-1">
							<CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
							Provider + plan aware
						</span>
						<span className="inline-flex items-center gap-1 rounded-full border bg-background/70 px-2.5 py-1">
							<CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
							Input, output, cached tokens
						</span>
					</div>
				</div>
			</header>

			<div className="space-y-5">
				<div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
					<div className="xl:col-span-7 [&>*]:h-full">
						<ModelSelector
							models={models}
							selectedModelId={selectedModelId || ""}
							selectedProvider={effectiveProvider || ""}
							selectedEndpoint={selectedEndpoint || ""}
							availableEndpoints={availableEndpoints}
							comparisonCandidates={comparisonCandidates.map((candidate) => ({
								key: candidate.key,
								modelId: candidate.modelId,
								displayName: candidate.displayName,
								provider: candidate.provider,
							}))}
							comparisonModelKeys={comparisonModelKeys}
							maxComparisonModels={MAX_COMPARISON_MODELS}
							onModelSelect={handleModelSelect}
							onEndpointSelect={(ep) => {
								setSelectedEndpoint(ep);
								setSelectedProvider("");
								setSelectedPricingPlan("");
							}}
							onToggleComparisonModel={toggleComparisonModel}
							onRemoveModelSelection={removeSelectedModelByKey}
						/>
					</div>
					<div className="xl:col-span-5 [&>*]:h-full">
						{selectedModelData ? (
							<UsageInputs
								meters={selectedModelData.meters}
								meterInputs={meterInputs}
								requestMultiplier={requestMultiplier}
								onMeterInputChange={handleMeterInputChange}
								onRequestMultiplierChange={
									handleRequestMultiplierChange
								}
							/>
						) : (
							<Card>
								<CardContent className="text-center py-12">
									<p className="text-muted-foreground">
										Select a model and endpoint to configure
										usage inputs.
									</p>
								</CardContent>
							</Card>
						)}
					</div>
				</div>

				{selectedModelData ? (
					<>
						<PricingReference
							meters={selectedModelData.meters}
							pricingPlan={selectedModelData.pricing_plan}
							selectedModelId={selectedModelId}
							selectedModelLabel={
								selectedModel?.displayName ||
								selectedModelData.display_name ||
								selectedModelId
							}
							availableProviders={availableProviders.map(
								(p) => ({ provider: p, displayName: p })
							)}
							selectedProvider={effectiveProvider}
							onProviderSelect={setSelectedProvider}
							onPricingPlanSelect={setSelectedPricingPlan}
							comparisonModels={selectedModelsForReference}
							onComparisonModelPricingPlanSelect={setComparisonModelPlan}
							onComparisonModelProviderSelect={setComparisonModelProvider}
						/>
						<CostBreakdown
							meters={selectedModelData.meters}
							meterInputs={meterInputs}
							requestMultiplier={requestMultiplier}
						/>
					</>
				) : null}
			</div>
		</div>
	);
}
