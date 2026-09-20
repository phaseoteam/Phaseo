"use client";

import { useMemo, useState } from "react";
import {
	ModelSelector as ModelPicker,
	ModelSelectorContent,
	ModelSelectorInput,
	ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { VirtualizedModelCatalog } from "@/components/(chat)/VirtualizedModelCatalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
import { comparePricingEndpoints } from "./calculatorState";
import type { CalculatorCatalogModel, CalculatorModelSelection } from "./calculatorState";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import {
	Braces,
	CalendarDays,
	ChevronsUpDown,
	DatabaseZap,
	Plus,
	Search,
	Server,
	LoaderCircle,
	X,
} from "lucide-react";

function formatProviderLabel(providerId: string): string {
	const known: Record<string, string> = {
		openai: "OpenAI",
		anthropic: "Anthropic",
		google: "Google",
		"google-ai-studio": "Google AI Studio",
		"google-vertex": "Google Vertex",
		"spacex-ai": "SpaceXAI",
		"x-ai": "xAI",
		aws: "AWS",
		azure: "Azure",
	};
	return known[providerId] ?? providerId
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPlanLabel(plan: string): string {
	const value = plan.replace(/[-_]+/g, " ").trim().toLowerCase();
	return value ? value[0].toUpperCase() + value.slice(1) : "";
}

function formatEndpointLabel(endpoint: string): string {
	const value = endpoint.replace(/[._-]+/g, " ").trim().toLowerCase();
	return value ? value[0].toUpperCase() + value.slice(1) : "";
}

function PricingPlanIcon({ plan, className }: { plan: string; className?: string }) {
	const tier = getTierFilterMeta(plan);
	const Icon = tier.icon;
	return <Icon className={cn("size-4", className, tier.iconClassName)} />;
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
	catalogModels: CalculatorCatalogModel[];
	cachedModels?: GatewaySupportedModel[];
	selectedModels: CalculatorModelSelection[];
	modelConfigs: Record<string, SelectedPricingModelConfig>;
	loadingModelIds?: string[];
	pricingNotice?: string | null;
	onAddModel: (modelId: string) => void | Promise<void>;
	onRemoveModel: (selectionId: string) => void;
	onUpdateModelConfig: (
		selectionId: string,
		patch: Partial<SelectedPricingModelConfig>
	) => void;
}

export function ModelSelector({
	models,
	catalogModels,
	cachedModels = [],
	selectedModels,
	modelConfigs,
	loadingModelIds = [],
	pricingNotice,
	onAddModel,
	onRemoveModel,
	onUpdateModelConfig,
}: ModelSelectorProps) {
	const format = useDisplayFormatters();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [activeModelId, setActiveModelId] = useState<string | null>(null);

	const cachedByModelId = useMemo(() => {
		const map = new Map<string, GatewaySupportedModel[]>();
		for (const model of cachedModels) {
			for (const id of [model.selectorModelId, model.modelId, model.internalModelId]) {
				if (!id) continue;
				const rows = map.get(id) ?? [];
				if (!rows.includes(model)) rows.push(model);
				map.set(id, rows);
			}
		}
		return map;
	}, [cachedModels]);

	const modelOptions = useMemo(() => {
		const modelMap = new Map<
			string,
			{
				modelId: string;
				displayName: string;
				organisationId: string;
				organisationName: string;
				releaseDate?: string | null;
				announcementDate?: string | null;
				providers: Set<string>;
				endpoints: Set<string>;
				meters: Set<string>;
			}
		>();
		for (const model of catalogModels) {
			const cachedRows = cachedByModelId.get(model.modelId) ?? [];
			modelMap.set(model.modelId, {
				modelId: model.modelId,
				displayName: model.displayName,
				organisationId: model.organisationId,
				organisationName: model.organisationName,
				releaseDate: model.releaseDate,
				announcementDate: model.announcementDate,
				providers: new Set(cachedRows.map((row) => row.providerId)),
				endpoints: new Set(cachedRows.flatMap((row) => row.capabilities)),
				meters: new Set<string>(),
			});
		}

		for (const row of models) {
			const cachedRows = cachedByModelId.get(row.model) ?? [];
			const cached = cachedRows[0];
			const organisationId =
				cached?.organisationId?.trim() || row.model.split("/")[0] || row.provider;
			const entry = modelMap.get(row.model) ?? {
				modelId: row.model,
				displayName: row.display_name || cached?.modelName || row.model,
				organisationId,
				organisationName:
					cached?.organisationName || formatProviderLabel(organisationId),
				releaseDate: row.release_date || cached?.releaseDate,
				announcementDate: row.announcement_date || cached?.announcementDate,
				providers: new Set<string>(),
				endpoints: new Set<string>(),
				meters: new Set<string>(),
			};
			entry.providers.add(row.provider);
			entry.endpoints.add(row.endpoint);
			for (const meter of row.meters) entry.meters.add(meter.meter);
			for (const cachedRow of cachedRows) entry.providers.add(cachedRow.providerId);
			modelMap.set(row.model, entry);
		}

		return Array.from(modelMap.values())
			.map((model) => ({
				...model,
				providers: Array.from(model.providers).sort(),
				endpoints: Array.from(model.endpoints).sort(),
				meterCount: model.meters.size,
				sortTimestamp: releaseTimestamp(model.releaseDate, model.announcementDate),
			}))
			.sort((left, right) =>
				right.sortTimestamp - left.sortTimestamp ||
				left.displayName.localeCompare(right.displayName)
			);
	}, [cachedByModelId, catalogModels, models]);

	const optionByModelId = useMemo(
		() => new Map(modelOptions.map((model) => [model.modelId, model])),
		[modelOptions]
	);

	const selectionOptions = useMemo(() => {
		const map = new Map<string, Map<string, Map<string, Set<string>>>>();
		for (const row of models) {
			const endpointMap = map.get(row.model) ?? new Map();
			const providerMap = endpointMap.get(row.endpoint) ?? new Map();
			const plans = providerMap.get(row.provider) ?? new Set<string>();
			plans.add(row.pricing_plan || "standard");
			providerMap.set(row.provider, plans);
			endpointMap.set(row.endpoint, providerMap);
			map.set(row.model, endpointMap);
		}
		return map;
	}, [models]);

	const selectionCountByModelId = useMemo(() => {
		const counts = new Map<string, number>();
		for (const selection of selectedModels) {
			counts.set(selection.modelId, (counts.get(selection.modelId) ?? 0) + 1);
		}
		return counts;
	}, [selectedModels]);
	const loadingModelSet = useMemo(() => new Set(loadingModelIds), [loadingModelIds]);
	const normalizedQuery = query.trim().toLowerCase();
	const filteredModels = useMemo(() => {
		if (!normalizedQuery) return modelOptions;
		return modelOptions.filter((model) =>
			[
				model.displayName,
				model.modelId,
				model.organisationName,
				model.organisationId,
				model.providers.join(" "),
				model.endpoints.join(" "),
			]
				.join(" ")
				.toLowerCase()
				.includes(normalizedQuery)
		);
	}, [modelOptions, normalizedQuery]);

	const visibleActiveModelId = filteredModels.some(
		(model) => model.modelId === activeModelId
	)
		? activeModelId
		: filteredModels[0]?.modelId ?? null;

	const getEndpointOptions = (modelId: string) =>
		Array.from(selectionOptions.get(modelId)?.keys() ?? []).sort(comparePricingEndpoints);
	const getProviderOptions = (modelId: string, endpoint: string) =>
		Array.from(selectionOptions.get(modelId)?.get(endpoint)?.keys() ?? []).sort();
	const getPlanOptions = (modelId: string, endpoint: string, provider: string) =>
		Array.from(
			selectionOptions.get(modelId)?.get(endpoint)?.get(provider) ?? []
		).sort((left, right) => {
			if (left === "standard") return -1;
			if (right === "standard") return 1;
			return left.localeCompare(right);
		});

	return (
		<Card className="gap-0 overflow-hidden py-0">
			<CardHeader className="rounded-none border-b bg-muted/15 p-5">
				<CardTitle className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<span className="text-base">Choose models</span>
						<p className="text-xs font-normal text-muted-foreground">
							Search the full model catalogue and add as many comparisons as you need.
						</p>
					</div>
					<Badge variant="outline" className="rounded-lg bg-background text-xs">
						{selectedModels.length} selected
					</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4 p-5">
				<ModelPicker
					open={open}
					onOpenChange={(nextOpen) => {
						setOpen(nextOpen);
						if (!nextOpen) setQuery("");
					}}
				>
					<ModelSelectorTrigger asChild>
						<Button
							type="button"
							variant="outline"
							className="h-13 w-full justify-between rounded-lg border-dashed bg-background px-4 text-left shadow-none hover:border-foreground/25 hover:bg-muted/30"
						>
							<span className="flex min-w-0 items-center gap-3">
								<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
									<Search className="size-4" />
								</span>
								<span className="min-w-0">
									<span className="block truncate text-sm font-medium">Search models</span>
									<span className="block truncate text-xs text-muted-foreground">
										{format.number(modelOptions.length)} models in the catalogue
									</span>
								</span>
							</span>
							<ChevronsUpDown className="size-4 text-muted-foreground" />
						</Button>
					</ModelSelectorTrigger>
					<ModelSelectorContent
						title="Select models for pricing comparison"
						className="w-[min(94vw,920px)] max-w-3xl"
						commandProps={{ shouldFilter: false }}
					>
						<ModelSelectorInput
							placeholder="Search models, organisations, providers, or endpoints..."
							value={query}
							onValueChange={(value) => {
								setQuery(value);
								setActiveModelId(null);
							}}
							onKeyDown={(event) => {
								if (filteredModels.length === 0) return;
								const currentIndex = filteredModels.findIndex(
									(model) => model.modelId === visibleActiveModelId
								);
								if (event.key === "ArrowDown" || event.key === "ArrowUp") {
									event.preventDefault();
									const direction = event.key === "ArrowDown" ? 1 : -1;
									const nextIndex = currentIndex < 0
										? 0
										: (currentIndex + direction + filteredModels.length) % filteredModels.length;
									setActiveModelId(filteredModels[nextIndex]?.modelId ?? null);
								}
								if (event.key === "Enter" && visibleActiveModelId) {
									event.preventDefault();
									onAddModel(visibleActiveModelId);
								}
							}}
						/>
						<div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
							<span>{format.number(filteredModels.length)} models</span>
							<span>Models can be added more than once</span>
						</div>
						<VirtualizedModelCatalog
							sections={[{
								key: "priced-models",
								heading: normalizedQuery ? "Search results" : "Recently released",
								items: filteredModels,
							}]}
							getItemKey={(model) => model.modelId}
							activeItemKey={visibleActiveModelId}
							isItemDisabled={(model) => loadingModelSet.has(model.modelId)}
							onActiveItemChange={setActiveModelId}
							onSelectItem={(model) => onAddModel(model.modelId)}
							estimateItemSize={64}
							emptyContent="No models found."
							renderItem={(model) => {
									const selectedCount = selectionCountByModelId.get(model.modelId) ?? 0;
									return (
										<div
											data-checked={selectedCount > 0}
											className={cn("flex h-14 w-full items-center gap-3 rounded-lg px-2", selectedCount > 0 && "bg-primary/5")}
										>
											<Logo
												id={model.organisationId}
												alt={model.organisationName}
												width={28}
												height={28}
												className="size-7 shrink-0 rounded-md"
												fallback={<div className="size-7 rounded-md bg-muted" />}
											/>
											<span className="min-w-0 flex-1">
												<span className="block truncate text-sm font-medium">{model.displayName}</span>
												<span className="block truncate text-xs text-muted-foreground">
													{model.organisationName} • {model.modelId}
												</span>
											</span>
											<span className="hidden shrink-0 items-center gap-1.5 sm:flex">
												<Badge variant="secondary" className="rounded-md text-[10px]">
													{model.providers.length} provider{model.providers.length === 1 ? "" : "s"}
												</Badge>
												<Badge variant="outline" className="rounded-md text-[10px]">
													{model.meterCount > 0 ? `${model.meterCount} meters` : "Pricing on add"}
												</Badge>
											</span>
											{selectedCount > 0 ? (
												<Badge variant="outline" className="shrink-0 rounded-md text-[10px]">
													{selectedCount} added
												</Badge>
											) : null}
											{loadingModelSet.has(model.modelId) ? (
												<LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
											) : (
												<Plus className="size-4 shrink-0 text-muted-foreground" />
											)}
										</div>
									);
							}}
						/>
						{pricingNotice ? (
							<p className="px-1 text-xs text-amber-700 dark:text-amber-300">{pricingNotice}</p>
						) : null}
					</ModelSelectorContent>
				</ModelPicker>

				<div className="grid gap-3 xl:grid-cols-2">
					{selectedModels.map((selection, index) => {
						const modelId = selection.modelId;
						const option = optionByModelId.get(modelId);
						const config = modelConfigs[selection.id];
						const endpointOptions = getEndpointOptions(modelId);
						const endpoint = config?.endpoint || endpointOptions[0] || "";
						const providerOptions = getProviderOptions(modelId, endpoint);
						const provider = config?.provider || providerOptions[0] || "";
						const planOptions = getPlanOptions(modelId, endpoint, provider);
						return (
							<div key={selection.id} className="rounded-xl border bg-muted/10 p-4 shadow-xs">
								<div className="flex items-start gap-3">
									<Logo
										id={option?.organisationId || modelId.split("/")[0]}
										width={36}
										height={36}
										className="size-9 shrink-0 rounded-lg"
										fallback={<div className="size-9 rounded-lg bg-muted" />}
									/>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="truncate text-sm font-semibold">{option?.displayName || modelId}</span>
											<Badge variant="outline" className="rounded-md px-1.5 text-[10px]">#{index + 1}</Badge>
										</div>
										<p className="truncate text-xs text-muted-foreground">{modelId}</p>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className="rounded-lg text-muted-foreground hover:text-destructive"
										onClick={() => onRemoveModel(selection.id)}
										aria-label={`Remove ${option?.displayName || modelId}`}
									>
										<X className="size-4" />
									</Button>
								</div>

								<div className="mt-4 grid gap-2 sm:grid-cols-3">
									<div className="space-y-1.5">
										<span className="text-xs font-medium text-muted-foreground">Endpoint</span>
										<Select
										value={endpoint}
										onValueChange={(nextEndpoint) => onUpdateModelConfig(selection.id, { endpoint: nextEndpoint, provider: "", pricingPlan: "" })}
									>
										<SelectTrigger className="h-11 w-full rounded-xl border bg-background px-3">
											<Braces className="size-4 text-muted-foreground" />
											<span className="min-w-0 flex-1 truncate text-left">{formatEndpointLabel(endpoint)}</span>
										</SelectTrigger>
										<SelectContent align="start">
											{endpointOptions.map((value) => <SelectItem key={value} value={value}><Braces className="size-4 text-muted-foreground" />{formatEndpointLabel(value)}</SelectItem>)}
										</SelectContent>
										</Select>
									</div>

									<div className="space-y-1.5">
										<span className="text-xs font-medium text-muted-foreground">Provider</span>
										<Select
										value={provider}
										onValueChange={(nextProvider) => onUpdateModelConfig(selection.id, { provider: nextProvider, pricingPlan: "" })}
									>
										<SelectTrigger className="h-11 w-full rounded-xl border bg-background px-3">
											<Logo id={provider} width={16} height={16} className="size-4" fallback={<Server className="size-4 text-muted-foreground" />} />
											<span className="min-w-0 flex-1 truncate text-left">{formatProviderLabel(provider)}</span>
										</SelectTrigger>
										<SelectContent align="start">
											{providerOptions.map((value) => <SelectItem key={value} value={value}><Logo id={value} width={16} height={16} className="size-4" fallback={<div className="size-4 rounded bg-muted" />} />{formatProviderLabel(value)}</SelectItem>)}
										</SelectContent>
										</Select>
									</div>

									<div className="space-y-1.5">
										<span className="text-xs font-medium text-muted-foreground">Pricing plan</span>
										<Select
										value={config?.pricingPlan || planOptions[0] || ""}
										onValueChange={(pricingPlan) => onUpdateModelConfig(selection.id, { pricingPlan })}
									>
										<SelectTrigger className="h-11 w-full rounded-xl border bg-background px-3">
											<PricingPlanIcon plan={config?.pricingPlan || planOptions[0] || ""} />
											<span className="min-w-0 flex-1 truncate text-left">{formatPlanLabel(config?.pricingPlan || planOptions[0] || "")}</span>
										</SelectTrigger>
										<SelectContent align="start">
											{planOptions.map((value) => <SelectItem key={value} value={value}><PricingPlanIcon plan={value} />{formatPlanLabel(value)}</SelectItem>)}
										</SelectContent>
										</Select>
									</div>
								</div>

								<div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
									<span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1"><CalendarDays className="size-3" />{option?.releaseDate || option?.announcementDate ? format.calendarDate(option?.releaseDate || option?.announcementDate) : "Release unknown"}</span>
									<span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1"><DatabaseZap className="size-3" />{option?.meterCount ?? 0} priced meters</span>
								</div>
							</div>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
