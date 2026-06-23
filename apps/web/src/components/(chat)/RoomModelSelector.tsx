"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
	compareByReleaseDateDesc,
	groupModelsByReleaseMonth,
	getDefaultFavoriteModelIds,
	MODEL_SELECTOR_FAVORITES_STORAGE_KEY,
	normalizeFavoriteModelId,
} from "@/components/(chat)/playgroundConfig";
import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
	ModelSelectorSeparator,
	ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Logo } from "@/components/Logo";
import {
	buildModalityFacetOptions,
	normalizeModelSelectorModality,
	RoomModelSelectorFilters,
	type ModelFilterState,
} from "@/components/(chat)/RoomModelSelectorFilters";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { cn } from "@/lib/utils";
import { CircleCheck, Plus, Star, X } from "lucide-react";

type ModelOption = {
	modelId: string;
	orgId: string;
	orgName: string;
	label: string;
	providerIds: string[];
	providerNames: string[];
	providerNameById: Record<string, string>;
	providerAvailability: Record<string, boolean>;
	inputModalities: string[];
	outputModalities: string[];
	releaseDate: string | null;
	gatewayStatus: "active" | "inactive";
};

type RoomModelSelectorProps = {
	models: GatewaySupportedModel[];
	selectedModelIds: string[];
	onSelectModel: (modelId: string) => void;
	onRemoveModel?: (modelId: string) => void;
	onRemoveAllModels?: () => void;
	modelDisplayNameById?: Record<string, string>;
	modelEnabledById?: Record<string, boolean>;
	onOpenModelSettingsForModel?: (modelId: string) => void;
};

function normalizeSearchText(value: string): string {
	return value.trim().toLowerCase();
}

function tokenizeSearchText(value: string): string[] {
	return normalizeSearchText(value).split(/\s+/).filter(Boolean);
}

function includesTerm(haystack: string, term: string): boolean {
	return haystack.includes(term);
}

function computeOptionSearchScore(option: ModelOption, query: string): number {
	const normalizedQuery = normalizeSearchText(query);
	if (!normalizedQuery) return 0;

	const modelId = option.modelId.toLowerCase();
	const label = option.label.toLowerCase();
	const orgName = option.orgName.toLowerCase();
	const orgId = option.orgId.toLowerCase();
	const providerIds = option.providerIds.map((providerId) => providerId.toLowerCase());
	const providerNames = option.providerNames.map((providerName) =>
		providerName.toLowerCase(),
	);
	const terms = tokenizeSearchText(normalizedQuery);

	let score = 0;
	if (modelId === normalizedQuery) score += 2200;
	if (label === normalizedQuery) score += 2000;
	if (modelId.startsWith(normalizedQuery)) score += 1400;
	if (label.startsWith(normalizedQuery)) score += 1300;
	if (orgName.startsWith(normalizedQuery) || orgId.startsWith(normalizedQuery)) {
		score += 920;
	}
	if (providerNames.some((providerName) => providerName.startsWith(normalizedQuery))) {
		score += 900;
	}
	if (providerIds.some((providerId) => providerId.startsWith(normalizedQuery))) {
		score += 880;
	}
	if (includesTerm(modelId, normalizedQuery)) score += 760;
	if (includesTerm(label, normalizedQuery)) score += 700;
	if (includesTerm(orgName, normalizedQuery) || includesTerm(orgId, normalizedQuery)) {
		score += 520;
	}
	if (
		providerNames.some((providerName) =>
			includesTerm(providerName, normalizedQuery),
		) ||
		providerIds.some((providerId) => includesTerm(providerId, normalizedQuery))
	) {
		score += 460;
	}

	for (const term of terms) {
		if (modelId.startsWith(term)) score += 220;
		if (label.startsWith(term)) score += 190;
		if (modelId.includes(term)) score += 130;
		if (label.includes(term)) score += 120;
		if (orgName.includes(term) || orgId.includes(term)) score += 100;
		if (
			providerNames.some((providerName) => providerName.includes(term)) ||
			providerIds.some((providerId) => providerId.includes(term))
		) {
			score += 90;
		}
	}

	if (option.gatewayStatus === "active") score += 10;
	return score;
}

const getModelBadgeProps = (suffix: string) => {
	switch (suffix) {
		case "free":
			return {
				variant: "secondary" as const,
				className:
					"text-xs shrink-0 bg-green-200 text-green-900 border-green-400 dark:bg-green-800 dark:text-green-100 dark:border-green-600 font-normal px-1 py-0",
			};
		case "new":
			return {
				variant: "secondary" as const,
				className:
					"text-xs shrink-0 bg-blue-200 text-blue-900 border-blue-400 dark:bg-blue-800 dark:text-blue-100 dark:border-blue-600 font-normal px-1 py-0",
			};
		default:
			return {
				variant: "outline" as const,
				className: "text-xs shrink-0 font-normal px-1.5 py-0.5",
			};
	}
};

function formatModelLabel(modelId: string) {
	const parts = modelId.split("/");
	return parts.length > 1 ? parts.slice(1).join("/") : modelId;
}

function formatOrgLabel(orgId: string) {
	return orgId.replace(/-/g, " ");
}

function getOrgId(modelId: string) {
	const [org] = modelId.split("/");
	return org || "ai-stats";
}

function buildModelOptions(models: GatewaySupportedModel[]) {
	const map = new Map<string, ModelOption>();

	for (const model of models) {
		const selectorModelId = model.selectorModelId;
		const existing = map.get(selectorModelId);
		const orgId = model.organisationId?.trim() || getOrgId(selectorModelId);
		const orgName =
			model.organisationName ?? model.providerName ?? formatOrgLabel(orgId);
		const label = model.modelName ?? formatModelLabel(selectorModelId);
		const releaseDate = model.releaseDate ?? model.announcementDate ?? null;
		const providerLabel = model.providerName ?? formatOrgLabel(model.providerId);
		const inputModalities = (model.inputModalities ?? [])
			.map(normalizeModelSelectorModality)
			.filter(Boolean);
		const outputModalities = (model.outputModalities ?? [])
			.map(normalizeModelSelectorModality)
			.filter(Boolean);

		if (!existing) {
			map.set(selectorModelId, {
				modelId: selectorModelId,
				orgId,
				orgName,
				label,
				providerIds: [model.providerId],
				providerNames: [providerLabel],
				providerNameById: { [model.providerId]: providerLabel },
				providerAvailability: { [model.providerId]: model.isAvailable },
				inputModalities: Array.from(new Set(inputModalities)),
				outputModalities: Array.from(new Set(outputModalities)),
				releaseDate,
				gatewayStatus: model.isAvailable ? "active" : "inactive",
			});
		} else {
			if (!existing.providerIds.includes(model.providerId)) {
				existing.providerIds.push(model.providerId);
			}
			if (!existing.providerNames.includes(providerLabel)) {
				existing.providerNames.push(providerLabel);
			}
			existing.providerNameById[model.providerId] = providerLabel;
			existing.providerAvailability[model.providerId] =
				existing.providerAvailability[model.providerId] || model.isAvailable;
			for (const modality of inputModalities) {
				if (!existing.inputModalities.includes(modality)) {
					existing.inputModalities.push(modality);
				}
			}
			for (const modality of outputModalities) {
				if (!existing.outputModalities.includes(modality)) {
					existing.outputModalities.push(modality);
				}
			}
			if (!existing.releaseDate && releaseDate) {
				existing.releaseDate = releaseDate;
			}
			if (
				existing.label === formatModelLabel(existing.modelId) &&
				model.modelName
			) {
				existing.label = model.modelName;
			}
			if (
				existing.orgName === formatOrgLabel(existing.orgId) &&
				model.organisationName
			) {
				existing.orgName = model.organisationName;
			}
		}
	}

	const options = Array.from(map.values()).map((option) => ({
		...option,
		gatewayStatus: Object.values(option.providerAvailability).some(Boolean)
			? ("active" as const)
			: ("inactive" as const),
	}));

	const active: ModelOption[] = [];
	const comingSoon: ModelOption[] = [];
	for (const option of options) {
		if (option.gatewayStatus === "inactive") {
			comingSoon.push(option);
		} else {
			active.push(option);
		}
	}
	active.sort(compareByReleaseDateDesc);
	comingSoon.sort(compareByReleaseDateDesc);

	return {
		active,
		comingSoon,
	};
}

function buildSearchKeywords(option: ModelOption) {
	const joined = [
		option.modelId,
		option.label,
		option.orgName,
		option.orgId,
		...option.providerNames,
		...option.providerIds,
	]
		.join(" ")
		.toLowerCase();
	return joined.split(/\s+/).filter(Boolean);
}

export function RoomModelSelector({
	models,
	selectedModelIds,
	onSelectModel,
	onRemoveModel,
	onRemoveAllModels,
	modelDisplayNameById,
	modelEnabledById,
	onOpenModelSettingsForModel,
}: RoomModelSelectorProps) {
	const modelOptions = useMemo(() => buildModelOptions(models), [models]);
	const [open, setOpen] = useState(false);
	const [searchValue, setSearchValue] = useState("");
	const [filters, setFilters] = useState<ModelFilterState>({
		inputModalities: [],
		outputModalities: [],
		providers: [],
		free: false,
		hideUnavailable: true,
	});
	const [favoriteModelIdSet, setFavoriteModelIdSet] = useState<Set<string>>(
		() => new Set(getDefaultFavoriteModelIds()),
	);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const availableFavoriteIds = new Set(
			[...modelOptions.active, ...modelOptions.comingSoon].map((option) =>
				normalizeFavoriteModelId(option.modelId),
			),
		);
		const raw = window.localStorage.getItem(
			MODEL_SELECTOR_FAVORITES_STORAGE_KEY,
		);
		if (!raw) {
			setFavoriteModelIdSet(
				new Set(
					getDefaultFavoriteModelIds().filter((id) =>
						availableFavoriteIds.has(id),
					),
				),
			);
			return;
		}
		try {
			const parsed = JSON.parse(raw);
			const next = Array.isArray(parsed)
				? parsed
						.map((value) => normalizeFavoriteModelId(String(value)))
						.filter((id) => availableFavoriteIds.has(id))
				: [];
			setFavoriteModelIdSet(new Set(next));
		} catch {
			setFavoriteModelIdSet(
				new Set(
					getDefaultFavoriteModelIds().filter((id) =>
						availableFavoriteIds.has(id),
					),
				),
			);
		}
	}, [modelOptions.active, modelOptions.comingSoon]);

	const facetOptions = useMemo(() => {
		const inputModalities = new Set<string>();
		const outputModalities = new Set<string>();
		const providers = new Map<string, string>();
		for (const option of [...modelOptions.active, ...modelOptions.comingSoon]) {
			for (const modality of option.inputModalities) {
				inputModalities.add(modality);
			}
			for (const modality of option.outputModalities) {
				outputModalities.add(modality);
			}
			for (const providerId of option.providerIds) {
				providers.set(
					providerId,
					option.providerNameById[providerId] ?? formatOrgLabel(providerId),
				);
			}
		}
		return {
			inputModalities: buildModalityFacetOptions(inputModalities),
			outputModalities: buildModalityFacetOptions(outputModalities),
			providers: Array.from(providers.entries())
				.map(([id, label]) => ({ id, label }))
				.sort((a, b) => a.label.localeCompare(b.label)),
		};
	}, [modelOptions.active, modelOptions.comingSoon]);

	const optionMatchesFilters = useCallback(
		(option: ModelOption) => {
			if (filters.free && !option.modelId.endsWith(":free")) {
				return false;
			}
			if (
				filters.inputModalities.length > 0 &&
				!filters.inputModalities.some((modality) =>
					option.inputModalities.includes(modality),
				)
			) {
				return false;
			}
			if (
				filters.outputModalities.length > 0 &&
				!filters.outputModalities.some((modality) =>
					option.outputModalities.includes(modality),
				)
			) {
				return false;
			}
			if (filters.providers.length > 0) {
				const matchesProvider = filters.providers.some((providerId) => {
					if (!option.providerIds.includes(providerId)) return false;
					return filters.hideUnavailable
						? option.providerAvailability[providerId] === true
						: true;
				});
				if (!matchesProvider) return false;
			} else if (filters.hideUnavailable && option.gatewayStatus === "inactive") {
				return false;
			}
			return true;
		},
		[filters],
	);

	const selectedModelPreview = selectedModelIds.slice(0, 5);
	const hiddenSelectedCount = Math.max(
		0,
		selectedModelIds.length - selectedModelPreview.length,
	);
	const hiddenSelectedModelIds = useMemo(
		() => selectedModelIds.slice(selectedModelPreview.length),
		[selectedModelIds, selectedModelPreview.length],
	);
	const selectedModelLabelById = useMemo(() => {
		const labelById = new Map<string, string>();
		for (const option of modelOptions.active) {
			labelById.set(option.modelId, option.label);
		}
		for (const option of modelOptions.comingSoon) {
			labelById.set(option.modelId, option.label);
		}
		return labelById;
	}, [modelOptions.active, modelOptions.comingSoon]);
	const selectedModelOrgIdById = useMemo(() => {
		const orgIdById = new Map<string, string>();
		for (const option of modelOptions.active) {
			orgIdById.set(option.modelId, option.orgId);
		}
		for (const option of modelOptions.comingSoon) {
			orgIdById.set(option.modelId, option.orgId);
		}
		return orgIdById;
	}, [modelOptions.active, modelOptions.comingSoon]);

	const toggleFavoriteModel = (modelId: string) => {
		setFavoriteModelIdSet((prev) => {
			const normalizedId = normalizeFavoriteModelId(modelId);
			const next = new Set(prev);
			if (next.has(normalizedId)) {
				next.delete(normalizedId);
			} else {
				next.add(normalizedId);
			}
			if (typeof window !== "undefined") {
				window.localStorage.setItem(
					MODEL_SELECTOR_FAVORITES_STORAGE_KEY,
					JSON.stringify(Array.from(next)),
				);
			}
			return next;
		});
	};

	const renderModelRow = (option: ModelOption, withComingSoonBadge = false) => (
		<div className="flex min-w-0 flex-1 items-center gap-1.5">
			<div className="flex min-w-0 flex-1 items-center gap-1.5">
				<span className="truncate text-sm font-medium">
					{option.orgName}: {option.label.split(":")[0]}
				</span>
				{option.modelId.includes(":") ? (
					<Badge {...getModelBadgeProps(option.modelId.split(":")[1])}>
						{option.modelId.split(":")[1].replace(/^free$/, "Free")}
					</Badge>
				) : null}
				{selectedModelIds.includes(option.modelId) ? (
					<CircleCheck className="h-4 w-4 shrink-0 text-foreground/70" />
				) : null}
				{withComingSoonBadge ? (
					<Badge
						variant="outline"
						className="h-4 rounded-full border-dashed px-1.5 text-[10px] font-medium"
					>
						Coming soon
					</Badge>
				) : null}
			</div>
			<div className="flex shrink-0 items-center">
				<button
					type="button"
					className={cn(
						"inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors",
						favoriteModelIdSet.has(normalizeFavoriteModelId(option.modelId))
							? "text-amber-500 hover:bg-amber-500/10"
							: "text-muted-foreground hover:bg-muted hover:text-foreground",
					)}
					onMouseDown={(event) => {
						event.preventDefault();
						event.stopPropagation();
					}}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						toggleFavoriteModel(option.modelId);
					}}
					aria-label={
						favoriteModelIdSet.has(normalizeFavoriteModelId(option.modelId))
							? `Remove ${option.label} from favorites`
							: `Add ${option.label} to favorites`
					}
				>
					<Star
						className="h-4 w-4"
						fill={
							favoriteModelIdSet.has(normalizeFavoriteModelId(option.modelId))
								? "currentColor"
								: "none"
						}
					/>
				</button>
			</div>
		</div>
	);

	const renderSelectedModelChip = (modelId: string) => {
		const orgId = selectedModelOrgIdById.get(modelId) ?? getOrgId(modelId);
		const baseLabel = (selectedModelLabelById.get(modelId) ?? modelId).split(":")[0];
		const label = modelDisplayNameById?.[modelId]?.trim() || baseLabel;
		const modelEnabled = modelEnabledById?.[modelId] !== false;
		const canRemoveModel = Boolean(onRemoveModel);
		return (
			<div key={modelId} className="relative shrink-0">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => onOpenModelSettingsForModel?.(modelId)}
					className={cn(
						"h-8 max-w-[220px] gap-1.5 pl-2",
						!modelEnabled && "opacity-55",
						canRemoveModel ? "pr-7" : "pr-2",
					)}
				>
					<Logo
						id={orgId}
						alt={label}
						width={14}
						height={14}
						className="shrink-0 rounded"
					/>
					<span className="truncate text-xs">{label}</span>
				</Button>
				{canRemoveModel ? (
					<button
						type="button"
						className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
						onClick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							onRemoveModel?.(modelId);
						}}
						aria-label={`Remove ${label}`}
					>
						<X className="h-3.5 w-3.5" />
					</button>
				) : null}
			</div>
		);
	};

	const filteredActive = useMemo(
		() => modelOptions.active.filter(optionMatchesFilters),
		[modelOptions.active, optionMatchesFilters],
	);
	const filteredComingSoonEntries = useMemo(
		() => modelOptions.comingSoon.filter(optionMatchesFilters),
		[modelOptions.comingSoon, optionMatchesFilters],
	);
	const favoriteModelIds = useMemo(
		() => Array.from(favoriteModelIdSet),
		[favoriteModelIdSet],
	);
	const favoriteActiveOptions = useMemo(
		() => {
			const byId = new Map(
				filteredActive.map((option) => [
					normalizeFavoriteModelId(option.modelId),
					option,
				]),
			);
			return favoriteModelIds
				.map((favoriteModelId) => byId.get(favoriteModelId))
				.filter((option): option is ModelOption => Boolean(option));
		},
		[filteredActive, favoriteModelIds],
	);
	const groupedActiveOptions = useMemo(
		() =>
			groupModelsByReleaseMonth(
				filteredActive.filter(
					(option) =>
						!favoriteModelIdSet.has(normalizeFavoriteModelId(option.modelId)),
				),
			),
		[filteredActive, favoriteModelIdSet],
	);
	const groupedComingSoonOptions = useMemo(
		() => groupModelsByReleaseMonth(filteredComingSoonEntries),
		[filteredComingSoonEntries],
	);
	const allModelOptions = useMemo(
		() => [
			...filteredActive,
			...filteredComingSoonEntries,
		],
		[filteredActive, filteredComingSoonEntries],
	);
	const normalizedSearchValue = useMemo(
		() => normalizeSearchText(searchValue),
		[searchValue],
	);
	const hasSearchValue = normalizedSearchValue.length > 0;
	const rankedSearchResults = useMemo(() => {
		if (!hasSearchValue) return [];
		return allModelOptions
			.map((option) => ({
				option,
				score: computeOptionSearchScore(option, normalizedSearchValue),
			}))
			.filter((entry) => entry.score > 0)
			.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				if (a.option.gatewayStatus !== b.option.gatewayStatus) {
					return a.option.gatewayStatus === "active" ? -1 : 1;
				}
				return compareByReleaseDateDesc(a.option, b.option);
			});
	}, [allModelOptions, hasSearchValue, normalizedSearchValue]);
	const comingSoonCount = useMemo(
		() => filteredComingSoonEntries.length,
		[filteredComingSoonEntries],
	);
	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) {
			setSearchValue("");
		}
	};

	return (
		<div className="flex items-center gap-1">
			{selectedModelIds.length > 0 ? (
				<div className="flex max-w-[min(60vw,520px)] items-center gap-1 overflow-x-auto lg:max-w-[760px] xl:max-w-[880px]">
					{selectedModelPreview.map(renderSelectedModelChip)}
					{hiddenSelectedCount > 0 ? (
						<HoverCard openDelay={100} closeDelay={120}>
							<HoverCardTrigger asChild>
								<Badge
									variant="secondary"
									className="h-5 cursor-default rounded-full px-1.5 text-[10px]"
								>
									+{hiddenSelectedCount}
								</Badge>
							</HoverCardTrigger>
							<HoverCardContent className="w-[min(86vw,540px)] p-2">
								<div className="flex max-h-[280px] flex-wrap items-center gap-1 overflow-auto pr-1">
									{hiddenSelectedModelIds.map(renderSelectedModelChip)}
								</div>
							</HoverCardContent>
						</HoverCard>
					) : null}
				</div>
			) : null}

			<ModelSelector open={open} onOpenChange={handleOpenChange}>
				<ModelSelectorTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className={cn(
							"h-8 gap-1.5",
							selectedModelIds.length === 0 ? "px-2 text-xs" : "w-8 px-0",
						)}
					>
						<Plus className="h-4 w-4" />
						{selectedModelIds.length === 0 ? (
							<span className="truncate text-xs">Add Model</span>
						) : null}
					</Button>
				</ModelSelectorTrigger>
				<ModelSelectorContent
					title="Select a model"
					className="w-[min(90vw,960px)] max-w-3xl"
					commandProps={{ shouldFilter: false }}
				>
					<ModelSelectorInput
						placeholder="Search models..."
						value={searchValue}
						onValueChange={setSearchValue}
					/>
					<RoomModelSelectorFilters
						facetOptions={facetOptions}
						filters={filters}
						setFilters={setFilters}
					/>
					<ModelSelectorList className="max-h-[70vh] p-3">
						<ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
						{hasSearchValue ? (
							<ModelSelectorGroup
								heading={`Results (${rankedSearchResults.length})`}
								className="pb-2 [&_[cmdk-group-heading]]:text-foreground [&_[cmdk-group-heading]]:font-semibold"
							>
								{rankedSearchResults.map(({ option }) => (
									<ModelSelectorItem
										key={option.modelId}
										value={option.modelId}
										onSelect={() => {
											onSelectModel(option.modelId);
											setOpen(false);
										}}
										keywords={buildSearchKeywords(option)}
										className={cn(
											"flex min-h-8 items-center gap-2 py-1",
											option.gatewayStatus === "inactive" && "opacity-60",
											selectedModelIds.includes(option.modelId) &&
												"bg-foreground/5",
										)}
									>
										<Logo
											id={option.orgId}
											alt={option.orgName}
											width={16}
											height={16}
											className="shrink-0"
										/>
										{renderModelRow(option, option.gatewayStatus === "inactive")}
									</ModelSelectorItem>
								))}
							</ModelSelectorGroup>
						) : null}
						{!hasSearchValue && favoriteActiveOptions.length > 0 ? (
							<ModelSelectorGroup
								heading="Favourites"
								className="pb-2 [&_[cmdk-group-heading]]:text-foreground [&_[cmdk-group-heading]]:font-semibold"
							>
								{favoriteActiveOptions.map((option) => (
									<ModelSelectorItem
										key={option.modelId}
										value={option.modelId}
										onSelect={() => {
											onSelectModel(option.modelId);
											setOpen(false);
										}}
										keywords={buildSearchKeywords(option)}
										className={cn(
											"flex min-h-8 items-center gap-2 py-1",
											selectedModelIds.includes(option.modelId) &&
												"bg-foreground/5",
										)}
									>
										<Logo
											id={option.orgId}
											alt={option.orgName}
											width={16}
											height={16}
											className="shrink-0"
										/>
										{renderModelRow(option)}
									</ModelSelectorItem>
								))}
							</ModelSelectorGroup>
						) : null}
						{!hasSearchValue &&
							groupedActiveOptions.map((group, index) => (
								<ModelSelectorGroup
									key={`active-${group.heading}-${index}`}
									heading={group.heading}
									className="pb-2 [&_[cmdk-group-heading]]:text-foreground [&_[cmdk-group-heading]]:font-semibold"
								>
									{group.items.map((option) => (
										<ModelSelectorItem
											key={option.modelId}
											value={option.modelId}
											onSelect={() => {
												onSelectModel(option.modelId);
												setOpen(false);
											}}
											keywords={buildSearchKeywords(option)}
											className={cn(
												"flex min-h-8 items-center gap-2 py-1",
												selectedModelIds.includes(option.modelId) &&
													"bg-foreground/5",
											)}
										>
											<Logo
												id={option.orgId}
												alt={option.orgName}
												width={16}
												height={16}
												className="shrink-0"
											/>
											{renderModelRow(option)}
										</ModelSelectorItem>
									))}
								</ModelSelectorGroup>
							))}

						{!hasSearchValue && comingSoonCount > 0 ? (
							<>
								<ModelSelectorSeparator />
								{groupedComingSoonOptions.map((group, index) => (
									<ModelSelectorGroup
										key={`coming-soon-${group.heading}-${index}`}
										heading={`Coming soon · ${group.heading}`}
										className="pb-2"
									>
										{group.items.map((option) => (
											<ModelSelectorItem
												key={option.modelId}
												value={option.modelId}
												onSelect={() => {
													onSelectModel(option.modelId);
													setOpen(false);
												}}
												keywords={buildSearchKeywords(option)}
												className={cn(
													"flex min-h-8 items-center gap-2 py-1 opacity-60",
													selectedModelIds.includes(option.modelId) &&
														"bg-foreground/5",
												)}
											>
												<Logo
													id={option.orgId}
													alt={option.orgName}
													width={16}
													height={16}
													className="shrink-0"
												/>
												{renderModelRow(option, true)}
											</ModelSelectorItem>
										))}
									</ModelSelectorGroup>
								))}
							</>
						) : null}
					</ModelSelectorList>
				</ModelSelectorContent>
			</ModelSelector>
		</div>
	);
}
