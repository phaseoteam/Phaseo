"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Logo } from "@/components/Logo";
import { X } from "lucide-react";

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

function releaseTimestamp(
	releaseDate?: string | null,
	announcementDate?: string | null
): number {
	const parsed = Date.parse(releaseDate || announcementDate || "");
	return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function formatReleaseDate(
	releaseDate?: string | null,
	announcementDate?: string | null
): string {
	const date = releaseDate || announcementDate;
	if (!date) return "Unknown";
	const parsed = new Date(date);
	if (Number.isNaN(parsed.getTime())) return "Unknown";
	return parsed.toISOString().slice(0, 10);
}

type PricingModel = {
	provider: string;
	model: string;
	endpoint: string;
	display_name?: string;
	release_date?: string | null;
	announcement_date?: string | null;
	pricing_plan?: string | null;
	meters: Array<{
		meter: string;
		unit: string;
		unit_size: number;
		price_per_unit: string;
		currency: string;
	}>;
};

export type SelectedPricingModelConfig = {
	endpoint: string;
	provider: string;
	pricingPlan: string;
};

interface ModelSelectorProps {
	models: PricingModel[];
	selectedModelIds: string[];
	modelConfigs: Record<string, SelectedPricingModelConfig>;
	onToggleModel: (modelId: string) => void;
	onUpdateModelConfig: (
		modelId: string,
		patch: Partial<SelectedPricingModelConfig>
	) => void;
}

export function ModelSelector({
	models,
	selectedModelIds,
	modelConfigs,
	onToggleModel,
	onUpdateModelConfig,
}: ModelSelectorProps) {
	const [query, setQuery] = useState("");

	const modelOptions = useMemo(() => {
		const modelMap = new Map<
			string,
			{
				modelId: string;
				displayName: string;
				releaseDate?: string | null;
				announcementDate?: string | null;
				providers: Set<string>;
				endpoints: Set<string>;
				meterCount: Set<string>;
			}
		>();

		for (const row of models) {
			if (!modelMap.has(row.model)) {
				modelMap.set(row.model, {
					modelId: row.model,
					displayName: row.display_name || row.model,
					releaseDate: row.release_date,
					announcementDate: row.announcement_date,
					providers: new Set(),
					endpoints: new Set(),
					meterCount: new Set(),
				});
			}
			const entry = modelMap.get(row.model)!;
			entry.providers.add(row.provider);
			entry.endpoints.add(row.endpoint);
			for (const meter of row.meters) {
				entry.meterCount.add(meter.meter);
			}
			if (!entry.releaseDate && row.release_date) {
				entry.releaseDate = row.release_date;
			}
			if (!entry.announcementDate && row.announcement_date) {
				entry.announcementDate = row.announcement_date;
			}
		}

		return Array.from(modelMap.values())
			.map((model) => ({
				...model,
				providers: Array.from(model.providers).sort(),
				endpoints: Array.from(model.endpoints).sort(),
				meterCount: model.meterCount.size,
				sortTs: releaseTimestamp(model.releaseDate, model.announcementDate),
			}))
			.sort((a, b) => {
				if (a.sortTs !== b.sortTs) return b.sortTs - a.sortTs;
				return a.displayName.localeCompare(b.displayName);
			});
	}, [models]);

	const optionByModelId = useMemo(
		() => new Map(modelOptions.map((model) => [model.modelId, model])),
		[modelOptions]
	);

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

	const selectedModelSet = useMemo(
		() => new Set(selectedModelIds),
		[selectedModelIds]
	);

	const normalizedQuery = query.trim().toLowerCase();
	const filteredModels = useMemo(() => {
		if (!normalizedQuery) return modelOptions;
		return modelOptions.filter((model) => {
			const haystack = [
				model.displayName,
				model.modelId,
				formatReleaseDate(model.releaseDate, model.announcementDate),
				model.providers.join(" "),
				model.endpoints.join(" "),
			]
				.join(" ")
				.toLowerCase();
			return haystack.includes(normalizedQuery);
		});
	}, [modelOptions, normalizedQuery]);

	const visibleModels = filteredModels.slice(0, 160);

	const getEndpointOptions = (modelId: string) =>
		Array.from(selectionOptions.get(modelId)?.keys() ?? []).sort();

	const getProviderOptions = (modelId: string, endpoint: string) =>
		Array.from(selectionOptions.get(modelId)?.get(endpoint)?.keys() ?? []).sort();

	const getPlanOptions = (
		modelId: string,
		endpoint: string,
		provider: string
	) =>
		Array.from(
			selectionOptions.get(modelId)?.get(endpoint)?.get(provider) ?? []
		).sort((a, b) => {
			if (a === "standard") return -1;
			if (b === "standard") return 1;
			return a.localeCompare(b);
		});

	return (
		<Card>
			<CardHeader className="pb-4">
				<CardTitle className="flex flex-wrap items-center justify-between gap-3">
					<span>Models</span>
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="outline" className="text-[11px]">
							Sorted by release date
						</Badge>
						<Badge variant="outline" className="text-[11px]">
							{selectedModelIds.length} selected
						</Badge>
					</div>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="space-y-2">
					<Label htmlFor="pricing-model-search">Search models</Label>
					<Input
						id="pricing-model-search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search by model, provider, endpoint, or release date"
					/>
				</div>

				<div className="overflow-hidden rounded-lg border">
					<div className="max-h-[440px] overflow-auto">
						<Table>
							<TableHeader className="sticky top-0 z-10 bg-background">
								<TableRow>
									<TableHead className="w-[52px]">Use</TableHead>
									<TableHead className="min-w-[280px]">Model</TableHead>
									<TableHead className="min-w-[110px]">Released</TableHead>
									<TableHead className="min-w-[160px]">Providers</TableHead>
									<TableHead className="min-w-[120px] text-right">Meters</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{visibleModels.map((model) => {
									const isSelected = selectedModelSet.has(model.modelId);
									return (
										<TableRow
											key={model.modelId}
											className={isSelected ? "bg-primary/5" : undefined}
										>
											<TableCell>
												<Checkbox
													checked={isSelected}
													onCheckedChange={() => onToggleModel(model.modelId)}
													aria-label={`Select ${model.displayName}`}
												/>
											</TableCell>
											<TableCell>
												<button
													type="button"
													onClick={() => onToggleModel(model.modelId)}
													className="block max-w-[360px] text-left"
												>
													<span className="block truncate text-sm font-medium">
														{model.displayName}
													</span>
													<span className="block truncate text-xs text-muted-foreground">
														{model.modelId}
													</span>
												</button>
											</TableCell>
											<TableCell className="text-sm">
												{formatReleaseDate(
													model.releaseDate,
													model.announcementDate
												)}
											</TableCell>
											<TableCell>
												<div className="flex items-center gap-1.5">
													{model.providers.slice(0, 5).map((providerId) => (
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
													<span className="text-xs text-muted-foreground">
														{model.providers.length}
													</span>
												</div>
											</TableCell>
											<TableCell className="text-right text-sm">
												{model.meterCount}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
					{filteredModels.length > visibleModels.length ? (
						<div className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
							Showing {visibleModels.length.toLocaleString()} of{" "}
							{filteredModels.length.toLocaleString()} matching models. Refine
							the search to narrow the list.
						</div>
					) : null}
				</div>

				{selectedModelIds.length > 0 ? (
					<div className="space-y-3">
						<div className="flex items-center justify-between gap-3">
							<h3 className="text-sm font-semibold">Selected Model Pricing</h3>
							<p className="text-xs text-muted-foreground">
								Configure endpoint, provider, and plan per selected model.
							</p>
						</div>
						<div className="overflow-x-auto rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="min-w-[260px]">Model</TableHead>
										<TableHead className="min-w-[190px]">Endpoint</TableHead>
										<TableHead className="min-w-[190px]">Provider</TableHead>
										<TableHead className="min-w-[160px]">Plan</TableHead>
										<TableHead className="w-[56px]" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{selectedModelIds.map((modelId) => {
										const option = optionByModelId.get(modelId);
										const config = modelConfigs[modelId];
										const endpointOptions = getEndpointOptions(modelId);
										const providerOptions = getProviderOptions(
											modelId,
											config?.endpoint || endpointOptions[0] || ""
										);
										const planOptions = getPlanOptions(
											modelId,
											config?.endpoint || endpointOptions[0] || "",
											config?.provider || providerOptions[0] || ""
										);

										return (
											<TableRow key={`selected-${modelId}`}>
												<TableCell>
													<div className="max-w-[320px]">
														<p className="truncate text-sm font-medium">
															{option?.displayName || modelId}
														</p>
														<p className="truncate text-xs text-muted-foreground">
															{modelId}
														</p>
													</div>
												</TableCell>
												<TableCell>
													<Select
														value={config?.endpoint || endpointOptions[0] || ""}
														onValueChange={(endpoint) =>
															onUpdateModelConfig(modelId, {
																endpoint,
																provider: "",
																pricingPlan: "",
															})
														}
													>
														<SelectTrigger className="h-9">
															<SelectValue placeholder="Endpoint" />
														</SelectTrigger>
														<SelectContent>
															{endpointOptions.map((endpoint) => (
																<SelectItem key={endpoint} value={endpoint}>
																	{endpoint}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</TableCell>
												<TableCell>
													<Select
														value={config?.provider || providerOptions[0] || ""}
														onValueChange={(provider) =>
															onUpdateModelConfig(modelId, {
																provider,
																pricingPlan: "",
															})
														}
													>
														<SelectTrigger className="h-9">
															<SelectValue placeholder="Provider" />
														</SelectTrigger>
														<SelectContent>
															{providerOptions.map((provider) => (
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
												</TableCell>
												<TableCell>
													<Select
														value={config?.pricingPlan || planOptions[0] || ""}
														onValueChange={(pricingPlan) =>
															onUpdateModelConfig(modelId, { pricingPlan })
														}
													>
														<SelectTrigger className="h-9">
															<SelectValue placeholder="Plan" />
														</SelectTrigger>
														<SelectContent>
															{planOptions.map((plan) => (
																<SelectItem key={plan} value={plan}>
																	{formatPlanLabel(plan)}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</TableCell>
												<TableCell>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														onClick={() => onToggleModel(modelId)}
														aria-label={`Remove ${option?.displayName || modelId}`}
													>
														<X className="h-4 w-4" />
													</Button>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
