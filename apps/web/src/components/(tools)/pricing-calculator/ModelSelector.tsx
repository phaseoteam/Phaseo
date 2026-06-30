"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Logo } from "@/components/Logo";
import { ChevronsUpDown } from "lucide-react";

function formatProviderLabel(providerId: string): string {
	const known: Record<string, string> = {
		openai: "OpenAI",
		anthropic: "Anthropic",
		google: "Google",
		"google-ai-studio": "Google AI Studio",
		"google-vertex": "Google Vertex",
		"x-ai": "xAI",
		aws: "AWS",
		azure: "Azure",
	};

	if (known[providerId]) {
		return known[providerId];
	}

	return providerId
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPlanLabel(plan: string): string {
	return plan
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

type PricingModel = {
	provider: string;
	model: string;
	endpoint: string;
	display_name?: string;
	pricing_plan?: string | null;
	meters: Array<{
		meter: string;
		unit: string;
		unit_size: number;
		price_per_unit: string;
		currency: string;
	}>;
};

interface ModelSelectorProps {
	models: PricingModel[];
	selectedModelId: string;
	selectedProvider: string;
	selectedEndpoint: string;
	selectedPricingPlan: string;
	availableEndpoints: string[];
	availableProviders: string[];
	availablePricingPlans: string[];
	onModelSelect: (modelId: string) => void;
	onEndpointSelect: (endpoint: string) => void;
	onProviderSelect: (provider: string) => void;
	onPricingPlanSelect: (plan: string) => void;
}

export function ModelSelector({
	models,
	selectedModelId,
	selectedProvider,
	selectedEndpoint,
	selectedPricingPlan,
	availableEndpoints,
	availableProviders,
	availablePricingPlans,
	onModelSelect,
	onEndpointSelect,
	onProviderSelect,
	onPricingPlanSelect,
}: ModelSelectorProps) {
	const [openModel, setOpenModel] = useState(false);

	const availableModels = useMemo(() => {
		const modelMap = new Map<
			string,
			{
				modelId: string;
				displayName: string;
				providers: Set<string>;
				endpoints: Set<string>;
			}
		>();

		for (const row of models) {
			if (!modelMap.has(row.model)) {
				modelMap.set(row.model, {
					modelId: row.model,
					displayName: row.display_name || row.model,
					providers: new Set(),
					endpoints: new Set(),
				});
			}
			const entry = modelMap.get(row.model)!;
			entry.providers.add(row.provider);
			entry.endpoints.add(row.endpoint);
		}

		return Array.from(modelMap.values())
			.map((model) => ({
				...model,
				providers: Array.from(model.providers).sort(),
				endpoints: Array.from(model.endpoints).sort(),
			}))
			.sort((a, b) => a.displayName.localeCompare(b.displayName));
	}, [models]);

	const selectedModel = useMemo(
		() => availableModels.find((model) => model.modelId === selectedModelId),
		[availableModels, selectedModelId]
	);

	const modelButtonLabel =
		selectedModel?.displayName || selectedModelId || "Select model";

	return (
		<Card>
			<CardHeader className="pb-4">
				<CardTitle className="flex items-center justify-between gap-3 flex-wrap">
					<span>Model</span>
					<Badge variant="outline" className="text-[11px]">
						{availableModels.length.toLocaleString()} unique models
					</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<Label htmlFor="model-select">Model</Label>
					<Popover open={openModel} onOpenChange={setOpenModel}>
						<PopoverTrigger asChild>
							<Button
								id="model-select"
								variant="outline"
								role="combobox"
								aria-expanded={openModel}
								className="h-11 w-full justify-between"
							>
								<span className="truncate">{modelButtonLabel}</span>
								<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-[min(720px,95vw)] p-0">
							<Command>
								<CommandInput placeholder="Search models..." />
								<CommandList>
									<CommandEmpty>No model found.</CommandEmpty>
									<CommandGroup heading="Models">
										{availableModels.map((model) => {
											const isSelected = model.modelId === selectedModelId;
											return (
												<CommandItem
													key={model.modelId}
													value={`${model.displayName} ${model.modelId}`}
													onSelect={() => {
														onModelSelect(model.modelId);
														setOpenModel(false);
													}}
													className={`flex items-center justify-between gap-4 ${isSelected ? "bg-foreground/5" : ""}`}
												>
													<div className="min-w-0">
														<p className="truncate text-sm font-medium">
															{model.displayName}
														</p>
														<p className="truncate text-xs text-muted-foreground">
															{model.modelId}
														</p>
													</div>
													<div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
														<span>
															{model.providers.length} provider
															{model.providers.length === 1 ? "" : "s"}
														</span>
														<div className="hidden items-center gap-1 sm:flex">
															{model.providers.slice(0, 4).map((providerId) => (
																<Logo
																	key={providerId}
																	id={providerId}
																	width={16}
																	height={16}
																	className="h-4 w-4 shrink-0"
																	fallback={
																		<div className="h-4 w-4 rounded bg-muted" />
																	}
																/>
															))}
														</div>
													</div>
												</CommandItem>
											);
										})}
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
				</div>

				{selectedModelId ? (
					<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
						<div className="space-y-2">
							<Label htmlFor="endpoint-select">Endpoint</Label>
							<Select value={selectedEndpoint} onValueChange={onEndpointSelect}>
								<SelectTrigger id="endpoint-select" className="h-10">
									<SelectValue placeholder="Select endpoint" />
								</SelectTrigger>
								<SelectContent>
									{availableEndpoints.map((endpoint) => (
										<SelectItem key={endpoint} value={endpoint}>
											{endpoint}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="provider-select">Provider</Label>
							<Select
								value={selectedProvider}
								onValueChange={onProviderSelect}
								disabled={availableProviders.length === 0}
							>
								<SelectTrigger id="provider-select" className="h-10">
									<SelectValue placeholder="Select provider" />
								</SelectTrigger>
								<SelectContent>
									{availableProviders.map((provider) => (
										<SelectItem key={provider} value={provider}>
											<div className="flex items-center gap-2">
												<Logo
													id={provider}
													width={14}
													height={14}
													className="h-3.5 w-3.5"
													fallback={
														<div className="h-3.5 w-3.5 rounded bg-muted" />
													}
												/>
												{formatProviderLabel(provider)}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="plan-select">Plan</Label>
							<Select
								value={selectedPricingPlan}
								onValueChange={onPricingPlanSelect}
								disabled={availablePricingPlans.length === 0}
							>
								<SelectTrigger id="plan-select" className="h-10">
									<SelectValue placeholder="Select plan" />
								</SelectTrigger>
								<SelectContent>
									{availablePricingPlans.map((plan) => (
										<SelectItem key={plan} value={plan}>
											{formatPlanLabel(plan)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
