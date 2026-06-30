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
import {
	type PricingMeter,
} from "@/components/(data)/model/pricing/pricingHelpers";

function getCurrentUtcTime() {
	return new Date().toISOString().slice(11, 16);
}

type PricingModel = {
	provider: string;
	model: string;
	endpoint: string;
	display_name?: string;
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
	const [selectedEndpoint, setSelectedEndpoint] = useQueryState("endpoint", {
		defaultValue: initialEndpoint || "",
	});
	const [selectedProvider, setSelectedProvider] = useQueryState("provider", {
		defaultValue: initialProvider || "",
	});
	const [selectedPricingPlan, setSelectedPricingPlan] = useQueryState("plan", {
		defaultValue: initialPlan || "",
	});

	const [meterInputs, setMeterInputs] = useState<Record<string, string>>({});
	const [requestMultiplier, setRequestMultiplier] = useState<number>(1);
	const [pricingTimeUtc, setPricingTimeUtc] = useState<string>(getCurrentUtcTime);

	const availableModels = useMemo(() => {
		const modelMap = new Map<
			string,
			{
				modelId: string;
				displayName: string;
				endpoints: Map<string, Set<string>>;
			}
		>();

		for (const row of models) {
			if (!modelMap.has(row.model)) {
				modelMap.set(row.model, {
					modelId: row.model,
					displayName: row.display_name || row.model,
					endpoints: new Map(),
				});
			}
			const entry = modelMap.get(row.model)!;
			if (!entry.endpoints.has(row.endpoint)) {
				entry.endpoints.set(row.endpoint, new Set());
			}
			entry.endpoints.get(row.endpoint)!.add(row.provider);
		}

		return Array.from(modelMap.values()).sort((a, b) =>
			a.displayName.localeCompare(b.displayName)
		);
	}, [models]);

	const selectedModel = useMemo(() => {
		return availableModels.find((model) => model.modelId === selectedModelId);
	}, [availableModels, selectedModelId]);

	const availableEndpoints = useMemo(() => {
		if (!selectedModel) return [];
		return Array.from(selectedModel.endpoints.keys()).sort();
	}, [selectedModel]);

	const availableProviders = useMemo(() => {
		if (!selectedModel || !selectedEndpoint) return [];
		const providers = selectedModel.endpoints.get(selectedEndpoint);
		if (!providers) return [];
		return Array.from(providers).sort();
	}, [selectedEndpoint, selectedModel]);

	const effectiveProvider = useMemo(() => {
		if (selectedProvider && availableProviders.includes(selectedProvider)) {
			return selectedProvider;
		}
		return availableProviders[0] || "";
	}, [availableProviders, selectedProvider]);

	const availablePricingPlans = useMemo(() => {
		if (!selectedModelId || !selectedEndpoint || !effectiveProvider) return [];
		const plans = new Set<string>();
		for (const row of models) {
			if (
				row.model === selectedModelId &&
				row.endpoint === selectedEndpoint &&
				row.provider === effectiveProvider
			) {
				plans.add(row.pricing_plan || "standard");
			}
		}
		return Array.from(plans).sort((a, b) => {
			if (a === "standard") return -1;
			if (b === "standard") return 1;
			return a.localeCompare(b);
		});
	}, [effectiveProvider, models, selectedEndpoint, selectedModelId]);

	const effectivePricingPlan = useMemo(() => {
		if (
			selectedPricingPlan &&
			availablePricingPlans.includes(selectedPricingPlan)
		) {
			return selectedPricingPlan;
		}
		return availablePricingPlans.includes("standard")
			? "standard"
			: availablePricingPlans[0] || "";
	}, [availablePricingPlans, selectedPricingPlan]);

	useEffect(() => {
		if (!selectedModel) return;
		if (
			!selectedEndpoint ||
			!availableEndpoints.includes(selectedEndpoint)
		) {
			setSelectedEndpoint(availableEndpoints[0] || "");
			setSelectedProvider("");
			setSelectedPricingPlan("");
			setMeterInputs({});
		}
	}, [
		availableEndpoints,
		selectedEndpoint,
		selectedModel,
		setSelectedEndpoint,
		setSelectedPricingPlan,
		setSelectedProvider,
	]);

	useEffect(() => {
		if (!selectedEndpoint) return;
		if (!selectedProvider || !availableProviders.includes(selectedProvider)) {
			setSelectedProvider(availableProviders[0] || "");
			setSelectedPricingPlan("");
			setMeterInputs({});
		}
	}, [
		availableProviders,
		selectedEndpoint,
		selectedProvider,
		setSelectedPricingPlan,
		setSelectedProvider,
	]);

	useEffect(() => {
		if (!effectiveProvider || availablePricingPlans.length === 0) return;
		if (
			!selectedPricingPlan ||
			!availablePricingPlans.includes(selectedPricingPlan)
		) {
			setSelectedPricingPlan(effectivePricingPlan);
		}
	}, [
		availablePricingPlans,
		effectivePricingPlan,
		effectiveProvider,
		selectedPricingPlan,
		setSelectedPricingPlan,
	]);

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
			(row) =>
				row.model === selectedModelId &&
				row.endpoint === selectedEndpoint &&
				row.provider === effectiveProvider &&
				(row.pricing_plan || "standard") === effectivePricingPlan
		);
	}, [
		effectivePricingPlan,
		effectiveProvider,
		models,
		selectedEndpoint,
		selectedModelId,
	]);

	const handleModelSelect = (modelId: string) => {
		const nextModel = availableModels.find((model) => model.modelId === modelId);
		const nextEndpoints = nextModel
			? Array.from(nextModel.endpoints.keys()).sort()
			: [];
		const nextEndpoint = nextEndpoints[0] || "";

		setSelectedModelId(modelId);
		setSelectedEndpoint(nextEndpoint);
		setSelectedProvider("");
		setSelectedPricingPlan("");
		setMeterInputs({});
	};

	const handleEndpointSelect = (endpoint: string) => {
		setSelectedEndpoint(endpoint);
		setSelectedProvider("");
		setSelectedPricingPlan("");
		setMeterInputs({});
	};

	const handleProviderSelect = (provider: string) => {
		setSelectedProvider(provider);
		setSelectedPricingPlan("");
		setMeterInputs({});
	};

	const handlePricingPlanSelect = (plan: string) => {
		setSelectedPricingPlan(plan);
		setMeterInputs({});
	};

	const handleMeterInputChange = (meter: string, value: string) => {
		setMeterInputs((prev: Record<string, string>) => ({
			...prev,
			[meter]: value,
		}));
	};

	return (
		<div className="mx-auto w-full max-w-[1320px] px-4 py-8">
			<header className="mb-6 rounded-xl border bg-gradient-to-br from-background to-muted/20 p-4 md:p-6">
				<div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
					<div className="space-y-2 max-w-4xl">
						<h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
							AI Pricing Calculator
						</h1>
						<p className="text-sm md:text-base text-muted-foreground">
							Choose one model, pick the provider and plan, then estimate cost across every priced meter.
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
				<div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
					<div className="xl:col-span-7">
						<ModelSelector
							models={models}
							selectedModelId={selectedModelId || ""}
							selectedProvider={effectiveProvider || ""}
							selectedEndpoint={selectedEndpoint || ""}
							selectedPricingPlan={effectivePricingPlan || ""}
							availableEndpoints={availableEndpoints}
							availableProviders={availableProviders}
							availablePricingPlans={availablePricingPlans}
							onModelSelect={handleModelSelect}
							onEndpointSelect={handleEndpointSelect}
							onProviderSelect={handleProviderSelect}
							onPricingPlanSelect={handlePricingPlanSelect}
						/>
					</div>
					<div className="xl:col-span-5">
						{selectedModelData ? (
							<UsageInputs
								meters={selectedModelData.meters}
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
										Select a model to configure usage inputs.
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
							selectedProvider={effectiveProvider}
							pricingTimeUtc={pricingTimeUtc}
						/>
						<CostBreakdown
							meters={selectedModelData.meters}
							meterInputs={meterInputs}
							requestMultiplier={requestMultiplier}
							pricingTimeUtc={pricingTimeUtc}
						/>
					</>
				) : null}
			</div>
		</div>
	);
}
