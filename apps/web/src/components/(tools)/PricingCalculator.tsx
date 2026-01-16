"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useQueryState } from "nuqs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Calculator, Zap, Shield, TrendingUp, Layers, DollarSign, Globe, Lock, RefreshCw } from "lucide-react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import {
	ModelSelector,
	UsageInputs,
	CostBreakdown,
	PricingReference,
} from "@/components/(tools)/pricing-calculator";
import type { PricingMeter } from "@/components/(data)/model/pricing/pricingHelpers";

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
		setSelectedModelId(modelId);
		setSelectedEndpoint("");
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

	return (
		<div className="container mx-auto py-8 px-4">
			{/* SEO-Optimized Header Section */}
			<header className="mb-8 container">
				<h1 className="text-4xl md:text-5xl font-bold mb-4">
					AI Pricing Calculator - Compare {roundedTotalModelsCount}+
					Models
				</h1>
				<p className="text-lg md:text-xl text-muted-foreground mb-4">
					Free AI model cost calculator for GPT-5, Claude, Gemini,
					DeepSeek, and {roundedTotalModelsCount}+ models from{" "}
					{providersCount}+ providers. Calculate token costs, compare
					API pricing, and estimate budgets for your AI deployments.
				</p>
				<div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
					<span className="inline-flex items-center gap-1">
						<CheckCircle2 className="w-4 h-4 text-green-500" />
						Updated Daily
					</span>
					<span className="inline-flex items-center gap-1">
						<CheckCircle2 className="w-4 h-4 text-green-500" />
						OpenAI, Anthropic, Google, AWS, Azure
					</span>
					<span className="inline-flex items-center gap-1">
						<CheckCircle2 className="w-4 h-4 text-green-500" />
						Input, Output &amp; Cached Tokens
					</span>
					<span className="inline-flex items-center gap-1">
						<CheckCircle2 className="w-4 h-4 text-green-500" />
						Batch &amp; Real-time Pricing
					</span>
				</div>
			</header>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<div className="space-y-6">
					<ModelSelector
						models={models}
						selectedModelId={selectedModelId || ""}
						selectedEndpoint={selectedEndpoint || ""}
						availableEndpoints={availableEndpoints}
						onModelSelect={handleModelSelect}
						onEndpointSelect={(ep) => {
							setSelectedEndpoint(ep);
							setSelectedProvider("");
							setSelectedPricingPlan("");
						}}
					/>

					{selectedModelData && (
						<UsageInputs
							meters={selectedModelData.meters}
							meterInputs={meterInputs}
							requestMultiplier={requestMultiplier}
							onMeterInputChange={handleMeterInputChange}
							onRequestMultiplierChange={
								handleRequestMultiplierChange
							}
						/>
					)}
				</div>

				<div className="space-y-6">
					{selectedModelData && (
						<>
							<CostBreakdown
								meters={selectedModelData.meters}
								meterInputs={meterInputs}
								requestMultiplier={requestMultiplier}
							/>
							<PricingReference
								meters={selectedModelData.meters}
								pricingPlan={selectedModelData.pricing_plan}
								availableProviders={availableProviders.map(
									(p) => ({ provider: p, displayName: p })
								)}
								availablePricingPlans={availablePricingPlans}
								selectedProvider={effectiveProvider}
								selectedPricingPlan={effectivePricingPlan}
								onProviderSelect={setSelectedProvider}
								onPricingPlanSelect={setSelectedPricingPlan}
							/>
						</>
					)}

					{!selectedModelData && (
						<Card>
							<CardContent className="text-center py-12">
								<p className="text-muted-foreground">
									Select a model and endpoint to view pricing
									information and calculate costs.
								</p>
							</CardContent>
						</Card>
					)}
				</div>
			</div>

			{/* SEO Content Section */}
			<section className="mt-16 max-w-4xl mx-auto space-y-8">
				{/* About Section */}
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl flex items-center gap-2">
							<Calculator className="w-6 h-6" />
							About This Calculator
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-muted-foreground">
							Estimate costs for {roundedTotalModelsCount}+ AI models from OpenAI, Anthropic, Google, Meta, and more. 
							Real-time pricing data updated daily from official provider sources.
						</p>
						<div>
							<h3 className="text-sm font-semibold mb-3">Supported Providers</h3>
							<div className="flex flex-wrap gap-2">
								{["OpenAI", "Anthropic", "Google AI", "AWS Bedrock", "Azure OpenAI", "Vertex AI", "Together AI", "Perplexity", "Groq"].map((provider) => (
									<span key={provider} className="px-3 py-1 bg-muted rounded-full text-sm">
										{provider}
									</span>
								))}
							</div>
						</div>
					</CardContent>
				</Card>

				{/* FAQ Section */}
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl flex items-center gap-2">
							<Globe className="w-6 h-6" />
							Frequently Asked Questions
						</CardTitle>
					</CardHeader>
					<CardContent>
						<Accordion type="single" collapsible className="w-full">
							<AccordionItem value="item-1">
								<AccordionTrigger>How do I calculate AI model costs?</AccordionTrigger>
								<AccordionContent className="text-muted-foreground">
									Select your model, choose the endpoint/provider, enter expected token usage for input and output, 
									add a request multiplier if needed, and view the calculated cost breakdown. The calculator handles 
									different pricing for input, output, and cached tokens automatically.
								</AccordionContent>
							</AccordionItem>

							<AccordionItem value="item-2">
								<AccordionTrigger>What is token-based pricing?</AccordionTrigger>
								<AccordionContent className="text-muted-foreground">
									Token-based pricing means you pay per token processed by the AI model. A token is roughly 4 characters 
									or 0.75 words in English. Most models charge different rates for input tokens (your prompt) and output 
									tokens (the AI&apos;s response). Prompt caching can reduce costs for repeated inputs by up to 90%.
								</AccordionContent>
							</AccordionItem>

							<AccordionItem value="item-3">
								<AccordionTrigger>Which model is cheapest?</AccordionTrigger>
								<AccordionContent className="text-muted-foreground">
									Pricing varies by model tier and use case. Claude 3 Haiku and GPT-3.5-turbo are most cost-effective for 
									simple tasks. Gemini Pro offers competitive mid-tier pricing. For advanced reasoning, GPT-4o and Claude 3.5 
									Sonnet provide excellent value. Use our calculator to compare specific models based on your expected usage.
								</AccordionContent>
							</AccordionItem>

							<AccordionItem value="item-4">
								<AccordionTrigger>How accurate is the pricing data?</AccordionTrigger>
								<AccordionContent className="text-muted-foreground">
									Pricing data is updated daily from official provider sources. The calculator provides accurate estimates 
									based on current published rates. Actual costs may vary due to volume discounts, enterprise agreements, 
									or price changes between updates.
								</AccordionContent>
							</AccordionItem>

							<AccordionItem value="item-5">
								<AccordionTrigger>What are batch APIs?</AccordionTrigger>
								<AccordionContent className="text-muted-foreground">
									Batch APIs process requests asynchronously with 24-hour turnaround, offering 50% cost savings. Ideal for 
									non-urgent evaluations, data processing pipelines, and large-scale content generation. The calculator shows 
									pricing for both batch and real-time endpoints.
								</AccordionContent>
							</AccordionItem>

							<AccordionItem value="item-6">
								<AccordionTrigger>Does the calculator support cached tokens?</AccordionTrigger>
								<AccordionContent className="text-muted-foreground">
									Yes! The calculator fully supports prompt caching offered by providers like Anthropic and OpenAI. Cached 
									tokens cost 90% less than regular input tokens, valuable for RAG systems and agents with consistent system prompts.
								</AccordionContent>
							</AccordionItem>

							<AccordionItem value="item-7">
								<AccordionTrigger>How to estimate enterprise costs?</AccordionTrigger>
								<AccordionContent className="text-muted-foreground">
									Calculate average tokens per request using sample prompts, estimate monthly request volume, consider batch APIs 
									for async workloads, account for prompt caching opportunities, add 20-30% buffer for peak usage, and contact 
									providers directly for volume discounts on $10k+ monthly spend.
								</AccordionContent>
							</AccordionItem>

							<AccordionItem value="item-8">
								<AccordionTrigger>Can I compare AWS Bedrock vs Azure pricing?</AccordionTrigger>
								<AccordionContent className="text-muted-foreground">
									Yes! Compare pricing for the same models across different platforms. For example, compare Claude pricing on AWS 
									Bedrock vs direct Anthropic API, or GPT-4 pricing on Azure OpenAI vs OpenAI direct. Platform-specific pricing 
									can vary significantly.
								</AccordionContent>
							</AccordionItem>
						</Accordion>
					</CardContent>
				</Card>

				{/* Why Use Section */}
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl flex items-center gap-2">
							<TrendingUp className="w-6 h-6" />
							Why Use This Calculator?
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="flex items-start gap-3">
								<Layers className="w-5 h-5 text-green-500 mt-0.5" />
								<div>
									<p className="font-medium">Comprehensive</p>
									<p className="text-sm text-muted-foreground">{roundedTotalModelsCount}+ models, {providersCount}+ providers</p>
								</div>
							</div>
							<div className="flex items-start gap-3">
								<RefreshCw className="w-5 h-5 text-green-500 mt-0.5" />
								<div>
									<p className="font-medium">Real-time Data</p>
									<p className="text-sm text-muted-foreground">Updated daily from official sources</p>
								</div>
							</div>
							<div className="flex items-start gap-3">
								<Zap className="w-5 h-5 text-green-500 mt-0.5" />
								<div>
									<p className="font-medium">Advanced Features</p>
									<p className="text-sm text-muted-foreground">Cached tokens, batch APIs, multiple tiers</p>
								</div>
							</div>
							<div className="flex items-start gap-3">
								<Shield className="w-5 h-5 text-green-500 mt-0.5" />
								<div>
									<p className="font-medium">Easy Comparison</p>
									<p className="text-sm text-muted-foreground">Compare across all providers in one place</p>
								</div>
							</div>
							<div className="flex items-start gap-3">
								<DollarSign className="w-5 h-5 text-green-500 mt-0.5" />
								<div>
									<p className="font-medium">Budget Planning</p>
									<p className="text-sm text-muted-foreground">Estimate costs for different scenarios</p>
								</div>
							</div>
							<div className="flex items-start gap-3">
								<Lock className="w-5 h-5 text-green-500 mt-0.5" />
								<div>
									<p className="font-medium">Free Forever</p>
									<p className="text-sm text-muted-foreground">No signup required, unlimited use</p>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</section>
		</div>
	);
}
