"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ChevronsUpDown, X } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Logo } from "@/components/Logo";

type ComparisonCandidate = {
	key: string;
	modelId: string;
	displayName: string;
	provider: string;
};

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
	availableEndpoints: string[];
	comparisonCandidates: ComparisonCandidate[];
	comparisonModelKeys: string[];
	maxComparisonModels: number;
	onModelSelect: (modelId: string) => void;
	onEndpointSelect: (endpoint: string) => void;
	onToggleComparisonModel: (modelKey: string) => void;
	onRemoveModelSelection: (modelKey: string) => void;
}

export function ModelSelector({
	models,
	selectedModelId,
	selectedProvider,
	selectedEndpoint,
	availableEndpoints,
	comparisonCandidates,
	comparisonModelKeys,
	maxComparisonModels,
	onModelSelect,
	onEndpointSelect,
	onToggleComparisonModel,
	onRemoveModelSelection,
}: ModelSelectorProps) {
	const [openModel, setOpenModel] = useState(false);
	const MAX_PROVIDER_LOGOS = 4;

	// Build model data with provider information
	const availableModels = useMemo(() => {
		const modelMap = new Map<
			string,
			{ modelId: string; displayName: string; providers: Set<string> }
		>();

		models.forEach((m) => {
			if (!modelMap.has(m.model)) {
				modelMap.set(m.model, {
					modelId: m.model,
					displayName: m.display_name || m.model,
					providers: new Set(),
				});
			}
			modelMap.get(m.model)!.providers.add(m.provider);
		});

		return Array.from(modelMap.values())
			.map((m) => ({
				...m,
				providers: Array.from(m.providers).sort(),
			}))
			.sort((a, b) => a.displayName.localeCompare(b.displayName));
	}, [models]);

	const selectedComparisonModels = useMemo(() => {
		const map = new Map(comparisonCandidates.map((candidate) => [candidate.key, candidate]));
		return comparisonModelKeys
			.map((key) => map.get(key))
			.filter((candidate): candidate is ComparisonCandidate => Boolean(candidate));
	}, [comparisonCandidates, comparisonModelKeys]);

	const selectedPrimaryModel = useMemo(
		() => availableModels.find((model) => model.modelId === selectedModelId) ?? null,
		[availableModels, selectedModelId]
	);

	const selectedPrimaryCandidate = useMemo(() => {
		if (!selectedModelId) return null;

		const exact =
			selectedProvider
				? comparisonCandidates.find(
						(candidate) =>
							candidate.modelId === selectedModelId &&
							candidate.provider === selectedProvider
				  )
				: null;
		if (exact) return exact;

		return (
			comparisonCandidates.find(
				(candidate) => candidate.modelId === selectedModelId
			) ?? null
		);
	}, [comparisonCandidates, selectedModelId, selectedProvider]);

	const selectedDropdownItems = useMemo(() => {
		if (!selectedPrimaryCandidate) {
			return selectedComparisonModels.map((model) => ({
				...model,
				isPrimary: false,
			}));
		}

		const comparisonWithoutPrimary = selectedComparisonModels.filter(
			(model) => model.key !== selectedPrimaryCandidate.key
		);

		return [
			{ ...selectedPrimaryCandidate, isPrimary: true },
			...comparisonWithoutPrimary.map((model) => ({
				...model,
				isPrimary: false,
			})),
		];
	}, [selectedComparisonModels, selectedPrimaryCandidate]);

	const comparisonCandidatesByProvider = useMemo(() => {
		const grouped = new Map<string, ComparisonCandidate[]>();

		for (const candidate of comparisonCandidates) {
			if (!grouped.has(candidate.provider)) {
				grouped.set(candidate.provider, []);
			}
			grouped.get(candidate.provider)!.push(candidate);
		}

		return Array.from(grouped.entries())
			.map(([provider, candidates]) => ({
				provider,
				providerLabel: formatProviderLabel(provider),
				candidates: [...candidates].sort((a, b) =>
					a.displayName.localeCompare(b.displayName)
				),
			}))
			.sort((a, b) => a.providerLabel.localeCompare(b.providerLabel));
	}, [comparisonCandidates]);

	const comparisonProvidersByModelId = useMemo(() => {
		const grouped = new Map<string, Set<string>>();

		for (const row of models) {
			if (selectedEndpoint && row.endpoint !== selectedEndpoint) {
				continue;
			}
			if (!grouped.has(row.model)) {
				grouped.set(row.model, new Set<string>());
			}
			grouped.get(row.model)!.add(row.provider);
		}

		return new Map(
			Array.from(grouped.entries()).map(([modelId, providers]) => [
				modelId,
				Array.from(providers).sort((a, b) =>
					formatProviderLabel(a).localeCompare(formatProviderLabel(b))
				),
			])
		);
	}, [models, selectedEndpoint]);

	const availableModelsByProvider = useMemo(() => {
		const grouped = new Map<
			string,
			Array<{ modelId: string; displayName: string; providers: string[] }>
		>();

		for (const model of availableModels) {
			for (const provider of model.providers) {
				if (!grouped.has(provider)) {
					grouped.set(provider, []);
				}
				grouped.get(provider)!.push({
					modelId: model.modelId,
					displayName: model.displayName,
					providers: model.providers,
				});
			}
		}

		return Array.from(grouped.entries())
			.map(([provider, models]) => ({
				provider,
				providerLabel: formatProviderLabel(provider),
				models: [...models].sort((a, b) =>
					a.displayName.localeCompare(b.displayName)
				),
			}))
			.sort((a, b) => a.providerLabel.localeCompare(b.providerLabel));
	}, [availableModels]);

	const renderProviderLogos = (providerIds: string[]) => {
		const visible = providerIds.slice(0, MAX_PROVIDER_LOGOS);
		const hiddenCount = Math.max(0, providerIds.length - visible.length);

		return (
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<div className="flex items-center gap-1">
					{visible.map((providerId) => (
						<Logo
							key={providerId}
							id={providerId}
							width={16}
							height={16}
							className="h-4 w-4 shrink-0"
							fallback={<div className="h-4 w-4 rounded bg-muted" />}
						/>
					))}
				</div>
				{hiddenCount > 0 ? <span>+{hiddenCount}</span> : null}
			</div>
		);
	};

	const selectorLabel = useMemo(() => {
		const primaryLabel = selectedPrimaryModel?.displayName || selectedModelId;
		const totalSelected = selectedDropdownItems.length;

		if (!primaryLabel && totalSelected === 0) {
			return "Select models...";
		}

		if (totalSelected <= 1 && primaryLabel) {
			return primaryLabel;
		}

		if (totalSelected > 1) {
			return `${totalSelected} models selected`;
		}

		if (selectedComparisonModels.length === 1) {
			return selectedComparisonModels[0].displayName;
		}

		return "Select models...";
	}, [maxComparisonModels, selectedComparisonModels, selectedDropdownItems.length, selectedModelId, selectedPrimaryModel]);

	return (
		<Card>
			<CardHeader className="pb-4">
				<CardTitle className="flex items-center justify-between gap-3 flex-wrap">
					<span>Model Selection</span>
					<Badge variant="outline" className="text-[11px]">
						{availableModels.length.toLocaleString()} models
					</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="space-y-2">
					<Label htmlFor="model-select">Select Models</Label>
					<Popover open={openModel} onOpenChange={setOpenModel}>
						<PopoverTrigger asChild>
							<Button
								variant="outline"
								role="combobox"
								aria-expanded={openModel}
								className="w-full justify-between"
							>
								{selectorLabel}
								<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-[min(620px,95vw)] p-0">
							<Command>
								<CommandInput placeholder="Search models..." />
								<CommandList>
									<CommandEmpty>No model found.</CommandEmpty>
								{selectedEndpoint && comparisonCandidates.length > 0 ? (
										<>
											{selectedDropdownItems.length > 0 && (
												<CommandGroup heading="Selected">
													{selectedDropdownItems.map((model) => {
														const supportedProviders =
															comparisonProvidersByModelId.get(model.modelId) ?? [model.provider];
														return (
															<CommandItem
																key={`selected-${model.key}`}
																value={`selected ${model.displayName} ${model.provider}`}
																onSelect={() => {
																	onRemoveModelSelection(model.key);
																	setTimeout(() => setOpenModel(true), 0);
																}}
																className="flex items-center justify-between gap-2"
															>
																<div className="flex min-w-0 items-center gap-2">
																	<Logo
																		id={model.provider}
																		width={16}
																		height={16}
																		className="h-4 w-4 shrink-0"
																		fallback={<div className="h-4 w-4 rounded bg-muted" />}
																	/>
																	<span className="truncate text-sm">{model.displayName}</span>
																</div>
																{renderProviderLogos(supportedProviders)}
															</CommandItem>
														);
													})}
												</CommandGroup>
											)}

											{comparisonCandidatesByProvider.map((group) => (
												<CommandGroup key={group.provider} heading={group.providerLabel}>
													{group.candidates.map((candidate) => {
														const isPrimary =
															selectedPrimaryCandidate?.key === candidate.key;
														const isComparisonSelected =
															comparisonModelKeys.includes(candidate.key);
														const isSelected = isPrimary || isComparisonSelected;
														const atLimit =
															!isSelected &&
															comparisonModelKeys.length >= maxComparisonModels;
														const supportedProviders =
															comparisonProvidersByModelId.get(candidate.modelId) ?? [candidate.provider];

														return (
															<CommandItem
																key={candidate.key}
																value={`all ${candidate.displayName} ${candidate.provider}`}
																onSelect={() => {
																	if (isPrimary) {
																		setTimeout(() => setOpenModel(true), 0);
																		return;
																	}
																	if (!atLimit) {
																		onToggleComparisonModel(candidate.key);
																		setTimeout(() => setOpenModel(true), 0);
																	}
																}}
																disabled={atLimit}
																className={`flex items-center justify-between gap-2 ${isSelected ? "bg-foreground/5" : ""}`}
															>
																<div className="flex min-w-0 items-center gap-2">
																	<Logo
																		id={candidate.provider}
																		width={16}
																		height={16}
																		className="h-4 w-4 shrink-0"
																		fallback={<div className="h-4 w-4 rounded bg-muted" />}
																	/>
																	<span className="truncate text-sm">{candidate.displayName}</span>
																</div>
																{renderProviderLogos(supportedProviders)}
															</CommandItem>
														);
													})}
												</CommandGroup>
											))}
										</>
									) : (
										<>
											{availableModelsByProvider.map((group) => (
												<CommandGroup key={group.provider} heading={group.providerLabel}>
													{group.models.map((model) => {
														const isSelected = selectedModelId === model.modelId;
														return (
															<CommandItem
																key={`${group.provider}-${model.modelId}`}
																value={`${group.providerLabel} ${model.displayName}`}
																onSelect={() => {
																	onModelSelect(model.modelId);
																	setTimeout(() => setOpenModel(true), 0);
																}}
																className={`flex items-center justify-between ${isSelected ? "bg-foreground/5" : ""}`}
															>
																<div className="flex min-w-0 items-center gap-2">
																	<Logo
																		id={group.provider}
																		width={16}
																		height={16}
																		className="h-4 w-4 shrink-0"
																		fallback={<div className="h-4 w-4 rounded bg-muted" />}
																	/>
																	<span className="truncate text-sm">{model.displayName}</span>
																</div>
																{renderProviderLogos(model.providers)}
															</CommandItem>
														);
													})}
												</CommandGroup>
											))}
										</>
									)}
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
				</div>

				{selectedDropdownItems.length > 0 && (
					<div className="flex flex-wrap gap-2 rounded-lg border bg-muted/20 p-3">
						{selectedDropdownItems.map((model) => {
							return (
								<Badge
									key={model.key}
									variant="secondary"
									className="flex items-center gap-1.5 py-1"
								>
									<span className="max-w-[220px] truncate">{model.displayName}</span>
									<button
										type="button"
										className="inline-flex items-center"
										onClick={() => onRemoveModelSelection(model.key)}
										aria-label={`Remove ${model.displayName} from selection`}
									>
										<X className="h-3 w-3" />
									</button>
								</Badge>
							);
						})}
					</div>
				)}

				{selectedModelId && availableEndpoints.length > 0 && (
					<div className="space-y-2">
						<Label htmlFor="endpoint-select">Select Endpoint</Label>
						<Select
							value={selectedEndpoint}
							onValueChange={onEndpointSelect}
						>
							<SelectTrigger id="endpoint-select">
								<SelectValue placeholder="Select endpoint..." />
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
				)}
			</CardContent>
		</Card>
	);
}
