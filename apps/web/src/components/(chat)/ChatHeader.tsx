"use client";

import { useCallback, useMemo, useState } from "react";
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSidebar } from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import type { ChatThread, UnifiedChatEndpoint } from "@/lib/indexeddb/chats";
import {
	ChevronLeft,
	ChevronRight,
	Cpu,
	Database,
	MessageCircleDashed,
	Paintbrush,
	Plus,
	Settings,
	Shield,
	X,
} from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

type ModelOption = {
	modelId: string;
	orgId: string;
	orgName: string;
	label: string;
	capabilityEndpoints: UnifiedChatEndpoint[];
	providerIds: string[];
	providerNames: string[];
	providerAvailability: Record<string, boolean>;
	releaseDate: string | null;
	gatewayStatus: "active" | "inactive";
};

type ModelOptions = {
	featured: ModelOption[];
	grouped: Map<string, ModelOption[]>;
	comingSoon: Map<string, ModelOption[]>;
};

type PersonalizationSettings = {
	name: string;
	role: string;
	notes: string;
	accentColor: string;
};

const ACCENT_COLORS = [
	{ label: "Charcoal", value: "#111111" },
	{ label: "Slate", value: "#334155" },
	{ label: "Indigo", value: "#4338ca" },
	{ label: "Emerald", value: "#047857" },
	{ label: "Cyan", value: "#0e7490" },
	{ label: "Orange", value: "#c2410c" },
	{ label: "Rose", value: "#be123c" },
	{ label: "Amber", value: "#b45309" },
];

const MAX_PROVIDER_LOGOS = 8;
const CAPABILITY_LABELS: Record<UnifiedChatEndpoint, string> = {
	responses: "Text",
	"images.generations": "Image",
	"video.generation": "Video",
	"audio.speech": "Audio",
	"audio.transcription": "Transcription",
	"audio.translation": "Translation",
	moderations: "Moderation",
	embeddings: "Embeddings",
};

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

const isNewModel = (releaseDate: string | null): boolean => {
	if (!releaseDate) return false;
	const release = new Date(releaseDate);
	const now = new Date();
	const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
	return release >= twoWeeksAgo;
};

type ChatHeaderProps = {
	activeThread: ChatThread | null;
	modelOptions: ModelOptions;
	modelPickerOpen: boolean;
	onModelPickerOpenChange: (open: boolean) => void;
	onUpdateModel: (modelId: string) => void;
	temporaryMode: boolean;
	onToggleTemporaryMode: () => void;
	onOpenModelSettings: () => void;
	settingsOpen: boolean;
	onSettingsOpenChange: (open: boolean) => void;
	baseUrl: string;
	onBaseUrlChange: (value: string) => void;
	onSaveSettings: () => void;
	personalization: PersonalizationSettings;
	onPersonalizationChange: (next: PersonalizationSettings) => void;
	onExportChats: () => void;
	isAdmin: boolean;
	debugEnabled: boolean;
	onDebugChange: (value: boolean) => void;
	allowModelCompare?: boolean;
	compareModelIds?: string[];
	onCompareModelIdsChange?: (ids: string[]) => void;
	onRemoveModel?: (modelId: string) => void;
	onRemoveAllModels?: () => void;
	onOpenModelSettingsForModel?: (modelId: string) => void;
	modelDisplayNameById?: Record<string, string>;
	modelEnabledById?: Record<string, boolean>;
	modelCapabilitiesById?: Record<string, UnifiedChatEndpoint[]>;
	modelSupportsAudioInputById?: Record<string, boolean>;
	requiredCapability?: UnifiedChatEndpoint | null;
	requireAudioInput?: boolean;
};

function formatOrgLabel(orgId: string) {
	return orgId.replace(/-/g, " ");
}

function getOrgId(modelId: string) {
	const [org] = modelId.split("/");
	return org || "ai-stats";
}

export function ChatHeader({
	activeThread,
	modelOptions,
	modelPickerOpen,
	onModelPickerOpenChange,
	onUpdateModel,
	temporaryMode,
	onToggleTemporaryMode,
	onOpenModelSettings,
	settingsOpen,
	onSettingsOpenChange,
	onSaveSettings,
	personalization,
	onPersonalizationChange,
	onExportChats,
	isAdmin,
	debugEnabled,
	onDebugChange,
	allowModelCompare = false,
	compareModelIds = [],
	onCompareModelIdsChange,
	onRemoveModel,
	onRemoveAllModels,
	onOpenModelSettingsForModel,
	modelDisplayNameById,
	modelEnabledById,
	modelCapabilitiesById,
	modelSupportsAudioInputById,
	requiredCapability = null,
	requireAudioInput = false,
}: ChatHeaderProps) {
	const { toggleSidebar, state: sidebarState } = useSidebar();
	const [settingsTab, setSettingsTab] = useState<
		"personalization" | "data-controls" | "admin"
	>("personalization");
	const [modelSearchValue, setModelSearchValue] = useState("");
	const [quickFilters, setQuickFilters] = useState({
		free: false,
		new: false,
	});
	const [importResult, setImportResult] = useState<{
		message: string;
		type: "success" | "error" | "info";
	} | null>(null);
	const groupedEntries = useMemo(
		() => Array.from(modelOptions.grouped.entries()),
		[modelOptions.grouped]
	);
	const comingSoonEntries = useMemo(
		() => Array.from(modelOptions.comingSoon.entries()),
		[modelOptions.comingSoon]
	);
	const toggleQuickFilter = (key: "free" | "new") => {
		setQuickFilters((prev) => ({ ...prev, [key]: !prev[key] }));
	};
	const optionMatchesQuickFilters = useCallback(
		(option: ModelOption) => {
			if (quickFilters.free && !option.modelId.endsWith(":free")) {
				return false;
			}
			if (quickFilters.new && !isNewModel(option.releaseDate)) {
				return false;
			}
			return true;
		},
		[quickFilters.free, quickFilters.new]
	);
	const filteredFeatured = useMemo(
		() => modelOptions.featured.filter(optionMatchesQuickFilters),
		[modelOptions.featured, optionMatchesQuickFilters]
	);
	const filteredGroupedEntries = useMemo(
		() =>
			groupedEntries
				.map(([orgId, options]) => [
					orgId,
					options.filter(optionMatchesQuickFilters),
				] as const)
				.filter(([, options]) => options.length > 0),
		[groupedEntries, optionMatchesQuickFilters]
	);
	const filteredComingSoonEntries = useMemo(
		() =>
			comingSoonEntries
				.map(([orgId, options]) => [
					orgId,
					options.filter(optionMatchesQuickFilters),
				] as const)
				.filter(([, options]) => options.length > 0),
		[comingSoonEntries, optionMatchesQuickFilters]
	);
	const comingSoonCount = useMemo(
		() =>
			filteredComingSoonEntries.reduce(
				(total, [, list]) => total + list.length,
				0
			),
		[filteredComingSoonEntries]
	);
	const allModelOptions = useMemo(
		() => [
			...filteredFeatured,
			...filteredGroupedEntries.flatMap(([, options]) => options),
			...filteredComingSoonEntries.flatMap(([, options]) => options),
		],
		[filteredComingSoonEntries, filteredFeatured, filteredGroupedEntries]
	);
	const uniqueModelOptions = useMemo(() => {
		const byId = new Map<string, ModelOption>();
		for (const option of allModelOptions) {
			const existing = byId.get(option.modelId);
			if (!existing) {
				byId.set(option.modelId, {
					...option,
					capabilityEndpoints: [...option.capabilityEndpoints],
					providerIds: [...option.providerIds],
					providerNames: [...option.providerNames],
					providerAvailability: { ...option.providerAvailability },
				});
				continue;
			}
			for (const endpoint of option.capabilityEndpoints) {
				if (!existing.capabilityEndpoints.includes(endpoint)) {
					existing.capabilityEndpoints.push(endpoint);
				}
			}
			for (const providerId of option.providerIds) {
				if (!existing.providerIds.includes(providerId)) {
					existing.providerIds.push(providerId);
				}
			}
			for (const providerName of option.providerNames) {
				if (!existing.providerNames.includes(providerName)) {
					existing.providerNames.push(providerName);
				}
			}
			for (const [providerId, isAvailable] of Object.entries(
				option.providerAvailability,
			)) {
				existing.providerAvailability[providerId] =
					Boolean(existing.providerAvailability[providerId]) || Boolean(isAvailable);
			}
			if (
				existing.gatewayStatus !== "active" &&
				option.gatewayStatus === "active"
			) {
				existing.gatewayStatus = "active";
			}
			if (!existing.releaseDate && option.releaseDate) {
				existing.releaseDate = option.releaseDate;
			}
		}
		return Array.from(byId.values());
	}, [allModelOptions]);
	const selectedModelIds = useMemo(() => {
		const ids: string[] = [];
		if (activeThread?.modelId) {
			ids.push(activeThread.modelId);
		}
		for (const id of compareModelIds ?? []) {
			if (!id || id === activeThread?.modelId) continue;
			ids.push(id);
		}
		return Array.from(new Set(ids));
	}, [activeThread?.modelId, compareModelIds]);
	const selectedModelPreview = selectedModelIds.slice(0, 5);
	const hiddenSelectedCount = Math.max(
		0,
		selectedModelIds.length - selectedModelPreview.length,
	);
	const hiddenSelectedModelIds = useMemo(
		() => selectedModelIds.slice(selectedModelPreview.length),
		[selectedModelIds, selectedModelPreview.length],
	);
	const compareModelIdSet = useMemo(
		() =>
			new Set(
				selectedModelIds.filter((id) => id !== activeThread?.modelId),
			),
		[selectedModelIds, activeThread?.modelId],
	);
	const selectedModelLabelById = useMemo(() => {
		const labelById = new Map<string, string>();
		for (const option of modelOptions.featured) {
			labelById.set(option.modelId, option.label);
		}
		for (const list of modelOptions.grouped.values()) {
			for (const option of list) {
				labelById.set(option.modelId, option.label);
			}
		}
		for (const list of modelOptions.comingSoon.values()) {
			for (const option of list) {
				labelById.set(option.modelId, option.label);
			}
		}
		return labelById;
	}, [modelOptions.featured, modelOptions.grouped, modelOptions.comingSoon]);
	const selectedModelOrgIdById = useMemo(() => {
		const orgIdById = new Map<string, string>();
		for (const option of modelOptions.featured) {
			orgIdById.set(option.modelId, option.orgId);
		}
		for (const list of modelOptions.grouped.values()) {
			for (const option of list) {
				orgIdById.set(option.modelId, option.orgId);
			}
		}
		for (const list of modelOptions.comingSoon.values()) {
			for (const option of list) {
				orgIdById.set(option.modelId, option.orgId);
			}
		}
		return orgIdById;
	}, [modelOptions.featured, modelOptions.grouped, modelOptions.comingSoon]);
	const getModelCapabilities = (modelId: string): UnifiedChatEndpoint[] =>
		modelCapabilitiesById?.[modelId] ?? ["responses"];
	const supportsModelAudioInput = (modelId: string) =>
		modelSupportsAudioInputById?.[modelId] === true;
	const isModelCapabilityCompatible = (modelId: string) =>
		(!requiredCapability ||
			getModelCapabilities(modelId).includes(requiredCapability)) &&
		(!requireAudioInput || supportsModelAudioInput(modelId));
	const getIncompatibleCapabilityLabel = (modelId: string) => {
		if (requireAudioInput && !supportsModelAudioInput(modelId)) {
			return "Audio input";
		}
		const labels = Array.from(
			new Set(
				getModelCapabilities(modelId).map(
					(capability) => CAPABILITY_LABELS[capability] ?? "Text",
				),
			),
		);
		if (labels.length === 0) return "Text";
		if (labels.length === 1) return labels[0];
		return labels.slice(0, 2).join("/");
	};
	const handleModelSelect = (modelId: string) => {
		if (!isModelCapabilityCompatible(modelId)) {
			return;
		}
		if (!allowModelCompare) {
			onUpdateModel(modelId);
			onModelPickerOpenChange(false);
			return;
		}
		if (!activeThread?.modelId) {
			onUpdateModel(modelId);
			return;
		}
		if (activeThread.modelId === modelId) {
			if (selectedModelIds.length > 0) {
				onRemoveModel?.(modelId);
			}
			return;
		}
		if (!onCompareModelIdsChange) {
			onUpdateModel(modelId);
			return;
		}
		const nextSet = new Set(compareModelIdSet);
		if (nextSet.has(modelId)) {
			nextSet.delete(modelId);
		} else {
			nextSet.add(modelId);
		}
		onCompareModelIdsChange(Array.from(nextSet));
	};
	const handleModelPickerDialogOpenChange = (open: boolean) => {
		onModelPickerOpenChange(open);
		if (!open) {
			setModelSearchValue("");
		}
	};
	const handleRemoveModel = (modelId: string) => {
		onRemoveModel?.(modelId);
	};
	const handleOpenModelSettings = (modelId: string) => {
		if (onOpenModelSettingsForModel) {
			onOpenModelSettingsForModel(modelId);
			return;
		}
		onOpenModelSettings();
	};
	const renderSelectedModelChip = (modelId: string) => {
		const orgId = selectedModelOrgIdById.get(modelId) ?? getOrgId(modelId);
		const baseLabel = (selectedModelLabelById.get(modelId) ?? modelId).split(
			":",
		)[0];
		const label = modelDisplayNameById?.[modelId]?.trim() || baseLabel;
		const modelEnabled = modelEnabledById?.[modelId] !== false;
		const canRemoveModel = Boolean(onRemoveModel);
		return (
			<div key={modelId} className="relative shrink-0">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => handleOpenModelSettings(modelId)}
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
						className="shrink-0 rounded-none"
					/>
					<span className="truncate text-xs">{label}</span>
				</Button>
				{canRemoveModel ? (
					<ContextMenu>
						<ContextMenuTrigger asChild>
							<button
								type="button"
								className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
								onClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									handleRemoveModel(modelId);
								}}
								aria-label={`Remove ${label}`}
							>
								<X className="h-3.5 w-3.5" />
							</button>
						</ContextMenuTrigger>
						<ContextMenuContent>
							<ContextMenuItem
								onClick={(event) => {
									event.preventDefault();
									handleRemoveModel(modelId);
								}}
							>
								Remove
							</ContextMenuItem>
							<ContextMenuItem
								onClick={(event) => {
									event.preventDefault();
									onRemoveAllModels?.();
								}}
								className="text-destructive focus:text-destructive"
							>
								Remove all
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				) : null}
			</div>
		);
	};
	const normalizeSearch = (value: string) =>
		value
			.toLowerCase()
			.replace(/[\s._-]+/g, " ")
			.replace(/[^a-z0-9 ]/g, "")
			.trim();
	const buildSearchKeywords = (option: ModelOption) => {
		const modelId = option.modelId;
		const dotted = modelId.replace(/-/g, ".");
		const dashed = modelId.replace(/\./g, "-");
		const compact = modelId.replace(/[\s._-]+/g, "");
		return Array.from(
			new Set(
				[
					option.modelId,
					option.label,
					option.orgId,
					dotted,
					dashed,
					compact,
					normalizeSearch(modelId),
					normalizeSearch(option.label),
				].filter(Boolean)
			)
		);
	};
	const computeModelSearchScore = (option: ModelOption, query: string) => {
		const normalizedQuery = normalizeSearch(query);
		if (!normalizedQuery) return 0;

		const modelId = normalizeSearch(option.modelId);
		const label = normalizeSearch(option.label);
		const orgName = normalizeSearch(option.orgName);
		const orgId = normalizeSearch(option.orgId);
		const providerIds = option.providerIds.map((providerId) =>
			normalizeSearch(providerId),
		);
		const providerNames = option.providerNames.map((providerName) =>
			normalizeSearch(providerName),
		);
		const terms = normalizedQuery.split(/\s+/).filter(Boolean);
		const haystack = [modelId, label, orgName, orgId, ...providerIds, ...providerNames]
			.join(" ")
			.trim();
		if (terms.length > 1 && !terms.every((term) => haystack.includes(term))) {
			return 0;
		}
		if (terms.length === 1 && !haystack.includes(terms[0])) {
			return 0;
		}

		let score = 0;
		if (modelId === normalizedQuery) score += 2200;
		if (label === normalizedQuery) score += 2000;
		if (modelId.startsWith(normalizedQuery)) score += 1400;
		if (label.startsWith(normalizedQuery)) score += 1300;
		if (orgName.startsWith(normalizedQuery) || orgId.startsWith(normalizedQuery)) {
			score += 920;
		}
		if (
			providerNames.some((providerName) =>
				providerName.startsWith(normalizedQuery),
			)
		) {
			score += 900;
		}
		if (
			providerIds.some((providerId) => providerId.startsWith(normalizedQuery))
		) {
			score += 880;
		}
		if (modelId.includes(normalizedQuery)) score += 760;
		if (label.includes(normalizedQuery)) score += 700;
		if (orgName.includes(normalizedQuery) || orgId.includes(normalizedQuery)) {
			score += 520;
		}
		if (
			providerNames.some((providerName) =>
				providerName.includes(normalizedQuery),
			) ||
			providerIds.some((providerId) => providerId.includes(normalizedQuery))
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
	};
	const normalizedModelSearchValue = useMemo(
		() => normalizeSearch(modelSearchValue),
		[modelSearchValue],
	);
	const hasModelSearchValue = normalizedModelSearchValue.length > 0;
	const searchRanking = useMemo(() => {
		if (!hasModelSearchValue) {
			return { total: 0, results: [] as Array<{ option: ModelOption; score: number }> };
		}
		const scored = uniqueModelOptions
			.map((option) => ({
				option,
				score: computeModelSearchScore(option, normalizedModelSearchValue),
			}))
			.filter((entry) => entry.score > 0)
			.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				if (a.option.gatewayStatus !== b.option.gatewayStatus) {
					return a.option.gatewayStatus === "active" ? -1 : 1;
				}
				return a.option.label.localeCompare(b.option.label);
			});
		return { total: scored.length, results: scored.slice(0, 25) };
	}, [hasModelSearchValue, normalizedModelSearchValue, uniqueModelOptions]);
	const searchResultTotalCount = searchRanking.total;
	const rankedSearchResults = searchRanking.results;
	const formatReleaseDate = (value: string | null) => {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};
	const renderProviderLogos = (option: ModelOption) => {
		const providerNameById = new Map(
			option.providerIds.map((providerId, index) => [
				providerId,
				option.providerNames[index] ?? formatOrgLabel(providerId),
			])
		);
		const providers = [...option.providerIds].sort((a, b) => {
			const aActive = Boolean(option.providerAvailability?.[a]);
			const bActive = Boolean(option.providerAvailability?.[b]);
			if (aActive !== bActive) return aActive ? -1 : 1;
			const aName = providerNameById.get(a) ?? a;
			const bName = providerNameById.get(b) ?? b;
			return aName.localeCompare(bName);
		});
		const visible = providers.slice(0, MAX_PROVIDER_LOGOS);
		const hiddenCount = Math.max(0, providers.length - visible.length);
		return (
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<div className="flex items-center">
					{visible.map((providerId) => (
						<Logo
							key={providerId}
							id={providerId}
							alt={providerId}
							width={18}
							height={18}
							className={cn(
								"shrink-0 rounded-none",
								option.providerAvailability?.[providerId]
									? null
									: "grayscale opacity-60"
							)}
						/>
					))}
				</div>
				{hiddenCount > 0 && (
					<span className="pl-2">+{hiddenCount}</span>
				)}
			</div>
		);
	};
	const isModelSelected = (modelId: string) =>
		activeThread?.modelId === modelId || compareModelIdSet.has(modelId);
	const isModelDisabledForPicker = (
		option: ModelOption,
		withComingSoonBadge = false,
	) =>
		withComingSoonBadge ||
		option.gatewayStatus === "inactive" ||
		!isModelCapabilityCompatible(option.modelId);
	const renderModelOptionContent = (
		option: ModelOption,
		withComingSoonBadge = false,
	) => (
		<div className="flex min-w-0 flex-1 items-center gap-2">
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<span className="truncate text-sm font-medium">
					{option.label.split(":")[0]}
				</span>
				{option.modelId.includes(":") ? (
					<Badge {...getModelBadgeProps(option.modelId.split(":")[1])}>
						{option.modelId.split(":")[1].replace(/^free$/, "Free")}
					</Badge>
				) : null}
				{isNewModel(option.releaseDate) ? (
					<Badge {...getModelBadgeProps("new")}>New</Badge>
				) : null}
				{isModelSelected(option.modelId) ? (
					<Badge variant="secondary" className="text-[10px] px-1.5 py-0">
						Selected
					</Badge>
				) : null}
				{withComingSoonBadge ? (
					<Badge
						variant="outline"
						className="h-4 rounded-full border-dashed px-1.5 text-[10px] font-medium"
					>
						Coming soon
					</Badge>
				) : null}
				{!isModelCapabilityCompatible(option.modelId) ? (
					<Badge variant="outline" className="text-[10px] px-1.5 py-0">
						{getIncompatibleCapabilityLabel(option.modelId)} only
					</Badge>
				) : null}
			</div>
			{renderProviderLogos(option)}
		</div>
	);
	const renderModelOptionItem = (
		option: ModelOption,
		options?: { withComingSoonBadge?: boolean },
	) => {
		const withComingSoonBadge = options?.withComingSoonBadge ?? false;
		const isDisabled = isModelDisabledForPicker(option, withComingSoonBadge);
		return (
			<ModelSelectorItem
				key={option.modelId}
				value={option.modelId}
				onSelect={() => {
					handleModelSelect(option.modelId);
				}}
				keywords={buildSearchKeywords(option)}
				className={cn(
					"flex items-center gap-3",
					isDisabled && "opacity-60",
					isModelSelected(option.modelId) && "bg-foreground/5",
				)}
				disabled={isDisabled}
			>
				<Logo
					id={option.orgId}
					alt={option.orgId}
					width={18}
					height={18}
					className={cn(
						"shrink-0 rounded-none",
						option.gatewayStatus === "inactive" && "grayscale",
					)}
				/>
				{renderModelOptionContent(option, withComingSoonBadge)}
			</ModelSelectorItem>
		);
	};

	return (
		<header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-3 md:px-5">
			<div className="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="group -ml-1"
							onClick={toggleSidebar}
						>
							<ChevronRight
								className={`h-5 w-5 transition-transform duration-200 ${
									sidebarState === "expanded"
										? "rotate-180 group-hover:-translate-x-1"
										: "group-hover:translate-x-1"
								}`}
							/>
						</Button>
					</TooltipTrigger>
					<TooltipContent
						side={sidebarState === "collapsed" ? "right" : "bottom"}
						align="center"
						sideOffset={8}
					>
						Toggle sidebar
					</TooltipContent>
				</Tooltip>
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
								<HoverCardContent
									side="bottom"
									align="start"
									className="w-[min(86vw,540px)] p-2"
								>
									<div className="flex max-h-[280px] flex-wrap items-center gap-1 overflow-auto pr-1">
										{hiddenSelectedModelIds.map(
											renderSelectedModelChip,
										)}
									</div>
								</HoverCardContent>
							</HoverCard>
						) : null}
					</div>
				) : null}
				<ModelSelector
					open={modelPickerOpen}
					onOpenChange={handleModelPickerDialogOpenChange}
				>
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
							value={modelSearchValue}
							onValueChange={setModelSearchValue}
						/>
						<div className="flex items-center gap-1 border-b border-border px-3 py-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => toggleQuickFilter("free")}
								className={cn(
									"h-7 rounded-md px-2.5 text-xs",
									quickFilters.free &&
										"border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background",
								)}
							>
								Free
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => toggleQuickFilter("new")}
								className={cn(
									"h-7 rounded-md px-2.5 text-xs",
									quickFilters.new &&
										"border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background",
								)}
							>
								New
							</Button>
						</div>
						<ModelSelectorList className="max-h-[70vh] p-3">
							<ModelSelectorEmpty>
								No models found.
							</ModelSelectorEmpty>
							{hasModelSearchValue ? (
								<ModelSelectorGroup
									heading={`Results (${Math.min(25, searchResultTotalCount)}${searchResultTotalCount > 25 ? ` of ${searchResultTotalCount}` : ""})`}
									className="pb-2 [&_[cmdk-group-heading]]:text-foreground [&_[cmdk-group-heading]]:font-semibold"
								>
									{rankedSearchResults.map(({ option }) =>
										renderModelOptionItem(option, {
											withComingSoonBadge: option.gatewayStatus === "inactive",
										}),
									)}
								</ModelSelectorGroup>
							) : null}
							{!hasModelSearchValue && filteredFeatured.length > 0 && (
								<>
									<ModelSelectorGroup
										heading="Featured"
										className="pb-2 [&_[cmdk-group-heading]]:text-foreground [&_[cmdk-group-heading]]:font-semibold"
									>
										{filteredFeatured.map((option) =>
											renderModelOptionItem(option),
										)}
									</ModelSelectorGroup>
									<ModelSelectorSeparator />
								</>
							)}
							{!hasModelSearchValue &&
								filteredGroupedEntries.map(([orgId, options]) => {
									const orgLabel =
										options[0]?.orgName ?? formatOrgLabel(orgId);
									return (
										<ModelSelectorGroup
											key={orgId}
											heading={orgLabel}
											className="pb-2"
										>
											{options.map((option) =>
												renderModelOptionItem(option),
											)}
										</ModelSelectorGroup>
									);
								})}
							{!hasModelSearchValue && comingSoonCount > 0 && (
								<>
									<ModelSelectorSeparator />
									{filteredComingSoonEntries.map(([orgId, options]) => {
										const orgLabel =
											options[0]?.orgName ?? formatOrgLabel(orgId);
										return (
											<ModelSelectorGroup
												key={`coming-soon-${orgId}`}
												heading={`${orgLabel} - Coming Soon`}
												className="pb-2"
											>
												{options.map((option) =>
													renderModelOptionItem(option, {
														withComingSoonBadge: true,
													}),
												)}
											</ModelSelectorGroup>
										);
									})}
								</>
							)}
						</ModelSelectorList>
					</ModelSelectorContent>
				</ModelSelector>
			</div>
			<div className="flex items-center gap-2">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant={temporaryMode ? "secondary" : "ghost"}
							size="icon"
							onClick={onToggleTemporaryMode}
						>
							<MessageCircleDashed className="h-4 w-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Temporary chat</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => onSettingsOpenChange(true)}
						>
							<Settings className="h-5 w-5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Settings</TooltipContent>
				</Tooltip>
				<Dialog open={settingsOpen} onOpenChange={onSettingsOpenChange}>
					<DialogContent className="overflow-hidden p-0 md:max-h-[520px] md:max-w-[760px] lg:max-w-[820px]">
						<DialogTitle className="sr-only">Settings</DialogTitle>
						<DialogDescription className="sr-only">
							Chat settings and diagnostics.
						</DialogDescription>
						<div className="flex h-[520px] flex-1 overflow-hidden">
							<div className="hidden w-52 shrink-0 flex-col border-r border-border p-2 md:flex">
								<Button
									variant={
										settingsTab === "personalization"
											? "secondary"
											: "ghost"
									}
									className="w-full justify-start gap-2"
									onClick={() =>
										setSettingsTab("personalization")
									}
								>
									<Paintbrush className="h-4 w-4" />
									Personalization
								</Button>
								<Button
									variant={
										settingsTab === "data-controls"
											? "secondary"
											: "ghost"
									}
									className="w-full justify-start gap-2"
									onClick={() => {
										setSettingsTab("data-controls");
										setImportResult(null);
									}}
								>
									<Database className="h-4 w-4" />
									Data Controls
								</Button>
								{isAdmin && (
									<Button
										variant={
											settingsTab === "admin"
												? "secondary"
												: "ghost"
										}
										className="w-full justify-start gap-2"
										onClick={() => setSettingsTab("admin")}
									>
										<Shield className="h-4 w-4" />
										Admin
									</Button>
								)}
							</div>
							<div className="flex flex-1 flex-col overflow-hidden">
								<div className="flex items-center gap-2 border-b border-border px-4 py-3 md:hidden">
									<Button
										size="sm"
										variant={
											settingsTab === "personalization"
												? "secondary"
												: "ghost"
										}
										onClick={() =>
											setSettingsTab("personalization")
										}
									>
										Personalization
									</Button>
									<Button
										size="sm"
										variant={
											settingsTab === "data-controls"
												? "secondary"
												: "ghost"
										}
										onClick={() => {
											setSettingsTab("data-controls");
											setImportResult(null);
										}}
									>
										Data Controls
									</Button>
									{isAdmin && (
										<Button
											size="sm"
											variant={
												settingsTab === "admin"
													? "secondary"
													: "ghost"
											}
											onClick={() =>
												setSettingsTab("admin")
											}
										>
											Admin
										</Button>
									)}
								</div>
								<div className="flex-1 overflow-y-auto p-4">
									{settingsTab === "personalization" && (
										<div className="grid gap-3">
											<div className="grid gap-1">
												<p className="text-sm font-semibold text-foreground">
													Personalization
												</p>
												<p className="text-xs text-muted-foreground">
													Stored locally and applied
													to your system prompt.
												</p>
											</div>
											<div className="grid gap-2">
												<Label htmlFor="personal-name">
													Name
												</Label>
												<Input
													id="personal-name"
													value={personalization.name}
													onChange={(event) =>
														onPersonalizationChange(
															{
																...personalization,
																name: event
																	.target
																	.value,
															}
														)
													}
													placeholder="Jane Doe"
												/>
											</div>
											<div className="grid gap-2">
												<Label htmlFor="personal-role">
													Role
												</Label>
												<Input
													id="personal-role"
													value={personalization.role}
													onChange={(event) =>
														onPersonalizationChange(
															{
																...personalization,
																role: event
																	.target
																	.value,
															}
														)
													}
													placeholder="Product manager"
												/>
											</div>
											<div className="grid gap-2">
												<Label htmlFor="personal-notes">
													Notes
												</Label>
												<Textarea
													id="personal-notes"
													value={
														personalization.notes
													}
													onChange={(event) =>
														onPersonalizationChange(
															{
																...personalization,
																notes: event
																	.target
																	.value,
															}
														)
													}
													placeholder="I like short, actionable responses."
													rows={3}
												/>
											</div>
											<div className="grid gap-2">
												<Label htmlFor="accent-color">
													Accent color
												</Label>
												<Select
													value={
														personalization.accentColor
													}
													onValueChange={(value) =>
														onPersonalizationChange(
															{
																...personalization,
																accentColor:
																	value,
															}
														)
													}
												>
													<SelectTrigger id="accent-color">
														<SelectValue placeholder="Select a color" />
													</SelectTrigger>
													<SelectContent>
														{ACCENT_COLORS.map(
															(color) => (
																<SelectItem
																	key={
																		color.value
																	}
																	value={
																		color.value
																	}
																>
																	<span className="flex items-center gap-2">
																		<span
																			className="h-3 w-3 rounded-full border border-border"
																			style={{
																				backgroundColor:
																					color.value,
																			}}
																		/>
																		{
																			color.label
																		}
																	</span>
																</SelectItem>
															)
														)}
													</SelectContent>
												</Select>
											</div>
										</div>
									)}
									{settingsTab === "data-controls" && (
										<div className="grid gap-3">
											<div className="grid gap-1">
												<p className="text-sm font-semibold text-foreground">
													Data Controls
												</p>
												<p className="text-xs text-muted-foreground">
													Import and export chat data
													stored locally in your browser.
												</p>
											</div>
											<div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
												<div>
													<p className="text-sm font-medium text-foreground">
														Export chats
													</p>
													<p className="text-xs text-muted-foreground">
														Download all chats stored in this browser.
													</p>
												</div>
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={onExportChats}
												>
													Export
												</Button>
											</div>
											<div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
												<div>
													<p className="text-sm font-medium text-foreground">
														Import chats
													</p>
													<p className="text-xs text-muted-foreground">
														Upload a previously exported chat file.
													</p>
												</div>
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => {
														const input = document.createElement('input');
														input.type = 'file';
														input.accept = '.json';
														input.onchange = async (event) => {
															const file = (event.target as HTMLInputElement).files?.[0];
															if (!file) return;

															setImportResult(null); // Clear previous result

															try {
																const text = await file.text();
																const data = JSON.parse(text);

																if (!data.chats || !Array.isArray(data.chats)) {
																	throw new Error("Invalid file format. Expected { chats: [...] }");
																}

																const { upsertChat } = await import("@/lib/indexeddb/chats");
																const chats: any[] = data.chats;
																let importedCount = 0;
																let skippedCount = 0;
																const skippedReasons: string[] = [];

																// Validate and import each chat individually
																for (let i = 0; i < chats.length; i++) {
																	const chat = chats[i];
																	let isValid = true;
																	const reasons: string[] = [];

																	if (!chat.id || typeof chat.id !== 'string') {
																		isValid = false;
																		reasons.push('missing or invalid id');
																	}
																	if (!chat.title || typeof chat.title !== 'string') {
																		isValid = false;
																		reasons.push('missing or invalid title');
																	}
																	if (!chat.modelId || typeof chat.modelId !== 'string') {
																		isValid = false;
																		reasons.push('missing or invalid modelId');
																	}
																	if (!chat.createdAt || typeof chat.createdAt !== 'string') {
																		isValid = false;
																		reasons.push('missing or invalid createdAt');
																	}
																	if (!chat.updatedAt || typeof chat.updatedAt !== 'string') {
																		isValid = false;
																		reasons.push('missing or invalid updatedAt');
																	}
																	if (!Array.isArray(chat.messages)) {
																		isValid = false;
																		reasons.push('missing or invalid messages array');
																	}
																	if (!chat.settings || typeof chat.settings !== 'object') {
																		isValid = false;
																		reasons.push('missing or invalid settings');
																	}

																	if (isValid) {
																		try {
																			await upsertChat(chat);
																			importedCount++;
																		} catch (error) {
																			skippedCount++;
																			skippedReasons.push(`Chat ${i + 1}: Failed to save - ${error instanceof Error ? error.message : 'Unknown error'}`);
																		}
																	} else {
																		skippedCount++;
																		skippedReasons.push(`Chat ${i + 1}: ${reasons.join(', ')}`);
																	}
																}

																if (importedCount > 0) {
																	setImportResult({
																		message: `Successfully imported ${importedCount} chats${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`,
																		type: "success"
																	});
																	// Refresh the page to show imported chats
																	setTimeout(() => window.location.reload(), 1500);
																} else if (skippedCount > 0) {
																	setImportResult({
																		message: `All ${skippedCount} chats were invalid and skipped`,
																		type: "error"
																	});
																} else {
																	setImportResult({
																		message: "No chats found in file",
																		type: "info"
																	});
																}

																if (skippedCount > 0) {
																	console.warn("Skipped chats:", skippedReasons);
																}
															} catch (error) {
																console.error("Import error:", error);
																setImportResult({
																	message: `Import failed: ${error instanceof Error ? error.message : "Unknown error"}`,
																	type: "error"
																});
															}
														};
														input.click();
													}}
												>
													Import
												</Button>
											</div>
											{importResult && (
												<div className={`rounded-lg border px-3 py-3 ${
													importResult.type === 'success' 
														? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
														: importResult.type === 'error'
														? 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
														: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200'
												}`}>
													<p className="text-sm font-medium">
														{importResult.message}
													</p>
												</div>
											)}
										</div>
									)}
									{settingsTab === "admin" && isAdmin && (
										<div className="grid gap-3">
											<div className="grid gap-1">
												<p className="text-sm font-semibold text-foreground">
													Admin
												</p>
												<p className="text-xs text-muted-foreground">
													Diagnostic settings for
													debugging gateway issues.
												</p>
											</div>
											<div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
												<div>
													<p className="text-sm font-medium">
														Debug mode
													</p>
													<p className="text-xs text-muted-foreground">
														Send `x-gateway-debug`
														headers.
													</p>
												</div>
												<Switch
													checked={debugEnabled}
													onCheckedChange={
														onDebugChange
													}
												/>
											</div>
										</div>
									)}
								</div>
								<div className="border-t border-border px-4 py-3">
									<div className="flex justify-end">
										<Button onClick={onSaveSettings}>
											Save
										</Button>
									</div>
								</div>
							</div>
						</div>
						<div className="flex justify-end">
							<Button onClick={onSaveSettings}>Save</Button>
						</div>
					</DialogContent>
				</Dialog>
			</div>
		</header>
	);
}
